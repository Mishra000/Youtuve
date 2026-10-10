/**
 * comment.js — Advanced Multilingual Commenting, Translation & Moderation Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete implementation of TASK 6:
 *  - Multilingual comments, language detection (Hindi, Punjabi, English, etc.)
 *  - On-demand translation with multi-provider fallback & MongoDB caching
 *  - Safe link handling, XSS protection, anti-flooding, spam scoring
 *  - Multilingual profanity blocking with friendly error message
 *  - 15-minute configurable edit limit, optimistic concurrency (versioning)
 *  - Edit history tracking (admin accessible & owner accessible)
 *  - Soft delete for parent comments with replies ("[Comment deleted]")
 *  - @Mentions with autocomplete search & notification integration
 *  - Likes/dislikes consistency (no simultaneous reactions, no auto-delete on dislikes)
 *  - Sorting: Newest, Oldest, Most liked, Most relevant (explainable algorithm)
 *  - Reporting system, duplicate report prevention, admin moderation & audit logs
 */

import mongoose from "mongoose";
import Comment, {
  CommentReaction,
  CommentReport,
  CommentModerationLog,
  CommentTranslation,
  CommentHistory,
} from "../Modals/comment.js";
import User from "../Modals/Auth.js";
import { containsProfanity } from "../config/profanityList.js";
import { detectLanguage } from "../utils/languageDetection.js";
import { getOrTranslateComment } from "../utils/translationService.js";
import { verifyCaptcha } from "../utils/captchaService.js";
import { sendMentionNotification, sendReplyNotification } from "../utils/notificationService.js";

// ─────────────────────────────────────────────
// CONFIGURATION (Configurable via environment variables)
// ─────────────────────────────────────────────
export const COMMENT_EDIT_LIMIT_MINUTES = parseInt(process.env.COMMENT_EDIT_TIME_LIMIT_MINUTES || "15", 10);
export const MAX_COMMENTS_PER_MINUTE   = parseInt(process.env.COMMENTS_PER_MINUTE || "5", 10);
export const MAX_COMMENTS_PER_5_MIN    = 12;
export const MAX_COMMENTS_PER_HOUR     = parseInt(process.env.COMMENTS_PER_HOUR || "30", 10);
export const DUPLICATE_WINDOW_MINUTES  = parseInt(process.env.DUPLICATE_COMMENT_WINDOW_MINUTES || "5", 10);
export const SUSPICIOUS_ATTEMPTS_BEFORE_CAPTCHA = parseInt(process.env.SUSPICIOUS_ATTEMPTS_BEFORE_CAPTCHA || "5", 10);
export const PAGE_SIZE                 = 20;
export const MAX_REPLY_DEPTH           = 3;

const BLOCKED_DOMAINS = [
  "bit.ly", "tinyurl.com", "ow.ly", "t.co", "is.gd", "buff.ly", "adf.ly", "goo.gl",
];

const RELEVANCE_WEIGHTS = { likes: 3, replyCount: 2, recencyHours: 5, penaltyReport: 4 };

// ─────────────────────────────────────────────
// SPAM / FLOOD / SECURITY TRACKERS
// ─────────────────────────────────────────────
const floodTracker = new Map();
const suspiciousTracker = new Map();

function recordPost(userId) {
  const now = Date.now();
  if (!floodTracker.has(userId)) floodTracker.set(userId, []);
  const times = floodTracker.get(userId).filter((t) => now - t < 3_600_000);
  times.push(now);
  floodTracker.set(userId, times);
  return times;
}

function checkFlood(userId) {
  const times = floodTracker.get(userId) || [];
  const now = Date.now();
  const perMinute = times.filter((t) => now - t < 60_000).length;
  const per5Min   = times.filter((t) => now - t < 300_000).length;
  const perHour   = times.filter((t) => now - t < 3_600_000).length;

  if (perMinute >= MAX_COMMENTS_PER_MINUTE) {
    return `Too fast — you can post at most ${MAX_COMMENTS_PER_MINUTE} comments per minute.`;
  }
  if (per5Min >= MAX_COMMENTS_PER_5_MIN) {
    return `Slow down — at most ${MAX_COMMENTS_PER_5_MIN} comments per 5 minutes.`;
  }
  if (perHour >= MAX_COMMENTS_PER_HOUR) {
    return `You've reached the hourly comment limit (${MAX_COMMENTS_PER_HOUR}).`;
  }
  return null;
}

function checkSuspicious(userId) {
  if (!suspiciousTracker.has(userId)) suspiciousTracker.set(userId, 0);
  const count = suspiciousTracker.get(userId);
  return count >= SUSPICIOUS_ATTEMPTS_BEFORE_CAPTCHA;
}

function incrementSuspicious(userId) {
  suspiciousTracker.set(userId, (suspiciousTracker.get(userId) || 0) + 1);
}

function resetSuspicious(userId) {
  suspiciousTracker.delete(userId);
}

// ─────────────────────────────────────────────
// CONTENT GUARDS & SANITIZERS
// ─────────────────────────────────────────────

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function sanitizeComment(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/javascript\s*:/gi, "");
  safe = safe.replace(/data\s*:/gi, "");
  return safe;
}

export function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.,]{2,}/g, (m) => m[0]);
}

/**
 * Calculates spam score and checks for abusive spam patterns
 */
export function calculateSpamScore(text) {
  let score = 0;
  const issues = [];

  // 1. Excessive links (>2 links)
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 2) {
    score += 50;
    issues.push("Too many links in comment.");
  }

  // 2. Excessive repeated characters: e.g. !!!!!!!!!, ????????, aaaaaaaa
  if (/(.)\1{7,}/u.test(text)) {
    score += 30;
    issues.push("Excessive repeated characters detected.");
  }

  // 3. Excessive emojis (>10 emoji codepoints)
  const emojiMatches = text.match(/[\p{Extended_Pictographic}]/gu) || [];
  if (emojiMatches.length > 10) {
    score += 30;
    issues.push("Excessive emojis detected.");
  }

  // 4. Excessive capitalization (>70% uppercase for comments > 15 chars)
  if (text.length > 15) {
    const letters = text.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 10) {
      const upper = text.replace(/[^A-Z]/g, "");
      if (upper.length / letters.length > 0.75) {
        score += 25;
        issues.push("Excessive capitalization detected.");
      }
    }
  }

  // 5. Promotional spam keywords
  const promoRegex = /(free crypto|earn money online|whatsapp me|telegram\s*@|click here now|subscribe to my channel|dm me on instagram|free gift card)/i;
  if (promoRegex.test(text)) {
    score += 50;
    issues.push("Suspicious promotional content detected.");
  }

  return { score, isSpam: score >= 50, issue: issues[0] || null };
}

/**
 * Checks for malicious links and protocols
 */
export function detectMaliciousLink(text) {
  const urlRegex = /https?:\/\/([^\s/]+)/gi;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    const domain = m[1].toLowerCase().replace(/^www\./, "");
    if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) {
      return `Suspicious or shortened URL detected: ${m[0]}`;
    }
  }

  if (/javascript\s*:/i.test(text) || /data\s*:\s*text\/html/i.test(text)) {
    return "Malicious URL or script protocol detected.";
  }

  return null;
}

/**
 * Calculate relevance score
 */
function relevanceScore(c) {
  const ageHours = (Date.now() - new Date(c.createdAt || c.commentedon || Date.now()).getTime()) / 3_600_000;
  const recencyFactor = Math.max(0, 168 - ageHours) / 168; // decay over 7 days

  return (
    (c.likes || 0) * RELEVANCE_WEIGHTS.likes +
    (c.replyCount || 0) * RELEVANCE_WEIGHTS.replyCount +
    recencyFactor * RELEVANCE_WEIGHTS.recencyHours * 10 -
    (c.reportCount || 0) * RELEVANCE_WEIGHTS.penaltyReport
  );
}

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * POST /comment/postcomment
 * Preserves original API format while extending with multilingual, mentions,
 * spam scoring, duplicate checks, profanity filtering, rate limiting, and captcha.
 */
export const postcomment = async (req, res) => {
  const {
    videoid,
    userid,
    commentbody,
    usercommented,
    parentCommentId,
    language,
    captchaToken,
    captchaAnswer,
    expectedCaptcha,
  } = req.body;

  if (!userid || !videoid || !commentbody || !commentbody.trim()) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const rawComment = commentbody.trim();

  // 1. Rate Limiting Check
  const floodMsg = checkFlood(userid);
  if (floodMsg) {
    incrementSuspicious(userid);
    return res.status(429).json({ message: floodMsg, code: "RATE_LIMITED" });
  }

  // 2. CAPTCHA Check (triggered after repeated suspicious attempts)
  if (checkSuspicious(userid)) {
    const isValidCaptcha = await verifyCaptcha(captchaToken, captchaAnswer, expectedCaptcha);
    if (!isValidCaptcha) {
      return res.status(429).json({
        message: "Too many suspicious attempts. Please complete the CAPTCHA.",
        code: "CAPTCHA_REQUIRED",
      });
    }
    // Verified successfully -> reset suspicious counter
    resetSuspicious(userid);
  }

  // 3. Profanity / Abusive Content Filter (Multilingual)
  if (containsProfanity(rawComment)) {
    incrementSuspicious(userid);
    return res.status(400).json({
      message: "Your comment contains prohibited language.",
      code: "PROFANITY",
    });
  }

  // 4. Malicious Link & Protocol Detection
  const linkIssue = detectMaliciousLink(rawComment);
  if (linkIssue) {
    incrementSuspicious(userid);
    return res.status(400).json({ message: linkIssue, code: "MALICIOUS_LINK" });
  }

  // 5. Spam Detection & Scoring
  const spamAnalysis = calculateSpamScore(rawComment);
  if (spamAnalysis.isSpam) {
    incrementSuspicious(userid);
    return res.status(400).json({
      message: spamAnalysis.issue || "Your comment was flagged as spam.",
      code: "SPAM",
      spamScore: spamAnalysis.score,
    });
  }

  // 6. Duplicate Comment Detection (within DUPLICATE_WINDOW_MINUTES)
  const duplicateWindow = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60_000);
  const normalised = normalizeText(rawComment);
  const recentComments = await Comment.find({
    userid,
    videoid,
    createdAt: { $gte: duplicateWindow },
    deleted: false,
    isDeleted: false,
  }).select("commentbody");

  const isDuplicate = recentComments.some((c) => normalizeText(c.commentbody) === normalised);
  if (isDuplicate) {
    return res.status(400).json({
      message: "You have already posted this comment recently.",
      code: "DUPLICATE",
    });
  }

  // 7. Reply depth check
  if (parentCommentId) {
    let depth = 0;
    let cur = await Comment.findById(parentCommentId).select("parentCommentId");
    while (cur?.parentCommentId && depth < MAX_REPLY_DEPTH) {
      cur = await Comment.findById(cur.parentCommentId).select("parentCommentId");
      depth++;
    }
    if (depth >= MAX_REPLY_DEPTH) {
      return res.status(400).json({ message: "Maximum reply depth reached." });
    }
  }

  // 8. Sanitize text for storage (XSS prevention)
  const safeText = sanitizeComment(rawComment);

  // 9. Multilingual Language Detection
  const detected = detectLanguage(rawComment, language);

  // 10. Extract @mentions and validate against database
  const mentionMatches = rawComment.match(/@([a-zA-Z0-9_\u0900-\u097F]+)/g) || [];
  const mentionUsernames = [...new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()))];
  let mentionedUserIds = [];

  if (mentionUsernames.length > 0) {
    const validUsers = await User.find({
      $or: [
        { name: { $in: mentionUsernames.map((u) => new RegExp(`^${u}$`, "i")) } },
        { channelname: { $in: mentionUsernames.map((u) => new RegExp(`^${u}$`, "i")) } },
      ],
    }).select("_id");
    mentionedUserIds = validUsers.map((u) => u._id);
  }

  // 11. Retrieve author profile info (approximate location, avatar)
  let userLocation = "";
  let authorImage = "";
  try {
    const authorDoc = await User.findById(userid).select("location city state country image");
    if (authorDoc) {
      authorImage = authorDoc.image || "";
      if (authorDoc.location) {
        userLocation = authorDoc.location;
      } else if (authorDoc.city || authorDoc.state) {
        userLocation = [authorDoc.city, authorDoc.state].filter(Boolean).join(", ");
      }
    }
  } catch (e) {
    // Non-blocking
  }

  // 12. Create & Save Comment
  try {
    const newComment = new Comment({
      userid,
      videoid,
      commentbody: safeText,
      originalText: rawComment,
      originalLanguage: detected.languageCode,
      languageCode: detected.languageCode,
      languageName: detected.languageName,
      language: detected.languageCode,
      usercommented,
      userLocation,
      mentions: mentionedUserIds,
      commentedon: new Date(),
      parentCommentId: parentCommentId || null,
      moderationStatus: "VISIBLE",
      spamScore: spamAnalysis.score,
      deleted: false,
      isDeleted: false,
      version: 0,
    });

    await newComment.save();
    recordPost(userid);

    // Update parent reply count if this is a reply
    if (parentCommentId) {
      const parent = await Comment.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });
      if (parent && parent.userid) {
        sendReplyNotification({
          parentCommentOwnerId: parent.userid,
          replierName: usercommented,
          videoId,
          commentId: newComment._id,
        });
      }
    }

    // Dispatch mention notifications safely
    if (mentionedUserIds.length > 0) {
      sendMentionNotification({
        mentionedUserIds,
        commenterName: usercommented,
        videoId,
        commentId: newComment._id,
        commentText: safeText,
      });
    }

    return res.status(200).json({
      comment: true,
      data: {
        ...newComment.toObject(),
        image: authorImage,
      },
    });
  } catch (error) {
    console.error("postcomment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * GET /comment/:videoid
 * Fetches top-level comments with sorting, pagination, location, and user reaction
 */
export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  const { sort = "newest", page = "1", limit = String(PAGE_SIZE), userId } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || PAGE_SIZE));
  const skip     = (pageNum - 1) * limitNum;

  try {
    const baseQuery = {
      videoid,
      parentCommentId: null,
      moderationStatus: { $ne: "HIDDEN" },
    };

    let sortOption = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "liked")  sortOption = { likes: -1, createdAt: -1 };

    const [total, rawComments] = await Promise.all([
      Comment.countDocuments(baseQuery),
      Comment.find(baseQuery)
        .populate("userid", "name image location city state channelname preferredLanguage")
        .sort(sortOption)
        .skip(sort === "relevant" ? 0 : skip)
        .limit(sort === "relevant" ? limitNum * 4 : limitNum)
        .lean(),
    ]);

    let comments = rawComments;
    if (sort === "relevant") {
      comments = comments
        .sort((a, b) => relevanceScore(b) - relevanceScore(a))
        .slice(skip, skip + limitNum);
    }

    // Fetch user's reactions for this batch
    let userReactions = {};
    if (userId) {
      const ids = comments.map((c) => c._id);
      const reactions = await CommentReaction.find({
        commentId: { $in: ids },
        userId,
      }).lean();
      reactions.forEach((r) => {
        userReactions[r.commentId.toString()] = r.reaction;
      });
    }

    // Format & sanitize output
    const sanitized = comments.map((c) => {
      const isDel = Boolean(c.deleted || c.isDeleted);
      const author = c.userid;

      let location = c.userLocation || "";
      if (!location && author) {
        if (author.location) location = author.location;
        else if (author.city || author.state) location = [author.city, author.state].filter(Boolean).join(", ");
      }

      if (isDel) {
        return {
          _id: c._id,
          deleted: true,
          isDeleted: true,
          replyCount: c.replyCount || 0,
          createdAt: c.createdAt || c.commentedon,
          commentedon: c.commentedon || c.createdAt,
          parentCommentId: c.parentCommentId,
          commentbody: "[Comment deleted]",
          originalText: "[Comment deleted]",
          usercommented: "[deleted]",
          userid: null,
          userLocation: "",
          likes: 0,
          dislikes: 0,
          edited: false,
          userReaction: null,
        };
      }

      return {
        ...c,
        userid: author?._id || c.userid,
        usercommented: c.usercommented || author?.name || author?.channelname || "Anonymous",
        image: author?.image || "",
        userLocation: location,
        userReaction: userReactions[c._id.toString()] || null,
        translations: c.translations ? (c.translations instanceof Map ? Object.fromEntries(c.translations) : c.translations) : {},
      };
    });

    return res.status(200).json({
      comments: sanitized,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    });
  } catch (error) {
    console.error("getallcomment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * GET /comment/:videoid/replies/:parentId
 */
export const getReplies = async (req, res) => {
  const { parentId } = req.params;
  const { page = "1", userId } = req.query;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = 10;
  const skip     = (pageNum - 1) * limitNum;

  try {
    const baseQuery = {
      parentCommentId: parentId,
      moderationStatus: { $ne: "HIDDEN" },
    };

    const [total, replies] = await Promise.all([
      Comment.countDocuments(baseQuery),
      Comment.find(baseQuery)
        .populate("userid", "name image location city state channelname")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    let userReactions = {};
    if (userId) {
      const ids = replies.map((r) => r._id);
      const reactions = await CommentReaction.find({ commentId: { $in: ids }, userId }).lean();
      reactions.forEach((r) => {
        userReactions[r.commentId.toString()] = r.reaction;
      });
    }

    const sanitized = replies.map((c) => {
      const isDel = Boolean(c.deleted || c.isDeleted);
      const author = c.userid;
      let location = c.userLocation || "";
      if (!location && author) {
        if (author.location) location = author.location;
        else if (author.city || author.state) location = [author.city, author.state].filter(Boolean).join(", ");
      }

      if (isDel) {
        return {
          _id: c._id,
          deleted: true,
          isDeleted: true,
          commentbody: "[Comment deleted]",
          usercommented: "[deleted]",
          userReaction: null,
          createdAt: c.createdAt,
          userLocation: "",
        };
      }

      return {
        ...c,
        userid: author?._id || c.userid,
        usercommented: c.usercommented || author?.name || "Anonymous",
        image: author?.image || "",
        userLocation: location,
        userReaction: userReactions[c._id.toString()] || null,
        translations: c.translations ? (c.translations instanceof Map ? Object.fromEntries(c.translations) : c.translations) : {},
      };
    });

    return res.status(200).json({
      replies: sanitized,
      total,
      hasMore: pageNum * limitNum < total,
    });
  } catch (error) {
    console.error("getReplies error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * DELETE /comment/deletecomment/:id
 * Supports soft-deletion if replies exist, and hard deletion if leaf comment.
 */
export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;
  const { userId, adminNote } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "Comment not found." });
  }

  try {
    const c = await Comment.findById(_id);
    if (!c) return res.status(404).json({ message: "Comment not found." });

    const requestingUser = await User.findById(userId).select("role");
    const isOwner = c.userid && c.userid.toString() === String(userId);
    const isAdmin = requestingUser?.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorised to delete this comment." });
    }

    if (c.replyCount > 0) {
      // Soft-delete to preserve replies chain
      await Comment.findByIdAndUpdate(_id, {
        deleted: true,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        deletedReason: adminNote || (isAdmin ? "Admin removal" : "User deleted"),
        commentbody: "[Comment deleted]",
        usercommented: "[deleted]",
      });
    } else {
      // Hard delete if leaf
      await Comment.findByIdAndDelete(_id);
    }

    if (c.parentCommentId) {
      await Comment.findByIdAndUpdate(c.parentCommentId, { $inc: { replyCount: -1 } });
    }

    if (isAdmin) {
      await CommentModerationLog.create({
        commentId: _id,
        adminId: userId,
        action: "DELETE",
        reason: adminNote || "Admin removal",
        previousStatus: c.moderationStatus,
        newStatus: "ACTION_TAKEN",
      });
    }

    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error("deletecomment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * POST /comment/editcomment/:id
 * Only comment owner can edit, within configurable COMMENT_EDIT_LIMIT_MINUTES window.
 * Optimistic concurrency check (version check) to handle simultaneous edits.
 */
export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody, userId, version } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "Comment not found." });
  }
  if (!commentbody || !commentbody.trim()) {
    return res.status(400).json({ message: "Comment body cannot be empty." });
  }

  try {
    const c = await Comment.findById(_id);
    if (!c) return res.status(404).json({ message: "Comment not found." });
    if (c.deleted || c.isDeleted) {
      return res.status(400).json({ message: "Cannot edit a deleted comment." });
    }

    // Ownership check
    if (c.userid.toString() !== String(userId)) {
      return res.status(403).json({ message: "Not authorised to edit this comment." });
    }

    // Configurable Edit Time Limit Check
    const minutesSincePosted = (Date.now() - new Date(c.commentedon || c.createdAt).getTime()) / 60_000;
    if (minutesSincePosted > COMMENT_EDIT_LIMIT_MINUTES) {
      return res.status(403).json({
        message: `Comments can only be edited within ${COMMENT_EDIT_LIMIT_MINUTES} minutes of posting.`,
        code: "EDIT_WINDOW_CLOSED",
      });
    }

    // Optimistic Concurrency Check (simultaneous edit collision prevention)
    if (version !== undefined && Number(version) !== c.version) {
      return res.status(409).json({
        message: "This comment was updated elsewhere. Please refresh and try again.",
        code: "CONFLICT",
      });
    }

    const rawNewText = commentbody.trim();

    // Check Profanity
    if (containsProfanity(rawNewText)) {
      return res.status(400).json({
        message: "Your comment contains prohibited language.",
        code: "PROFANITY",
      });
    }

    // Check Malicious Links
    const linkIssue = detectMaliciousLink(rawNewText);
    if (linkIssue) return res.status(400).json({ message: linkIssue, code: "MALICIOUS_LINK" });

    const safeText = sanitizeComment(rawNewText);

    // Save previous version in CommentHistory & embedded editHistory
    await CommentHistory.create({
      commentId: _id,
      userId,
      previousText: c.commentbody,
      newText: safeText,
      editedAt: new Date(),
    });

    const updated = await Comment.findByIdAndUpdate(
      _id,
      {
        $set: {
          commentbody: safeText,
          edited: true,
          editedAt: new Date(),
          version: (c.version || 0) + 1,
        },
        $push: {
          editHistory: {
            previousText: c.commentbody,
            newText: safeText,
            text: c.commentbody,
            editedAt: new Date(),
            editedBy: userId,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json(updated);
  } catch (error) {
    console.error("editcomment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * POST /comment/:id/react
 * Like / Dislike reaction handler.
 * Prevents duplicate reactions and simultaneous like + dislike.
 * Dislikes do NOT auto-delete comments.
 */
export const reactToComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId, reaction } = req.body; // reaction: "LIKE" | "DISLIKE" | null

  if (!userId || !mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(400).json({ message: "Invalid request." });
  }

  try {
    const existing = await CommentReaction.findOne({ commentId, userId });
    const c = await Comment.findById(commentId);
    if (!c) return res.status(404).json({ message: "Comment not found." });

    let likesDelta = 0;
    let dislikesDelta = 0;

    if (!reaction) {
      // Toggle off / remove reaction
      if (existing) {
        if (existing.reaction === "LIKE")    likesDelta = -1;
        if (existing.reaction === "DISLIKE") dislikesDelta = -1;
        await existing.deleteOne();
      }
    } else if (!existing) {
      // New reaction
      await CommentReaction.create({ commentId, userId, reaction });
      if (reaction === "LIKE")    likesDelta = 1;
      if (reaction === "DISLIKE") dislikesDelta = 1;
    } else if (existing.reaction !== reaction) {
      // Switch reaction (e.g. from dislike to like)
      if (reaction === "LIKE")    { likesDelta = 1;  dislikesDelta = -1; }
      if (reaction === "DISLIKE") { likesDelta = -1; dislikesDelta = 1; }
      existing.reaction = reaction;
      await existing.save();
    }
    // If same reaction clicked again, frontend passes null to toggle off

    await Comment.findByIdAndUpdate(commentId, {
      $inc: { likes: likesDelta, dislikes: dislikesDelta },
    });

    const updated = await Comment.findById(commentId).select("likes dislikes");
    return res.status(200).json({
      ok: true,
      likes: Math.max(0, updated.likes),
      dislikes: Math.max(0, updated.dislikes),
      userReaction: reaction || null,
    });
  } catch (error) {
    console.error("reactToComment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * POST /comment/:id/report
 * User reports a comment. Prevents duplicate reports by the same user.
 */
export const reportComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId, reason, description } = req.body;

  const VALID_REASONS = ["SPAM", "HARASSMENT", "OFFENSIVE", "HATE_ABUSE", "MALICIOUS_LINK", "OTHER"];
  if (!userId || !reason || !VALID_REASONS.includes(reason)) {
    return res.status(400).json({ message: "Invalid report request." });
  }

  try {
    // Prevent duplicate report from same user
    const existing = await CommentReport.findOne({
      commentId,
      reportedBy: userId,
      status: { $in: ["PENDING", "REVIEWED"] },
    });
    if (existing) {
      return res.status(400).json({ message: "You have already reported this comment." });
    }

    await CommentReport.create({
      commentId,
      reportedBy: userId,
      reason,
      description: description || "",
      status: "PENDING",
    });

    const reportCount = await CommentReport.countDocuments({ commentId });
    await Comment.findByIdAndUpdate(commentId, {
      reportCount,
      moderationStatus: reportCount >= 3 ? "FLAGGED" : undefined,
    });

    return res.status(200).json({ ok: true, message: "Report submitted for moderation review." });
  } catch (error) {
    console.error("reportComment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * POST /comment/:id/translate
 * Translates comment to target language on-demand, with caching.
 */
export const translateComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { targetLang = "en" } = req.body;

  try {
    const result = await getOrTranslateComment(commentId, targetLang);
    if (!result || !result.translated) {
      return res.status(503).json({
        message: "Translation unavailable. Please try again.",
        code: "TRANSLATION_UNAVAILABLE",
      });
    }

    return res.status(200).json({
      translated: result.translated,
      cached: Boolean(result.cached),
    });
  } catch (error) {
    console.error("translateComment error:", error);
    return res.status(503).json({
      message: "Translation unavailable. Please try again.",
      code: "TRANSLATION_UNAVAILABLE",
    });
  }
};

/**
 * GET /comment/:id/history
 * Fetch edit history for a comment (owner or admin only)
 */
export const getCommentHistory = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId } = req.query;

  try {
    const c = await Comment.findById(commentId).select("userid editHistory");
    if (!c) return res.status(404).json({ message: "Comment not found." });

    const requestingUser = await User.findById(userId).select("role");
    const isOwner = c.userid.toString() === String(userId);
    const isAdmin = requestingUser?.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorised." });
    }

    // Also fetch from separate collection if any
    const fullHistory = await CommentHistory.find({ commentId }).sort({ editedAt: -1 }).lean();

    return res.status(200).json({
      editHistory: fullHistory.length ? fullHistory : (c.editHistory || []),
    });
  } catch (error) {
    console.error("getCommentHistory error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * GET /comment/mentions/search?q=query
 * Autocomplete suggestions for @mentions
 */
export const getMentionSuggestions = async (req, res) => {
  const { q = "" } = req.query;
  const queryText = String(q).trim().replace(/^@/, "");

  if (!queryText) {
    return res.status(200).json({ users: [] });
  }

  try {
    const escaped = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const users = await User.find({
      $or: [{ name: regex }, { channelname: regex }],
    })
      .select("_id name channelname image")
      .limit(8)
      .lean();

    return res.status(200).json({ users });
  } catch (error) {
    console.error("getMentionSuggestions error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

// ─────────────────────────────────────────────
// ADMIN MODERATION CONTROLLERS
// ─────────────────────────────────────────────

async function requireAdmin(userId, res) {
  if (!userId) {
    res.status(401).json({ message: "Unauthorised." });
    return false;
  }
  const u = await User.findById(userId).select("role");
  if (u?.role !== "admin") {
    res.status(403).json({ message: "Admin access required." });
    return false;
  }
  return true;
}

/**
 * GET /comment/admin/reports
 */
export const getReports = async (req, res) => {
  const { userId, status = "PENDING", page = "1" } = req.query;
  if (!(await requireAdmin(userId, res))) return;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limit = 20;

  try {
    const query = {};
    if (status !== "ALL") query.status = status;

    const [total, reports] = await Promise.all([
      CommentReport.countDocuments(query),
      CommentReport.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limit)
        .limit(limit)
        .populate("reportedBy", "name email image")
        .populate({
          path: "commentId",
          select: "commentbody originalText originalLanguage usercommented moderationStatus reportCount deleted isDeleted createdAt",
          populate: { path: "userid", select: "name email image location city state" },
        })
        .lean(),
    ]);

    return res.status(200).json({
      reports,
      total,
      page: pageNum,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getReports error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * PUT /comment/admin/reports/:reportId
 */
export const moderateReport = async (req, res) => {
  const { reportId } = req.params;
  const { action, adminId, note } = req.body;

  if (!(await requireAdmin(adminId, res))) return;

  const VALID_ACTIONS = ["DISMISS", "ACTION_TAKEN", "REVIEWED"];
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ message: "Invalid action." });
  }

  try {
    const report = await CommentReport.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found." });

    const prevStatus = report.status;
    report.status = action === "DISMISS" ? "DISMISSED" : action === "ACTION_TAKEN" ? "ACTION_TAKEN" : "REVIEWED";
    await report.save();

    if (action === "ACTION_TAKEN") {
      await Comment.findByIdAndUpdate(report.commentId, {
        moderationStatus: "ACTION_TAKEN",
        deleted: true,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: adminId,
        deletedReason: note || "Moderator removal",
        commentbody: "[Comment removed by moderator]",
        usercommented: "[removed]",
      });

      await CommentModerationLog.create({
        commentId: report.commentId,
        adminId,
        action: "MODERATED_REMOVE",
        reason: note || "Report actioned",
        previousStatus: prevStatus,
        newStatus: "ACTION_TAKEN",
      });
    } else {
      await Comment.findByIdAndUpdate(report.commentId, {
        moderationStatus: action === "DISMISS" ? "DISMISSED" : "REVIEWED",
      });

      await CommentModerationLog.create({
        commentId: report.commentId,
        adminId,
        action: action === "DISMISS" ? "DISMISS_REPORT" : "REVIEWED",
        reason: note || "",
        previousStatus: prevStatus,
        newStatus: report.status,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("moderateReport error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * PUT /comment/admin/:id/restore
 */
export const restoreComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { adminId, note } = req.body;
  if (!(await requireAdmin(adminId, res))) return;

  try {
    const c = await Comment.findById(commentId);
    if (!c) return res.status(404).json({ message: "Comment not found." });

    const restored = await Comment.findByIdAndUpdate(
      commentId,
      {
        deleted: false,
        isDeleted: false,
        moderationStatus: "VISIBLE",
        deletedAt: null,
        deletedBy: null,
        commentbody: c.originalText || c.commentbody,
      },
      { new: true }
    );

    await CommentModerationLog.create({
      commentId,
      adminId,
      action: "RESTORE",
      reason: note || "Admin restore",
      previousStatus: c.moderationStatus,
      newStatus: "VISIBLE",
    });

    return res.status(200).json({ ok: true, comment: restored });
  } catch (error) {
    console.error("restoreComment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * PUT /comment/admin/:id/moderate
 * Direct admin action on a comment (HIDE, DELETE, RESTORE)
 */
export const moderateComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { adminId, action, reason } = req.body;
  if (!(await requireAdmin(adminId, res))) return;

  try {
    const c = await Comment.findById(commentId);
    if (!c) return res.status(404).json({ message: "Comment not found." });

    const prevStatus = c.moderationStatus;
    let newStatus = prevStatus;

    if (action === "HIDE") {
      newStatus = "HIDDEN";
      await Comment.findByIdAndUpdate(commentId, { moderationStatus: "HIDDEN" });
    } else if (action === "DELETE") {
      newStatus = "ACTION_TAKEN";
      await Comment.findByIdAndUpdate(commentId, {
        moderationStatus: "ACTION_TAKEN",
        deleted: true,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: adminId,
        deletedReason: reason || "Admin direct removal",
        commentbody: "[Comment removed by moderator]",
      });
    } else if (action === "RESTORE") {
      newStatus = "VISIBLE";
      await Comment.findByIdAndUpdate(commentId, {
        moderationStatus: "VISIBLE",
        deleted: false,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        commentbody: c.originalText || c.commentbody,
      });
    }

    await CommentModerationLog.create({
      commentId,
      adminId,
      action: `DIRECT_${action}`,
      reason: reason || "",
      previousStatus: prevStatus,
      newStatus,
    });

    return res.status(200).json({ ok: true, status: newStatus });
  } catch (error) {
    console.error("moderateComment error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

/**
 * GET /comment/admin/logs
 */
export const getModerationLogs = async (req, res) => {
  const { userId, commentId } = req.query;
  if (!(await requireAdmin(userId, res))) return;

  try {
    const query = {};
    if (commentId) query.commentId = commentId;

    const logs = await CommentModerationLog.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("adminId", "name email")
      .lean();

    return res.status(200).json({ logs });
  } catch (error) {
    console.error("getModerationLogs error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

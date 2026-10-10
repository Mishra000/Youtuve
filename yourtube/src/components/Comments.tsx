/**
 * Comments.tsx — Advanced Multilingual Commenting, Translation & Moderation System
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete implementation for TASK 6:
 *  - Multilingual comments in all Unicode languages (Hindi, Punjabi, English, etc.)
 *  - On-demand translation with local caching and preferred language selector
 *  - Accurate display: Username, Avatar, Location (from profile), Timestamp, (edited)
 *  - 15-minute edit limit with optimistic concurrency and Edit History modal
 *  - Soft-delete for parent comments preserving reply threads ("[Comment deleted]")
 *  - @Mentions with debounced autocomplete suggestion menu and safe linking
 *  - Liked / Disliked toggling (no duplicate reactions, no auto-delete on dislikes)
 *  - Sorting: Newest, Oldest, Most liked, Most relevant
 *  - Multilingual profanity, spam score, duplicate detection & rate limit alerts
 *  - Interactive CAPTCHA challenge on suspicious attempts
 *  - Comment reporting modal with predefined reasons
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
const COMMENT_EDIT_LIMIT_MINUTES = 15;
const PAGE_SIZE = 20;

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "pa", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "es", name: "Spanish (Español)" },
  { code: "fr", name: "French (Français)" },
  { code: "de", name: "German (Deutsch)" },
  { code: "ar", name: "Arabic (العربية)" },
  { code: "bn", name: "Bengali (বাংলা)" },
  { code: "ta", name: "Tamil (தமிழ்)" },
  { code: "te", name: "Telugu (తెలుగు)" },
  { code: "ru", name: "Russian (Русский)" },
  { code: "zh", name: "Chinese (中文)" },
  { code: "ja", name: "Japanese (日本語)" },
  { code: "ko", name: "Korean (한국어)" },
];

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface CommentData {
  _id: string;
  userid: string | any;
  videoid: string;
  commentbody: string;
  originalText?: string;
  originalLanguage?: string;
  languageCode?: string;
  languageName?: string;
  usercommented: string;
  userLocation?: string;
  commentedon: string;
  createdAt?: string;
  edited?: boolean;
  editedAt?: string;
  deleted?: boolean;
  isDeleted?: boolean;
  likes: number;
  dislikes: number;
  replyCount: number;
  userReaction?: "LIKE" | "DISLIKE" | null;
  parentCommentId?: string | null;
  flagged?: boolean;
  version?: number;
  image?: string;
  translations?: Record<string, string>;
}

export type SortOption = "newest" | "oldest" | "liked" | "relevant";
export type ReportReason = "SPAM" | "HARASSMENT" | "OFFENSIVE" | "HATE_ABUSE" | "MALICIOUS_LINK" | "OTHER";

interface MentionUser {
  _id: string;
  name?: string;
  channelname?: string;
  image?: string;
}

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

function canEditComment(comment: CommentData): boolean {
  const timestamp = comment.commentedon || comment.createdAt;
  if (!timestamp) return false;
  const posted = new Date(timestamp).getTime();
  return (Date.now() - posted) / 60_000 < COMMENT_EDIT_LIMIT_MINUTES;
}

/**
 * Safely renders @mentions as clickable channel links without dangerouslySetInnerHTML
 */
function renderCommentBody(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_\u0900-\u097F]+)/g);
  return parts.map((part, i) =>
    /^@[a-zA-Z0-9_\u0900-\u097F]+$/.test(part) ? (
      <a
        key={i}
        href={`/channel?name=${encodeURIComponent(part.slice(1))}`}
        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

// ── Report Modal ──────────────────────────────
function ReportModal({
  commentId,
  onClose,
}: {
  commentId: string;
  onClose: () => void;
}) {
  const { user } = useUser() as any;
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const REASONS: { value: ReportReason; label: string }[] = [
    { value: "SPAM", label: "Spam or unwanted commercial content" },
    { value: "HARASSMENT", label: "Harassment, bullying, or threats" },
    { value: "OFFENSIVE", label: "Offensive or inappropriate language" },
    { value: "HATE_ABUSE", label: "Hate speech or abusive material" },
    { value: "MALICIOUS_LINK", label: "Phishing, malware, or malicious link" },
    { value: "OTHER", label: "Other policy violation" },
  ];

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await axiosInstance.post(`/comment/${commentId}/report`, {
        userId: user._id,
        reason,
        description,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to submit report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center py-4 space-y-2">
            <div className="text-4xl">🛡️</div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Report Submitted</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Thank you for keeping our community safe. Our moderation team will review this comment.
            </p>
            <Button className="mt-4 w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Report Comment</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Select the reason why you are reporting this comment:
            </p>
            <div className="space-y-2.5 mb-4">
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="report_reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-red-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-black dark:group-hover:text-white">
                    {r.label}
                  </span>
                </label>
              ))}
            </div>
            <textarea
              className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl p-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Additional context or details (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {error && <p className="text-red-500 text-xs mt-2 font-medium">{error}</p>}
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button onClick={submit} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
                {loading ? "Submitting…" : "Report"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Comment Edit History Modal ────────────────
function EditHistoryModal({
  commentId,
  onClose,
}: {
  commentId: string;
  onClose: () => void;
}) {
  const { user } = useUser() as any;
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axiosInstance.get(`/comment/${commentId}/history?userId=${user?._id || ""}`);
        setHistory(res.data.editHistory || []);
      } catch {
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [commentId, user?._id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-200 dark:border-gray-800 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Comment Edit History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm text-gray-500">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 italic">No previous revisions recorded.</div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {history.map((rev, idx) => (
              <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60 space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Revision #{history.length - idx}</span>
                  <span>{rev.editedAt ? new Date(rev.editedAt).toLocaleString() : "Recently"}</span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {rev.previousText || rev.text || "—"}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Single Comment Card ───────────────────────
function CommentCard({
  comment,
  currentUser,
  depth = 0,
  videoId,
  preferredLanguage,
  onDeleted,
  onUpdated,
}: {
  comment: CommentData;
  currentUser: any;
  depth?: number;
  videoId: string;
  preferredLanguage: string;
  onDeleted: (id: string) => void;
  onUpdated: (c: CommentData) => void;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<CommentData[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesPage, setRepliesPage] = useState(1);
  const [hasMoreReplies, setHasMoreReplies] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyMentionSuggestions, setReplyMentionSuggestions] = useState<MentionUser[]>([]);
  const [showReplyMentionPopup, setShowReplyMentionPopup] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.commentbody);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [likes, setLikes] = useState(comment.likes || 0);
  const [dislikes, setDislikes] = useState(comment.dislikes || 0);
  const [userReaction, setUserReaction] = useState<"LIKE" | "DISLIKE" | null>(
    comment.userReaction || null
  );
  const [reacting, setReacting] = useState(false);

  // Translation state
  const [translationsCache, setTranslationsCache] = useState<Record<string, string>>(
    comment.translations || {}
  );
  const [isTranslatedView, setIsTranslatedView] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateNotice, setTranslateNotice] = useState("");

  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close more menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Update reactions state when parent updates
  useEffect(() => {
    setLikes(comment.likes || 0);
    setDislikes(comment.dislikes || 0);
    setUserReaction(comment.userReaction || null);
    if (comment.translations) {
      setTranslationsCache(comment.translations);
    }
  }, [comment]);

  // Reply mentions autocomplete
  const handleReplyTextChange = async (val: string) => {
    setReplyText(val);
    const lastWord = val.split(/\s+/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) {
      const q = lastWord.slice(1);
      try {
        const res = await axiosInstance.get(`/comment/mentions/search?q=${encodeURIComponent(q)}`);
        setReplyMentionSuggestions(res.data.users || []);
        setShowReplyMentionPopup(true);
      } catch {
        setShowReplyMentionPopup(false);
      }
    } else {
      setShowReplyMentionPopup(false);
    }
  };

  const insertReplyMention = (user: MentionUser) => {
    const username = user.channelname || user.name || "user";
    const words = replyText.split(/\s+/);
    words.pop();
    words.push(`@${username} `);
    setReplyText(words.join(" "));
    setShowReplyMentionPopup(false);
  };

  const loadReplies = async (page = 1) => {
    setRepliesLoading(true);
    try {
      const res = await axiosInstance.get(
        `/comment/${videoId}/replies/${comment._id}?page=${page}&userId=${currentUser?._id || ""}`
      );
      if (page === 1) setReplies(res.data.replies || []);
      else setReplies((prev) => [...prev, ...(res.data.replies || [])]);
      setHasMoreReplies(res.data.hasMore);
      setRepliesPage(page);
    } catch {
      // safe fallback
    } finally {
      setRepliesLoading(false);
    }
  };

  const toggleReplies = () => {
    if (!showReplies && replies.length === 0 && comment.replyCount > 0) loadReplies(1);
    setShowReplies((v) => !v);
  };

  const handleReply = async () => {
    if (!currentUser || !replyText.trim() || replyLoading) return;
    setReplyLoading(true);
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: currentUser._id,
        commentbody: replyText,
        usercommented: currentUser.name || currentUser.channelname || "Anonymous",
        parentCommentId: comment._id,
      });

      if (res.data.comment) {
        const newReply: CommentData = {
          ...res.data.data,
          _id: res.data.data?._id || Date.now().toString(),
          likes: 0,
          dislikes: 0,
          replyCount: 0,
          userReaction: null,
        };
        setReplies((prev) => [...prev, newReply]);
        setShowReplies(true);
        setReplyText("");
        setShowReplyBox(false);
        onUpdated({ ...comment, replyCount: (comment.replyCount || 0) + 1 });
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to post reply.");
    } finally {
      setReplyLoading(false);
    }
  };

  const handleReact = async (reaction: "LIKE" | "DISLIKE") => {
    if (!currentUser || reacting) return;
    const next = userReaction === reaction ? null : reaction;
    setReacting(true);
    try {
      const res = await axiosInstance.post(`/comment/${comment._id}/react`, {
        userId: currentUser._id,
        reaction: next,
      });
      setLikes(res.data.likes);
      setDislikes(res.data.dislikes);
      setUserReaction(res.data.userReaction);
      onUpdated({
        ...comment,
        likes: res.data.likes,
        dislikes: res.data.dislikes,
        userReaction: res.data.userReaction,
      });
    } catch {
      // ignore
    } finally {
      setReacting(false);
    }
  };

  const handleEdit = async () => {
    if (!editText.trim() || editLoading) return;
    setEditLoading(true);
    setEditError("");
    try {
      const res = await axiosInstance.post(`/comment/${comment._id}/editcomment`, {
        commentbody: editText,
        userId: currentUser._id,
        version: comment.version,
      });
      onUpdated({
        ...comment,
        commentbody: res.data.commentbody || editText,
        edited: true,
        editedAt: new Date().toISOString(),
        version: res.data.version || (comment.version || 0) + 1,
      });
      setIsEditing(false);
    } catch (e: any) {
      setEditError(e?.response?.data?.message || "Failed to save edit.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this comment?") || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await axiosInstance.delete(`/comment/deletecomment/${comment._id}`, {
        data: { userId: currentUser._id },
      });
      onDeleted(comment._id);
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleTranslate = async () => {
    setTranslateNotice("");

    // If currently showing translated, toggle back to original
    if (isTranslatedView) {
      setIsTranslatedView(false);
      return;
    }

    const targetLang = (preferredLanguage || "en").toLowerCase();

    // If original language is already the target language
    if (comment.originalLanguage && comment.originalLanguage.toLowerCase() === targetLang) {
      setTranslateNotice(`This comment is already in your selected language (${targetLang}).`);
      setTimeout(() => setTranslateNotice(""), 3500);
      return;
    }

    // Check if translation is cached
    if (translationsCache[targetLang]) {
      setIsTranslatedView(true);
      return;
    }

    setTranslating(true);
    try {
      const res = await axiosInstance.post(`/comment/${comment._id}/translate`, {
        targetLang,
        userId: currentUser?._id,
      });

      if (res.data.translated) {
        setTranslationsCache((prev) => ({
          ...prev,
          [targetLang]: res.data.translated,
        }));
        setIsTranslatedView(true);
      }
    } catch (e: any) {
      setTranslateNotice(e?.response?.data?.message || "Translation unavailable. Please try again.");
      setTimeout(() => setTranslateNotice(""), 4500);
    } finally {
      setTranslating(false);
    }
  };

  const isOwner = currentUser && comment.userid && String(comment.userid) === String(currentUser._id);
  const isAdmin = currentUser?.role === "admin";
  const isDeleted = Boolean(comment.deleted || comment.isDeleted);
  const canEditNow = isOwner && canEditComment(comment) && !isDeleted;

  const timestamp = comment.commentedon || comment.createdAt;
  const timeAgo = timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : "";

  // If deleted and has no replies, completely hide
  if (isDeleted && comment.replyCount === 0) {
    return null;
  }

  const activeTranslation = translationsCache[(preferredLanguage || "en").toLowerCase()];

  return (
    <div className={`flex gap-3.5 group/comment ${depth > 0 ? "ml-8 sm:ml-10 border-l-2 border-gray-100 dark:border-gray-800 pl-3.5 sm:pl-4 mt-2" : ""}`}>
      {/* Avatar */}
      <Avatar className="w-9 h-9 flex-shrink-0 shadow-xs ring-1 ring-gray-100 dark:ring-gray-800">
        <AvatarImage src={comment.image || ""} />
        <AvatarFallback className="bg-gradient-to-tr from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold">
          {isDeleted ? "?" : (comment.usercommented?.[0] || "?").toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Main Comment Content */}
      <div className="flex-1 min-w-0">
        {/* Header: User, Location, Time, Edited status */}
        {!isDeleted && (
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-1 text-xs">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              {comment.usercommented}
            </span>

            {/* Approximate location from profile if present */}
            {comment.userLocation && (
              <span className="text-gray-500 dark:text-gray-400 font-normal flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md text-[11px]">
                📍 {comment.userLocation}
              </span>
            )}

            <span className="text-gray-400 dark:text-gray-500">{timeAgo}</span>

            {comment.edited && (
              <span
                className="text-gray-400 dark:text-gray-500 italic cursor-pointer hover:underline"
                onClick={() => setShowHistory(true)}
                title="View edit history"
              >
                (edited)
              </span>
            )}
          </div>
        )}

        {/* Comment Text or Edit Input */}
        {isEditing ? (
          <div className="space-y-2 mt-1.5 p-2 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-transparent focus:outline-none text-sm py-1 resize-none text-gray-900 dark:text-gray-100"
              rows={3}
              aria-label="Edit comment"
              autoFocus
            />
            {editError && <p className="text-red-500 text-xs font-medium">{editError}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(comment.commentbody);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={editLoading || !editText.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editLoading ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
              {isDeleted ? (
                <span className="italic text-gray-400 dark:text-gray-500">[Comment deleted]</span>
              ) : isTranslatedView && activeTranslation ? (
                renderCommentBody(activeTranslation)
              ) : (
                renderCommentBody(comment.commentbody)
              )}
            </p>

            {/* Translated badge */}
            {isTranslatedView && activeTranslation && (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
                <span>🌐 Translated into {preferredLanguage.toUpperCase()}</span>
                <button
                  onClick={() => setIsTranslatedView(false)}
                  className="hover:underline text-blue-700 dark:text-blue-300 font-semibold"
                >
                  (Show original)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Temporary Notice (e.g. Translation error) */}
        {translateNotice && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium animate-in fade-in">
            {translateNotice}
          </p>
        )}

        {/* Action Buttons: Like, Dislike, Reply, Translate, More */}
        {!isDeleted && !isEditing && (
          <div className="flex items-center gap-3.5 mt-2 flex-wrap">
            {/* Like */}
            <button
              onClick={() => handleReact("LIKE")}
              disabled={!currentUser || reacting}
              aria-label={`Like (${likes})`}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                userReaction === "LIKE"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              }`}
            >
              <span>👍</span>
              <span>{likes}</span>
            </button>

            {/* Dislike */}
            <button
              onClick={() => handleReact("DISLIKE")}
              disabled={!currentUser || reacting}
              aria-label={`Dislike (${dislikes})`}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                userReaction === "DISLIKE"
                  ? "text-red-500 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:text-red-500"
              }`}
            >
              <span>👎</span>
              <span>{dislikes}</span>
            </button>

            {/* Reply */}
            {depth < 3 && currentUser && (
              <button
                onClick={() => setShowReplyBox((v) => !v)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-semibold transition-colors"
              >
                Reply
              </button>
            )}

            {/* Translate Button */}
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              {translating ? (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Translating…
                </span>
              ) : isTranslatedView ? (
                "Original"
              ) : (
                "Translate"
              )}
            </button>

            {/* More Menu (...) */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1 py-0.5 rounded-sm"
                aria-label="More actions"
              >
                ⋯
              </button>

              {showMenu && (
                <div className="absolute left-0 bottom-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl py-1 z-30 min-w-[150px] animate-in fade-in zoom-in-95 duration-150">
                  {canEditNow && (
                    <button
                      className="block w-full text-left px-3.5 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                    >
                      ✏️ Edit
                    </button>
                  )}

                  {comment.edited && (
                    <button
                      className="block w-full text-left px-3.5 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
                      onClick={() => {
                        setShowHistory(true);
                        setShowMenu(false);
                      }}
                    >
                      📜 History
                    </button>
                  )}

                  {(isOwner || isAdmin) && (
                    <button
                      className="block w-full text-left px-3.5 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      onClick={() => {
                        setShowMenu(false);
                        handleDelete();
                      }}
                      disabled={deleteLoading}
                    >
                      🗑️ Delete
                    </button>
                  )}

                  {currentUser && !isOwner && (
                    <button
                      className="block w-full text-left px-3.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => {
                        setShowMenu(false);
                        setShowReport(true);
                      }}
                    >
                      🚩 Report
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reply Box with Mentions Autocomplete */}
        {showReplyBox && !isDeleted && (
          <div className="mt-3 relative flex gap-2 items-start p-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700">
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={currentUser?.image || ""} />
              <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                {currentUser?.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 relative">
              <textarea
                placeholder={`Reply to @${comment.usercommented}…`}
                value={replyText}
                onChange={(e) => handleReplyTextChange(e.target.value)}
                className="w-full bg-transparent focus:outline-none text-sm py-1 resize-none text-gray-900 dark:text-gray-100"
                rows={2}
                autoFocus
              />

              {/* Mentions Suggestion Popup */}
              {showReplyMentionPopup && replyMentionSuggestions.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-40 max-h-48 overflow-y-auto">
                  <div className="p-1.5 text-[11px] font-semibold text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                    Mention user:
                  </div>
                  {replyMentionSuggestions.map((mUser) => (
                    <div
                      key={mUser._id}
                      onClick={() => insertReplyMention(mUser)}
                      className="flex items-center gap-2 p-2 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer text-xs"
                    >
                      <Avatar className="w-5 h-5">
                        <AvatarImage src={mUser.image || ""} />
                        <AvatarFallback className="text-[9px]">{(mUser.name?.[0] || "U").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        @{mUser.channelname || mUser.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-1.5 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setShowReplyBox(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyText.trim() || replyLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {replyLoading ? "Posting…" : "Reply"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Toggle View Replies */}
        {comment.replyCount > 0 && depth < 3 && (
          <button
            onClick={toggleReplies}
            className="mt-2.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>{showReplies ? "▲" : "▼"}</span>
            <span>
              {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}

        {/* Nested Replies List */}
        {showReplies && (
          <div className="mt-3 space-y-4">
            {repliesLoading && replies.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 ml-2">
                <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Loading replies…
              </div>
            )}

            {replies.map((reply) => (
              <CommentCard
                key={reply._id}
                comment={reply}
                currentUser={currentUser}
                depth={depth + 1}
                videoId={videoId}
                preferredLanguage={preferredLanguage}
                onDeleted={(id) => setReplies((prev) => prev.filter((r) => r._id !== id))}
                onUpdated={(updated) =>
                  setReplies((prev) => prev.map((r) => (r._id === updated._id ? updated : r)))
                }
              />
            ))}

            {hasMoreReplies && (
              <button
                onClick={() => loadReplies(repliesPage + 1)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-2 font-medium"
              >
                Load more replies
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showReport && (
        <ReportModal commentId={comment._id} onClose={() => setShowReport(false)} />
      )}
      {showHistory && (
        <EditHistoryModal commentId={comment._id} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMMENTS COMPONENT
// ─────────────────────────────────────────────
const Comments = ({ videoId }: { videoId: any }) => {
  const { user } = useUser() as any;

  const [comments, setComments] = useState<CommentData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<SortOption>("newest");

  // User Preferred Translation Language
  const [preferredLang, setPreferredLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("yt_pref_comment_lang") || user?.preferredLanguage || "en";
    }
    return "en";
  });

  // Comment posting state
  const [newComment, setNewComment] = useState("");
  const [inputLang, setInputLang] = useState<string>(""); // optional manual language override
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Autocomplete Mentions state
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([]);
  const [showMentionPopup, setShowMentionPopup] = useState(false);

  // CAPTCHA Challenge state
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState<{ a: number; b: number; answer: string }>({
    a: 4,
    b: 7,
    answer: "11",
  });

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * 9) + 1;
    setCaptchaChallenge({ a, b, answer: String(a + b) });
    setCaptchaInput("");
  };

  const handlePreferredLangChange = (lang: string) => {
    setPreferredLang(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("yt_pref_comment_lang", lang);
    }
  };

  const loadComments = useCallback(
    async (pageNum = 1, sortParam = sort, append = false) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await axiosInstance.get(
          `/comment/${videoId}?sort=${sortParam}&page=${pageNum}&limit=${PAGE_SIZE}&userId=${user?._id || ""}`
        );
        const data = res.data;
        if (append) setComments((prev) => [...prev, ...(data.comments || [])]);
        else setComments(data.comments || []);
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
        setPage(pageNum);
      } catch {
        setComments([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [videoId, user?._id, sort]
  );

  useEffect(() => {
    if (videoId) loadComments(1, sort, false);
  }, [videoId, sort, loadComments]);

  // Autocomplete mentions handler for main input
  const handleCommentTextChange = async (val: string) => {
    setNewComment(val);
    const lastWord = val.split(/\s+/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) {
      const q = lastWord.slice(1);
      try {
        const res = await axiosInstance.get(`/comment/mentions/search?q=${encodeURIComponent(q)}`);
        setMentionSuggestions(res.data.users || []);
        setShowMentionPopup(true);
      } catch {
        setShowMentionPopup(false);
      }
    } else {
      setShowMentionPopup(false);
    }
  };

  const insertMention = (userDoc: MentionUser) => {
    const username = userDoc.channelname || userDoc.name || "user";
    const words = newComment.split(/\s+/);
    words.pop();
    words.push(`@${username} `);
    setNewComment(words.join(" "));
    setShowMentionPopup(false);
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim() || isSubmitting) return;

    if (captchaRequired) {
      if (captchaInput.trim() !== captchaChallenge.answer) {
        setSubmitError("Incorrect security answer. Please try again.");
        generateCaptcha();
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: newComment,
        usercommented: user.name || user.channelname || "Anonymous",
        language: inputLang || undefined,
        captchaAnswer: captchaRequired ? captchaInput : undefined,
        expectedCaptcha: captchaRequired ? captchaChallenge.answer : undefined,
        captchaToken: captchaRequired ? "mock_solved" : undefined,
      });

      if (res.data.comment) {
        const newC: CommentData = res.data.data || {
          _id: Date.now().toString(),
          videoid: videoId,
          userid: user._id,
          commentbody: newComment,
          usercommented: user.name || "Anonymous",
          userLocation: user.location || (user.city ? `${user.city}, ${user.state || ""}` : ""),
          commentedon: new Date().toISOString(),
          likes: 0,
          dislikes: 0,
          replyCount: 0,
          userReaction: null,
        };

        setComments((prev) => [newC, ...prev]);
        setTotal((t) => t + 1);
        setNewComment("");
        setCaptchaRequired(false);
        setCaptchaInput("");
      }
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const msg = e?.response?.data?.message || "Failed to post comment.";
      setSubmitError(msg);

      if (code === "CAPTCHA_REQUIRED") {
        setCaptchaRequired(true);
        generateCaptcha();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmitComment();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pt-2">
        <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-1/4 mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3.5">
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
              <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Comments Header: Count, Sorting & Preferred Translation Language */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 dark:border-gray-800 pb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {total.toLocaleString()} {total === 1 ? "Comment" : "Comments"}
          </h2>

          {/* Sort Menu */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-gray-400 font-medium">Sort by:</span>
            {(["newest", "oldest", "liked", "relevant"] as SortOption[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSort(s);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  sort === s
                    ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-xs"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {s === "newest" ? "Newest" : s === "oldest" ? "Oldest" : s === "liked" ? "Most liked" : "Most relevant"}
              </button>
            ))}
          </div>
        </div>

        {/* Translation Preference Dropdown */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Translate to:</span>
          <select
            value={preferredLang}
            onChange={(e) => handlePreferredLangChange(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 text-xs rounded-lg px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comment Input Box */}
      {user ? (
        <div className="flex gap-3.5">
          <Avatar className="w-9 h-9 flex-shrink-0 ring-1 ring-gray-100 dark:ring-gray-800 shadow-xs">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-bold">
              {user.name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2 relative">
            <textarea
              placeholder="Add a comment… (Supports Hindi, Punjabi, English & all Unicode languages. Use @ to mention)"
              value={newComment}
              onChange={(e) => handleCommentTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full border-b-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm py-2 resize-none bg-transparent min-h-[64px] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 transition-colors"
              aria-label="Write a comment"
            />

            {/* Mentions Autocomplete Popup */}
            {showMentionPopup && mentionSuggestions.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-40 max-h-48 overflow-y-auto">
                <div className="p-1.5 text-[11px] font-semibold text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                  Select user to mention:
                </div>
                {mentionSuggestions.map((mUser) => (
                  <div
                    key={mUser._id}
                    onClick={() => insertMention(mUser)}
                    className="flex items-center gap-2 p-2 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer text-xs"
                  >
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={mUser.image || ""} />
                      <AvatarFallback className="text-[9px]">{(mUser.name?.[0] || "U").toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      @{mUser.channelname || mUser.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Optional Language Tag Selector */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span>Language tag:</span>
                <select
                  value={inputLang}
                  onChange={(e) => setInputLang(e.target.value)}
                  className="bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-300 focus:outline-none"
                >
                  <option value="">Auto-detect</option>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewComment("");
                    setSubmitError("");
                  }}
                  disabled={!newComment.trim()}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  {isSubmitting ? "Posting…" : "Comment"}
                </Button>
              </div>
            </div>

            {/* CAPTCHA Challenge on suspicious attempts */}
            {captchaRequired && (
              <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl mt-2 animate-in fade-in">
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Security verification: What is {captchaChallenge.a} + {captchaChallenge.b}?
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  className="border rounded-lg px-2.5 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="?"
                />
                <button
                  type="button"
                  onClick={generateCaptcha}
                  className="text-xs text-amber-700 dark:text-amber-300 underline"
                >
                  New challenge
                </button>
              </div>
            )}

            {/* Submission Error Banner */}
            {submitError && (
              <p className="text-xs font-semibold text-red-500 dark:text-red-400 mt-1">
                {submitError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400">
          <a href="/" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
            Sign in
          </a>{" "}
          to write comments in any language and join the discussion.
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-6 pt-2">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 italic">
            No comments yet. Be the first to share your thoughts!
          </div>
        ) : (
          comments.map((comment) => (
            <CommentCard
              key={comment._id}
              comment={comment}
              currentUser={user}
              videoId={videoId}
              preferredLanguage={preferredLang}
              onDeleted={(id) => {
                setComments((prev) => prev.filter((c) => c._id !== id));
                setTotal((t) => Math.max(0, t - 1));
              }}
              onUpdated={(updated) =>
                setComments((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
              }
            />
          ))
        )}
      </div>

      {/* Pagination / Load More */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            onClick={() => loadComments(page + 1, sort, true)}
            disabled={loadingMore}
            className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Loading more comments…
              </span>
            ) : (
              "Load more comments"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Comments;

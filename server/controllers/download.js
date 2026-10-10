import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import Download from "../Modals/Download.js";
import {
  SUBSCRIPTION_PLANS,
  DOWNLOAD_DUPLICATE_WINDOW_MINUTES,
  getPlanConfig,
} from "../config/subscriptionConfig.js";
import { extractClientAudit } from "../utils/clientAudit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: current date key in UTC (YYYY-MM-DD)
function getTodayDateKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// Helper: beginning of current UTC day
function getStartOfTodayUTC() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
}

// Helper: Extract authenticated user from request
async function getAuthenticatedUser(req) {
  const userId =
    req.headers["x-user-id"] ||
    (req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7).trim()
        : null) ||
    req.query.userId ||
    req.body?.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  const userDoc = await users.findById(userId);
  return userDoc;
}

// Helper: Determine effective subscription plan and whether it is expired
function getEffectivePlan(userDoc) {
  const sub = userDoc.subscription || {
    plan: "FREE",
    isActive: true,
    endDate: null,
  };

  const configuredPlan = (sub.plan || "FREE").toUpperCase();

  // If free plan, it never expires
  if (configuredPlan === "FREE") {
    return {
      plan: "FREE",
      isExpired: false,
      isActive: true,
      endDate: sub.endDate || null,
    };
  }

  const expiry = sub.expiryDate || sub.endDate;

  // Check if paid subscription is expired
  if (expiry && new Date(expiry) < new Date()) {
    return {
      plan: "FREE", // Downgrade to FREE quota
      originalPlan: configuredPlan,
      isExpired: true,
      isActive: false,
      endDate: expiry,
      expiryDate: expiry,
    };
  }

  if (sub.isActive === false || sub.status === "EXPIRED" || sub.status === "FAILED") {
    return {
      plan: "FREE",
      originalPlan: configuredPlan,
      isExpired: true,
      isActive: false,
      endDate: expiry,
      expiryDate: expiry,
    };
  }

  return {
    plan: configuredPlan,
    isExpired: false,
    isActive: true,
    endDate: expiry || null,
    expiryDate: expiry || null,
  };
}

// Helper: Get user's current daily quota usage and remaining count
async function calculateUserQuota(userDoc) {
  const effective = getEffectivePlan(userDoc);
  const planConfig = getPlanConfig(effective.plan);
  const dailyLimit = planConfig.dailyDownloadLimit;

  const startOfToday = getStartOfTodayUTC();

  // Count authorized/completed/downloading downloads that consumed quota today
  const usedToday = await Download.countDocuments({
    userId: userDoc._id,
    downloadTimestamp: { $gte: startOfToday },
    status: { $in: ["completed", "downloading", "authorized"] },
    isDuplicateReused: false,
  });

  const remaining = Math.max(0, dailyLimit - usedToday);

  return {
    effectivePlan: effective.plan,
    originalPlan: effective.originalPlan || effective.plan,
    isExpired: effective.isExpired,
    endDate: effective.endDate,
    dailyLimit,
    usedToday,
    remaining,
  };
}

/**
 * GET /download/plans
 * Returns all subscription plans and configured daily download limits
 */
export const getSubscriptionPlans = async (req, res) => {
  return res.status(200).json({
    success: true,
    plans: SUBSCRIPTION_PLANS,
    duplicateWindowMinutes: DOWNLOAD_DUPLICATE_WINDOW_MINUTES,
  });
};

/**
 * GET /download/quota
 * Returns authoritative user download quota, subscription plan, and usage
 */
export const getUserQuota = async (req, res) => {
  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view download quota",
        code: "AUTH_REQUIRED",
      });
    }

    const quota = await calculateUserQuota(userDoc);

    return res.status(200).json({
      success: true,
      plan: quota.effectivePlan,
      originalPlan: quota.originalPlan,
      isExpired: quota.isExpired,
      endDate: quota.endDate,
      dailyLimit: quota.dailyLimit,
      downloadsToday: quota.usedToday,
      remainingDownloads: quota.remaining,
      duplicateWindowMinutes: DOWNLOAD_DUPLICATE_WINDOW_MINUTES,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getUserQuota error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quota",
      error: error.message,
    });
  }
};

/**
 * POST /download/authorize/:videoId
 * Pre-authorizes a video download before starting stream
 */
export const authorizeDownload = async (req, res) => {
  const { videoId } = req.params;
  const audit = extractClientAudit(req);

  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Please log in to download videos",
        code: "AUTH_REQUIRED",
      });
    }

    if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID",
        code: "INVALID_VIDEO_ID",
      });
    }

    const videoDoc = await video.findById(videoId);
    if (!videoDoc) {
      return res.status(404).json({
        success: false,
        message: "Video is not available for download",
        code: "VIDEO_NOT_FOUND",
      });
    }

    // Verify physical file exists on disk
    const cleanRelPath = String(videoDoc.filepath || "").replace(/\\/g, "/");
    const fullPath = path.resolve(__dirname, "..", cleanRelPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        message: "Video file is not available on server",
        code: "FILE_UNAVAILABLE",
      });
    }

    const quota = await calculateUserQuota(userDoc);

    // Check duplicate download window
    const duplicateCutoff = new Date(
      Date.now() - DOWNLOAD_DUPLICATE_WINDOW_MINUTES * 60 * 1000
    );
    const recentDownload = await Download.findOne({
      userId: userDoc._id,
      videoId: videoDoc._id,
      downloadTimestamp: { $gte: duplicateCutoff },
      status: { $in: ["completed", "downloading", "authorized"] },
    }).sort({ downloadTimestamp: -1 });

    const isDuplicate = Boolean(recentDownload);

    // If not a duplicate and no remaining downloads, deny
    if (!isDuplicate && quota.remaining <= 0) {
      // Record denied attempt
      await Download.create({
        userId: userDoc._id,
        videoId: videoDoc._id,
        videoTitle: videoDoc.videotitle || "Untitled Video",
        status: "denied",
        fileSize: videoDoc.filesize || "0",
        subscriptionPlan: quota.effectivePlan,
        ipAddress: audit.ipAddress,
        deviceInformation: audit.deviceInformation,
        browser: audit.browser,
        userAgent: audit.userAgent,
        failureReason: "Daily download limit reached",
        isDuplicateReused: false,
      });

      return res.status(403).json({
        success: false,
        message: "Daily download limit reached",
        remainingDownloads: 0,
        limit: quota.dailyLimit,
        plan: quota.effectivePlan,
        isExpired: quota.isExpired,
        code: "LIMIT_REACHED",
      });
    }

    return res.status(200).json({
      success: true,
      message: isDuplicate
        ? "Download authorized (Duplicate download window active — no quota deducted)"
        : "Download authorized",
      remainingDownloads: quota.remaining,
      limit: quota.dailyLimit,
      plan: quota.effectivePlan,
      isDuplicate,
      isExpired: quota.isExpired,
    });
  } catch (error) {
    console.error("authorizeDownload error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
      error: error.message,
    });
  }
};

/**
 * GET /download/video/:videoId
 * Securely streams the authorized video file with attachment headers and audit recording
 */
export const downloadVideo = async (req, res) => {
  const { videoId } = req.params;
  const audit = extractClientAudit(req);

  try {
    // 1. Authenticate user
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Please log in to download videos",
        code: "AUTH_REQUIRED",
      });
    }

    // 2. Validate video
    if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID",
        code: "INVALID_VIDEO_ID",
      });
    }

    const videoDoc = await video.findById(videoId);
    if (!videoDoc) {
      return res.status(404).json({
        success: false,
        message: "Video is not available for download",
        code: "VIDEO_NOT_FOUND",
      });
    }

    // 3. Verify file exists on disk
    const cleanRelPath = String(videoDoc.filepath || "").replace(/\\/g, "/");
    const fullPath = path.resolve(__dirname, "..", cleanRelPath);
    if (!fs.existsSync(fullPath)) {
      await Download.create({
        userId: userDoc._id,
        videoId: videoDoc._id,
        videoTitle: videoDoc.videotitle || "Untitled Video",
        status: "failed",
        fileSize: videoDoc.filesize || "0",
        subscriptionPlan: "FREE",
        ipAddress: audit.ipAddress,
        deviceInformation: audit.deviceInformation,
        browser: audit.browser,
        userAgent: audit.userAgent,
        failureReason: "Video file missing on server disk",
      });

      return res.status(404).json({
        success: false,
        message: "Video file is not available on server",
        code: "FILE_UNAVAILABLE",
      });
    }

    const fileStats = fs.statSync(fullPath);

    // 4. Calculate subscription plan & quota
    const quota = await calculateUserQuota(userDoc);
    const todayKey = getTodayDateKey();

    // 5. Check duplicate download window
    const duplicateCutoff = new Date(
      Date.now() - DOWNLOAD_DUPLICATE_WINDOW_MINUTES * 60 * 1000
    );
    const recentDownload = await Download.findOne({
      userId: userDoc._id,
      videoId: videoDoc._id,
      downloadTimestamp: { $gte: duplicateCutoff },
      status: { $in: ["completed", "downloading", "authorized"] },
    }).sort({ downloadTimestamp: -1 });

    const isDuplicate = Boolean(recentDownload);

    // 6. Enforce quota & prevent race conditions with atomic reservation
    if (!isDuplicate) {
      if (quota.remaining <= 0) {
        await Download.create({
          userId: userDoc._id,
          videoId: videoDoc._id,
          videoTitle: videoDoc.videotitle || "Untitled Video",
          status: "denied",
          fileSize: String(fileStats.size),
          subscriptionPlan: quota.effectivePlan,
          ipAddress: audit.ipAddress,
          deviceInformation: audit.deviceInformation,
          browser: audit.browser,
          userAgent: audit.userAgent,
          failureReason: "Daily download limit reached",
          isDuplicateReused: false,
        });

        return res.status(403).json({
          success: false,
          message: "Daily download limit reached",
          remainingDownloads: 0,
          limit: quota.dailyLimit,
          plan: quota.effectivePlan,
          isExpired: quota.isExpired,
          code: "LIMIT_REACHED",
        });
      }

      // Atomic reservation to prevent race conditions on simultaneous requests
      const reservation = await users.findOneAndUpdate(
        {
          _id: userDoc._id,
          $or: [
            { "dailyUsage.dateKey": { $ne: todayKey } },
            {
              "dailyUsage.dateKey": todayKey,
              "dailyUsage.count": { $lt: quota.dailyLimit },
            },
          ],
        },
        [
          {
            $set: {
              dailyUsage: {
                dateKey: todayKey,
                count: {
                  $cond: {
                    if: { $eq: ["$dailyUsage.dateKey", todayKey] },
                    then: { $add: ["$dailyUsage.count", 1] },
                    else: 1,
                  },
                },
              },
            },
          },
        ],
        { new: true }
      );

      if (!reservation) {
        // Race condition caught: another concurrent request just consumed the last quota slot
        await Download.create({
          userId: userDoc._id,
          videoId: videoDoc._id,
          videoTitle: videoDoc.videotitle || "Untitled Video",
          status: "denied",
          fileSize: String(fileStats.size),
          subscriptionPlan: quota.effectivePlan,
          ipAddress: audit.ipAddress,
          deviceInformation: audit.deviceInformation,
          browser: audit.browser,
          userAgent: audit.userAgent,
          failureReason: "Concurrent quota limit reached",
          isDuplicateReused: false,
        });

        return res.status(403).json({
          success: false,
          message: "Daily download limit reached",
          remainingDownloads: 0,
          limit: quota.dailyLimit,
          plan: quota.effectivePlan,
          code: "LIMIT_REACHED",
        });
      }
    }

    // 7. Create audit download record
    const downloadRecord = await Download.create({
      userId: userDoc._id,
      videoId: videoDoc._id,
      videoTitle: videoDoc.videotitle || "Untitled Video",
      status: "authorized",
      fileSize: String(fileStats.size),
      subscriptionPlan: quota.effectivePlan,
      ipAddress: audit.ipAddress,
      deviceInformation: audit.deviceInformation,
      browser: audit.browser,
      userAgent: audit.userAgent,
      isDuplicateReused: isDuplicate,
    });

    // 8. Stream the file with Content-Disposition
    const safeTitle = (videoDoc.videotitle || "video")
      .replace(/[^\w\s.-]/gi, "")
      .trim() || "video";
    const ext = path.extname(videoDoc.filename || videoDoc.filepath) || ".mp4";
    const downloadFilename = safeTitle.toLowerCase().endsWith(ext.toLowerCase())
      ? safeTitle
      : `${safeTitle}${ext}`;

    const newRemaining = isDuplicate ? quota.remaining : Math.max(0, quota.remaining - 1);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(
        downloadFilename
      )}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`
    );
    res.setHeader("Content-Type", videoDoc.filetype || "video/mp4");
    res.setHeader("Content-Length", fileStats.size);
    res.setHeader("X-Download-Id", downloadRecord._id.toString());
    res.setHeader("X-Remaining-Downloads", String(newRemaining));
    res.setHeader("X-Subscription-Plan", quota.effectivePlan);

    const stream = fs.createReadStream(fullPath);

    stream.on("open", async () => {
      await Download.findByIdAndUpdate(downloadRecord._id, {
        status: "downloading",
      });
    });

    res.on("finish", async () => {
      await Download.findByIdAndUpdate(downloadRecord._id, {
        status: "completed",
      });
    });

    req.on("close", async () => {
      if (!res.writableEnded) {
        await Download.findByIdAndUpdate(downloadRecord._id, {
          status: "interrupted",
          failureReason: "Client closed connection before completion",
        });
        // Refund atomic count if interrupted and was not a duplicate
        if (!isDuplicate) {
          await users.updateOne(
            {
              _id: userDoc._id,
              "dailyUsage.dateKey": todayKey,
              "dailyUsage.count": { $gt: 0 },
            },
            { $inc: { "dailyUsage.count": -1 } }
          );
        }
      }
    });

    stream.on("error", async (streamErr) => {
      console.error("Download stream error:", streamErr);
      await Download.findByIdAndUpdate(downloadRecord._id, {
        status: "failed",
        failureReason: streamErr.message,
      });
      if (!isDuplicate) {
        await users.updateOne(
          {
            _id: userDoc._id,
            "dailyUsage.dateKey": todayKey,
            "dailyUsage.count": { $gt: 0 },
          },
          { $inc: { "dailyUsage.count": -1 } }
        );
      }
      if (!res.headersSent) {
        return res
          .status(500)
          .json({ success: false, message: "Download stream failed" });
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error("downloadVideo error:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Download failed",
        error: error.message,
      });
    }
  }
};

/**
 * GET /download/history
 * Returns the authenticated user's download history with video details
 */
export const getDownloadHistory = async (req, res) => {
  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view download history",
        code: "AUTH_REQUIRED",
      });
    }

    const limit = parseInt(req.query.limit || "50", 10);
    const page = parseInt(req.query.page || "1", 10);
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      Download.find({ userId: userDoc._id })
        .sort({ downloadTimestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate("videoId", "videotitle filepath filesize videochanel createdAt")
        .lean(),
      Download.countDocuments({ userId: userDoc._id }),
    ]);

    const quota = await calculateUserQuota(userDoc);

    return res.status(200).json({
      success: true,
      history,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      quota: {
        plan: quota.effectivePlan,
        dailyLimit: quota.dailyLimit,
        downloadsToday: quota.usedToday,
        remainingDownloads: quota.remaining,
      },
    });
  } catch (error) {
    console.error("getDownloadHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch download history",
      error: error.message,
    });
  }
};

/**
 * GET /download/:downloadId
 * Returns a specific download record
 */
export const getDownloadById = async (req, res) => {
  const { downloadId } = req.params;

  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(downloadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid download record ID",
      });
    }

    const record = await Download.findById(downloadId)
      .populate("videoId", "videotitle filepath filesize videochanel")
      .lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Download record not found",
      });
    }

    // Normal users can only view their own record
    if (
      String(record.userId) !== String(userDoc._id) &&
      userDoc.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    return res.status(200).json({
      success: true,
      record,
    });
  } catch (error) {
    console.error("getDownloadById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch download record",
      error: error.message,
    });
  }
};

/**
 * POST /download/subscription/upgrade
 * Manage/upgrade subscription plan (FREE, BRONZE, SILVER, GOLD)
 * Supports setting expiry for testing or real plans
 */
export const updateSubscription = async (req, res) => {
  const { plan, durationDays, expireNow } = req.body;

  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const normalizedPlan = (plan || "FREE").toUpperCase();
    if (!["FREE", "BRONZE", "SILVER", "GOLD"].includes(normalizedPlan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Choose from FREE, BRONZE, SILVER, GOLD",
      });
    }

    if (normalizedPlan !== "FREE" && !expireNow) {
      return res.status(403).json({
        success: false,
        message: "Paid plans can only be activated after a verified Razorpay payment.",
      });
    }

    if (expireNow && process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        success: false,
        message: "Subscription expiry simulation is only available in development.",
      });
    }

    let endDate = null;
    let isActive = true;

    if (expireNow) {
      // Set endDate in the past to test expired state
      endDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      isActive = false;
    } else if (durationDays) {
      endDate = new Date(
        Date.now() + parseInt(durationDays, 10) * 24 * 60 * 60 * 1000
      );
    } else if (normalizedPlan !== "FREE") {
      // Default 30 days for paid subscriptions
      endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    userDoc.subscription = {
      plan: normalizedPlan,
      startDate: new Date(),
      endDate,
      isActive,
    };

    await userDoc.save();

    const quota = await calculateUserQuota(userDoc);

    return res.status(200).json({
      success: true,
      message: `Subscription successfully updated to ${normalizedPlan}`,
      subscription: userDoc.subscription,
      quota,
    });
  } catch (error) {
    console.error("updateSubscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update subscription",
      error: error.message,
    });
  }
};

/**
 * GET /download/admin/all
 * Admin audit route to inspect all download records
 */
export const getAdminDownloadAudit = async (req, res) => {
  try {
    const userDoc = await getAuthenticatedUser(req);
    if (!userDoc || userDoc.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const records = await Download.find()
      .sort({ downloadTimestamp: -1 })
      .limit(100)
      .populate("userId", "name email channelname")
      .populate("videoId", "videotitle filepath")
      .lean();

    return res.status(200).json({
      success: true,
      records,
    });
  } catch (error) {
    console.error("getAdminDownloadAudit error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit records",
      error: error.message,
    });
  }
};

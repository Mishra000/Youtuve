import express from "express";
import {
  getSubscriptionPlans,
  getUserQuota,
  authorizeDownload,
  downloadVideo,
  getDownloadHistory,
  getDownloadById,
  updateSubscription,
  getAdminDownloadAudit,
} from "../controllers/download.js";

const router = express.Router();

// Public / info
router.get("/plans", getSubscriptionPlans);

// Quota & authorization
router.get("/quota", getUserQuota);
router.post("/authorize/:videoId", authorizeDownload);

// Secure streaming download
router.get("/video/:videoId", downloadVideo);

// History & records
router.get("/history", getDownloadHistory);
router.get("/admin/all", getAdminDownloadAudit);
router.get("/:downloadId", getDownloadById);

// Subscription management
router.post("/subscription/upgrade", updateSubscription);

export default router;

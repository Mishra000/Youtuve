import express from "express";
import {
  // Original routes (preserved)
  postcomment,
  getallcomment,
  deletecomment,
  editcomment,
  // Extended routes
  getReplies,
  reactToComment,
  reportComment,
  translateComment,
  getCommentHistory,
  getMentionSuggestions,
  // Admin routes
  getReports,
  moderateReport,
  restoreComment,
  moderateComment,
  getModerationLogs,
} from "../controllers/comment.js";

const routes = express.Router();

// ── Specific routes FIRST (to prevent /:videoid from matching them) ──
// Mention search autocomplete
routes.get("/mentions/search", getMentionSuggestions);

// Admin moderation endpoints
routes.get("/admin/reports", getReports);               // GET /comment/admin/reports?userId=xxx
routes.put("/admin/reports/:reportId", moderateReport); // PUT /comment/admin/reports/:reportId
routes.put("/admin/:id/restore", restoreComment);       // PUT /comment/admin/:id/restore
routes.put("/admin/:id/moderate", moderateComment);     // PUT /comment/admin/:id/moderate
routes.get("/admin/logs", getModerationLogs);           // GET /comment/admin/logs?userId=xxx

// ── Original routes (preserved) ──
routes.post("/postcomment", postcomment);               // POST /comment/postcomment
routes.delete("/deletecomment/:id", deletecomment);     // DELETE /comment/deletecomment/:id
routes.post("/editcomment/:id", editcomment);           // POST /comment/editcomment/:id

// ── Comment Action routes ──
routes.post("/:id/react", reactToComment);              // POST /comment/:id/react
routes.post("/:id/report", reportComment);              // POST /comment/:id/report
routes.post("/:id/translate", translateComment);        // POST /comment/:id/translate
routes.get("/:id/history", getCommentHistory);          // GET /comment/:id/history

// ── Video Comments & Replies (Parameterized video routes) ──
routes.get("/:videoid/replies/:parentId", getReplies);  // GET /comment/:videoid/replies/:parentId
routes.get("/:videoid", getallcomment);                // GET /comment/:videoid?sort=newest&page=1&userId=xxx

export default routes;

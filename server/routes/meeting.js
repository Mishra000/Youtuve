import express from "express";
import {
  createMeeting,
  getMeeting,
  joinMeeting,
  endMeeting,
  lockMeeting,
  unlockMeeting,
  promoteCohost,
} from "../controllers/meeting.js";

const router = express.Router();

router.post("/create", createMeeting);
router.get("/:roomId", getMeeting);
router.post("/:roomId/join", joinMeeting);
router.post("/:roomId/end", endMeeting);
router.post("/:roomId/lock", lockMeeting);
router.post("/:roomId/unlock", unlockMeeting);
router.post("/:roomId/promote-cohost", promoteCohost);

export default router;

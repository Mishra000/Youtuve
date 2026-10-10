import { nanoid } from "nanoid";
import Meeting from "../Modals/Meeting.js";
import users from "../Modals/Auth.js";

// POST /meeting/create
export const createMeeting = async (req, res) => {
  const { userId, userName } = req.body;
  if (!userId || !userName) {
    return res.status(400).json({ message: "userId and userName are required" });
  }

  try {
    // Verify user exists
    const userExists = await users.findById(userId);
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const roomId = nanoid(10).toUpperCase();
    const maxParticipants = parseInt(
      process.env.MAX_MEETING_PARTICIPANTS || "50"
    );

    const meeting = await Meeting.create({
      roomId,
      hostId: userId,
      hostName: userName,
      maxParticipants,
    });

    return res.status(201).json({ meeting });
  } catch (error) {
    console.error("createMeeting error:", error);
    return res.status(500).json({ message: "Failed to create meeting" });
  }
};

// GET /meeting/:roomId
export const getMeeting = async (req, res) => {
  const { roomId } = req.params;
  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    return res.status(200).json({ meeting });
  } catch (error) {
    console.error("getMeeting error:", error);
    return res.status(500).json({ message: "Failed to get meeting" });
  }
};

// POST /meeting/:roomId/join  — validates & records intent; actual join via socket
export const joinMeeting = async (req, res) => {
  const { roomId } = req.params;
  const { userId, userName } = req.body;

  if (!userId || !userName) {
    return res.status(400).json({ message: "userId and userName are required" });
  }

  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    if (meeting.status === "ended") {
      return res.status(410).json({ message: "This meeting has ended" });
    }
    if (meeting.isLocked && String(meeting.hostId) !== String(userId)) {
      return res.status(403).json({ message: "This meeting is locked by the host" });
    }
    const currentCount = meeting.participants.length;
    if (currentCount >= meeting.maxParticipants) {
      return res.status(403).json({ message: "Meeting is full" });
    }
    return res.status(200).json({ meeting });
  } catch (error) {
    console.error("joinMeeting error:", error);
    return res.status(500).json({ message: "Failed to join meeting" });
  }
};

// POST /meeting/:roomId/end
export const endMeeting = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    if (String(meeting.hostId) !== String(userId)) {
      return res.status(403).json({ message: "Only the host can end the meeting" });
    }
    meeting.status = "ended";
    meeting.endedAt = new Date();
    await meeting.save();
    return res.status(200).json({ message: "Meeting ended" });
  } catch (error) {
    console.error("endMeeting error:", error);
    return res.status(500).json({ message: "Failed to end meeting" });
  }
};

// POST /meeting/:roomId/lock
export const lockMeeting = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (String(meeting.hostId) !== String(userId)) {
      return res.status(403).json({ message: "Only the host can lock the meeting" });
    }
    meeting.isLocked = true;
    await meeting.save();
    return res.status(200).json({ message: "Meeting locked" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to lock meeting" });
  }
};

// POST /meeting/:roomId/unlock
export const unlockMeeting = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (String(meeting.hostId) !== String(userId)) {
      return res.status(403).json({ message: "Only the host can unlock the meeting" });
    }
    meeting.isLocked = false;
    await meeting.save();
    return res.status(200).json({ message: "Meeting unlocked" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to unlock meeting" });
  }
};

// POST /meeting/:roomId/promote-cohost
export const promoteCohost = async (req, res) => {
  const { roomId } = req.params;
  const { hostId, targetUserId } = req.body;

  try {
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (String(meeting.hostId) !== String(hostId)) {
      return res.status(403).json({ message: "Only the host can assign co-hosts" });
    }
    if (!meeting.coHosts.includes(targetUserId)) {
      meeting.coHosts.push(targetUserId);
      await meeting.save();
    }
    return res.status(200).json({ message: "Co-host assigned" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to promote co-host" });
  }
};

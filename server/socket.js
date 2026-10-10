import { Server } from "socket.io";
import Meeting from "./Modals/Meeting.js";

// In-memory room state: roomId -> Map<socketId, participantData>
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function getRoomParticipants(roomId) {
  const room = getRoom(roomId);
  return Array.from(room.values());
}

export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);

    // ─── JOIN ROOM ──────────────────────────────────────────────
    socket.on("join-room", async ({ roomId, userId, userName, userImage }) => {
      try {
        // Validate meeting exists and is joinable
        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) {
          socket.emit("error", { message: "Meeting not found" });
          return;
        }
        if (meeting.status === "ended") {
          socket.emit("error", { message: "This meeting has ended" });
          return;
        }
        if (meeting.isLocked && String(meeting.hostId) !== String(userId)) {
          socket.emit("error", { message: "This meeting is locked by the host" });
          return;
        }

        const room = getRoom(roomId);
        const maxP = meeting.maxParticipants || 50;
        if (room.size >= maxP) {
          socket.emit("error", { message: "Meeting is full" });
          return;
        }

        const isHost = String(meeting.hostId) === String(userId);
        const isCoHost = meeting.coHosts.some(
          (ch) => String(ch) === String(userId)
        );

        const participant = {
          socketId: socket.id,
          userId,
          userName: userName || "Anonymous",
          userImage: userImage || "",
          isHost,
          isCoHost,
          isMuted: false,
          isCameraOff: false,
          isHandRaised: false,
          isScreenSharing: false,
          joinedAt: Date.now(),
        };

        room.set(socket.id, participant);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.userId = userId;

        // Tell joining user about existing participants
        const existingParticipants = getRoomParticipants(roomId).filter(
          (p) => p.socketId !== socket.id
        );
        socket.emit("room-joined", {
          participants: existingParticipants,
          meeting: {
            roomId: meeting.roomId,
            hostId: String(meeting.hostId),
            isLocked: meeting.isLocked,
            chatEnabled: meeting.chatEnabled,
            screenShareEnabled: meeting.screenShareEnabled,
            createdAt: meeting.createdAt,
          },
          you: participant,
        });

        // Notify everyone else
        socket.to(roomId).emit("participant-joined", { participant });

        console.log(
          `[Socket] ${userName} (${socket.id}) joined room ${roomId}. Room size: ${room.size}`
        );
      } catch (err) {
        console.error("[Socket] join-room error:", err);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // ─── WebRTC SIGNALING ───────────────────────────────────────
    socket.on("offer", ({ to, offer, from }) => {
      io.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
      io.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    // ─── PARTICIPANT STATE UPDATES ──────────────────────────────
    socket.on("participant-updated", ({ roomId, updates }) => {
      const room = getRoom(roomId);
      const participant = room.get(socket.id);
      if (!participant) return;
      Object.assign(participant, updates);
      room.set(socket.id, participant);
      socket.to(roomId).emit("participant-updated", {
        socketId: socket.id,
        updates,
      });
    });

    // ─── RAISE / LOWER HAND ────────────────────────────────────
    socket.on("raise-hand", ({ roomId }) => {
      const room = getRoom(roomId);
      const p = room.get(socket.id);
      if (!p) return;
      p.isHandRaised = true;
      room.set(socket.id, p);
      io.to(roomId).emit("participant-updated", {
        socketId: socket.id,
        updates: { isHandRaised: true },
      });
    });

    socket.on("lower-hand", ({ roomId }) => {
      const room = getRoom(roomId);
      const p = room.get(socket.id);
      if (!p) return;
      p.isHandRaised = false;
      room.set(socket.id, p);
      io.to(roomId).emit("participant-updated", {
        socketId: socket.id,
        updates: { isHandRaised: false },
      });
    });

    // ─── CHAT ───────────────────────────────────────────────────
    socket.on("chat-message", ({ roomId, message, senderName, senderId }) => {
      io.to(roomId).emit("chat-message", {
        id: Date.now().toString(),
        senderId,
        senderName,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // ─── SCREEN SHARE ───────────────────────────────────────────
    socket.on("screen-share-started", ({ roomId }) => {
      const room = getRoom(roomId);
      const p = room.get(socket.id);
      if (p) {
        p.isScreenSharing = true;
        room.set(socket.id, p);
      }
      socket.to(roomId).emit("screen-share-started", { socketId: socket.id });
    });

    socket.on("screen-share-stopped", ({ roomId }) => {
      const room = getRoom(roomId);
      const p = room.get(socket.id);
      if (p) {
        p.isScreenSharing = false;
        room.set(socket.id, p);
      }
      socket.to(roomId).emit("screen-share-stopped", { socketId: socket.id });
    });

    // ─── HOST: MUTE PARTICIPANT ─────────────────────────────────
    socket.on("mute-participant", ({ roomId, targetSocketId, requesterId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || (!requester.isHost && !requester.isCoHost)) return;
      const target = room.get(targetSocketId);
      if (target) {
        target.isMuted = true;
        room.set(targetSocketId, target);
        io.to(targetSocketId).emit("force-muted");
        io.to(roomId).emit("participant-updated", {
          socketId: targetSocketId,
          updates: { isMuted: true },
        });
      }
    });

    // ─── HOST: REMOVE PARTICIPANT ───────────────────────────────
    socket.on("remove-participant", ({ roomId, targetSocketId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || (!requester.isHost && !requester.isCoHost)) return;
      const target = room.get(targetSocketId);
      if (target) {
        io.to(targetSocketId).emit("removed-from-meeting", {
          message: "You have been removed from the meeting by the host.",
        });
        // Disconnect the target from the room
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          room.delete(targetSocketId);
          targetSocket.leave(roomId);
        }
        io.to(roomId).emit("participant-left", { socketId: targetSocketId });
      }
    });

    // ─── HOST: LOCK / UNLOCK ────────────────────────────────────
    socket.on("meeting-locked", async ({ roomId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || !requester.isHost) return;
      await Meeting.findOneAndUpdate({ roomId }, { isLocked: true });
      io.to(roomId).emit("meeting-locked");
    });

    socket.on("meeting-unlocked", async ({ roomId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || !requester.isHost) return;
      await Meeting.findOneAndUpdate({ roomId }, { isLocked: false });
      io.to(roomId).emit("meeting-unlocked");
    });

    // ─── HOST: ASSIGN / REMOVE CO-HOST ─────────────────────────
    socket.on("assign-cohost", async ({ roomId, targetSocketId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || !requester.isHost) return;
      const target = room.get(targetSocketId);
      if (!target) return;
      target.isCoHost = true;
      room.set(targetSocketId, target);
      await Meeting.findOneAndUpdate(
        { roomId },
        { $addToSet: { coHosts: target.userId } }
      );
      io.to(roomId).emit("participant-updated", {
        socketId: targetSocketId,
        updates: { isCoHost: true },
      });
    });

    socket.on("remove-cohost", async ({ roomId, targetSocketId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || !requester.isHost) return;
      const target = room.get(targetSocketId);
      if (!target) return;
      target.isCoHost = false;
      room.set(targetSocketId, target);
      await Meeting.findOneAndUpdate(
        { roomId },
        { $pull: { coHosts: target.userId } }
      );
      io.to(roomId).emit("participant-updated", {
        socketId: targetSocketId,
        updates: { isCoHost: false },
      });
    });

    // ─── HOST: END MEETING ──────────────────────────────────────
    socket.on("end-meeting", async ({ roomId }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || !requester.isHost) return;
      await Meeting.findOneAndUpdate(
        { roomId },
        { status: "ended", endedAt: new Date() }
      );
      io.to(roomId).emit("meeting-ended", {
        message: "The host has ended the meeting.",
      });
      rooms.delete(roomId);
    });

    // ─── HOST: TOGGLE PERMISSIONS ───────────────────────────────
    socket.on("toggle-chat", async ({ roomId, enabled }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || (!requester.isHost && !requester.isCoHost)) return;
      await Meeting.findOneAndUpdate({ roomId }, { chatEnabled: enabled });
      io.to(roomId).emit("chat-permission-changed", { enabled });
    });

    socket.on("toggle-screenshare", async ({ roomId, enabled }) => {
      const room = getRoom(roomId);
      const requester = room.get(socket.id);
      if (!requester || (!requester.isHost && !requester.isCoHost)) return;
      await Meeting.findOneAndUpdate({ roomId }, { screenShareEnabled: enabled });
      io.to(roomId).emit("screenshare-permission-changed", { enabled });
    });

    // ─── DISCONNECT ─────────────────────────────────────────────
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      const participant = room.get(socket.id);
      room.delete(socket.id);
      if (participant) {
        io.to(roomId).emit("participant-left", { socketId: socket.id });
      }
      if (room.size === 0) {
        rooms.delete(roomId);
      }
      console.log(`[Socket] ${socket.id} disconnected from room ${roomId}`);
    });

    socket.on("leave-room", ({ roomId }) => {
      const room = getRoom(roomId);
      room.delete(socket.id);
      socket.leave(roomId);
      socket.to(roomId).emit("participant-left", { socketId: socket.id });
      socket.data.roomId = null;
    });
  });

  return io;
}

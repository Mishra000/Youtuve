import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { toast } from "sonner";
import { Clock, FlipHorizontal, Copy, Check, Video } from "lucide-react";

import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { useWebRTC, WebRTCParticipant } from "@/lib/useWebRTC";
import { Socket } from "socket.io-client";

import PreJoin from "@/components/meet/PreJoin";
import ParticipantTile from "@/components/meet/ParticipantTile";
import MeetingControls from "@/components/meet/MeetingControls";
import ParticipantsPanel from "@/components/meet/ParticipantsPanel";
import ChatPanel, { ChatMessage } from "@/components/meet/ChatPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeetingInfo {
  roomId: string;
  hostId: string;
  isLocked: boolean;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  createdAt: string;
}

// ─── Call Duration Timer ───────────────────────────────────────────────────────

function useCallTimer(startTime: number | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const fmt = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${fmt(h)}:${fmt(m)}:${fmt(s)}` : `${fmt(m)}:${fmt(s)}`;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MeetRoomPage() {
  const router = useRouter();
  const { roomId } = router.query as { roomId: string };
  const { user, handlegooglesignin } = useUser();

  // Phase: "prejoin" | "in-meeting" | "ended"
  const [phase, setPhase] = useState<"prejoin" | "in-meeting" | "ended">("prejoin");
  const [joiningLoading, setJoiningLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Local media
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Camera facing (mobile)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Participants
  const [remoteParticipants, setRemoteParticipants] = useState<WebRTCParticipant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<WebRTCParticipant | null>(null);

  // Meeting state
  const [meetingInfo, setMeetingInfo] = useState<MeetingInfo | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);

  // UI panels
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Timer — starts when we enter the meeting, seeded from meeting's createdAt
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const callDuration = useCallTimer(timerStart);

  // Raise hand
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Socket
  const socketRef = useRef<Socket | null>(null);

  // WebRTC
  const { initiateCall, handleOffer, handleAnswer, handleIceCandidate, closePeer, closeAllPeers, replaceVideoTrack } =
    useWebRTC(socketRef.current, localStream, setRemoteParticipants);

  // Derived
  const isHost = localParticipant?.isHost ?? false;
  const isCoHost = localParticipant?.isCoHost ?? false;

  // ─── Acquire local media ──────────────────────────────────────────────────

  const acquireMedia = useCallback(
    async (opts: {
      audioEnabled: boolean;
      videoEnabled: boolean;
      audioDeviceId?: string;
      videoDeviceId?: string;
    }) => {
      const constraints: MediaStreamConstraints = {
        audio: opts.audioEnabled
          ? {
              deviceId: opts.audioDeviceId ? { ideal: opts.audioDeviceId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: opts.videoEnabled
          ? {
              deviceId: opts.videoDeviceId ? { ideal: opts.videoDeviceId } : undefined,
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        localStreamRef.current = stream;
        setIsMuted(!opts.audioEnabled);
        setIsCameraOff(!opts.videoEnabled);
        return stream;
      } catch (err: unknown) {
        const error = err as { name?: string };
        if (error.name === "NotAllowedError") {
          toast.error("Camera/microphone permission denied. Joining without media.");
        } else {
          toast.error("Could not access camera/microphone.");
        }
        return null;
      }
    },
    []
  );

  // ─── Join Meeting ─────────────────────────────────────────────────────────

  const joinMeeting = useCallback(
    async (opts: {
      audioEnabled: boolean;
      videoEnabled: boolean;
      audioDeviceId: string;
      videoDeviceId: string;
    }) => {
      if (!roomId || !user) return;
      setJoiningLoading(true);
      try {
        // Validate with backend
        await axiosInstance.post(`/meeting/${roomId}/join`, {
          userId: user._id,
          userName: user.name || user.email,
        });

        // Acquire media
        await acquireMedia(opts);

        // Connect socket
        const socket = getSocket();
        socketRef.current = socket;

        socket.emit("join-room", {
          roomId,
          userId: user._id,
          userName: user.name || user.email,
          userImage: user.image || "",
        });
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || "Failed to join meeting";
        setErrorMsg(msg);
        setJoiningLoading(false);
      }
    },
    [roomId, user, acquireMedia]
  );

  // ─── Socket event handlers ────────────────────────────────────────────────

  useEffect(() => {
    if (!socketRef.current || phase !== "prejoin") return;
    const socket = socketRef.current;

    const onRoomJoined = ({
      participants,
      meeting,
      you,
    }: {
      participants: WebRTCParticipant[];
      meeting: MeetingInfo;
      you: WebRTCParticipant;
    }) => {
      setLocalParticipant(you);
      setMeetingInfo(meeting);
      setIsLocked(meeting.isLocked);
      setChatEnabled(meeting.chatEnabled);
      setRemoteParticipants(participants);
      setTimerStart(new Date(meeting.createdAt).getTime());
      setPhase("in-meeting");
      setJoiningLoading(false);

      // Initiate WebRTC call to all existing participants
      participants.forEach((p) => {
        initiateCall(p.socketId);
      });
    };

    const onParticipantJoined = ({ participant }: { participant: WebRTCParticipant }) => {
      setRemoteParticipants((prev) => {
        if (prev.find((p) => p.socketId === participant.socketId)) return prev;
        return [...prev, participant];
      });
      // New participant — they will initiate offer to us
    };

    const onOffer = async ({
      from,
      offer,
    }: {
      from: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      await handleOffer(from, offer);
    };

    const onAnswer = async ({
      from,
      answer,
    }: {
      from: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      await handleAnswer(from, answer);
    };

    const onIceCandidate = async ({
      from,
      candidate,
    }: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      await handleIceCandidate(from, candidate);
    };

    const onParticipantLeft = ({ socketId }: { socketId: string }) => {
      closePeer(socketId);
      setRemoteParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
    };

    const onParticipantUpdated = ({
      socketId,
      updates,
    }: {
      socketId: string;
      updates: Partial<WebRTCParticipant>;
    }) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.socketId === socketId ? { ...p, ...updates } : p
        )
      );
      // Update local participant too if it's us
      setLocalParticipant((prev) =>
        prev && prev.socketId === socketId ? { ...prev, ...updates } : prev
      );
    };

    const onChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      if (!showChat) {
        setUnreadMessages((c) => c + 1);
      }
    };

    const onMeetingLocked = () => {
      setIsLocked(true);
      toast.info("Meeting has been locked by the host.");
    };

    const onMeetingUnlocked = () => {
      setIsLocked(false);
      toast.info("Meeting has been unlocked.");
    };

    const onMeetingEnded = ({ message }: { message: string }) => {
      toast.error(message);
      setPhase("ended");
      closeAllPeers();
    };

    const onForceMuted = () => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      setIsMuted(true);
      toast.info("You have been muted by the host.");
    };

    const onRemovedFromMeeting = ({ message }: { message: string }) => {
      toast.error(message);
      setPhase("ended");
      closeAllPeers();
    };

    const onChatPermissionChanged = ({ enabled }: { enabled: boolean }) => {
      setChatEnabled(enabled);
      toast.info(enabled ? "Chat has been enabled." : "Chat has been disabled by the host.");
    };

    const onError = ({ message }: { message: string }) => {
      setErrorMsg(message);
      setJoiningLoading(false);
    };

    const onScreenShareStarted = ({ socketId }: { socketId: string }) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.socketId === socketId ? { ...p, isScreenSharing: true } : p
        )
      );
    };

    const onScreenShareStopped = ({ socketId }: { socketId: string }) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.socketId === socketId ? { ...p, isScreenSharing: false } : p
        )
      );
    };

    socket.on("room-joined", onRoomJoined);
    socket.on("participant-joined", onParticipantJoined);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIceCandidate);
    socket.on("participant-left", onParticipantLeft);
    socket.on("participant-updated", onParticipantUpdated);
    socket.on("chat-message", onChatMessage);
    socket.on("meeting-locked", onMeetingLocked);
    socket.on("meeting-unlocked", onMeetingUnlocked);
    socket.on("meeting-ended", onMeetingEnded);
    socket.on("force-muted", onForceMuted);
    socket.on("removed-from-meeting", onRemovedFromMeeting);
    socket.on("chat-permission-changed", onChatPermissionChanged);
    socket.on("error", onError);
    socket.on("screen-share-started", onScreenShareStarted);
    socket.on("screen-share-stopped", onScreenShareStopped);

    return () => {
      socket.off("room-joined", onRoomJoined);
      socket.off("participant-joined", onParticipantJoined);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIceCandidate);
      socket.off("participant-left", onParticipantLeft);
      socket.off("participant-updated", onParticipantUpdated);
      socket.off("chat-message", onChatMessage);
      socket.off("meeting-locked", onMeetingLocked);
      socket.off("meeting-unlocked", onMeetingUnlocked);
      socket.off("meeting-ended", onMeetingEnded);
      socket.off("force-muted", onForceMuted);
      socket.off("removed-from-meeting", onRemovedFromMeeting);
      socket.off("chat-permission-changed", onChatPermissionChanged);
      socket.off("error", onError);
      socket.off("screen-share-started", onScreenShareStarted);
      socket.off("screen-share-stopped", onScreenShareStopped);
    };
  }, [
    socketRef.current,
    phase,
    showChat,
    initiateCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeer,
    closeAllPeers,
  ]);

  // ─── Controls ─────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const enabled = isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = enabled));
    setIsMuted(!enabled);
    socketRef.current?.emit("participant-updated", {
      roomId,
      updates: { isMuted: !enabled },
    });
  }, [isMuted, roomId]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const enabled = isCameraOff;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = enabled));
    setIsCameraOff(!enabled);
    socketRef.current?.emit("participant-updated", {
      roomId,
      updates: { isCameraOff: !enabled },
    });
  }, [isCameraOff, roomId]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) await replaceVideoTrack(cameraTrack);
      setIsScreenSharing(false);
      socketRef.current?.emit("screen-share-stopped", { roomId });
      socketRef.current?.emit("participant-updated", {
        roomId,
        updates: { isScreenSharing: false },
      });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceVideoTrack(screenTrack);

        // When user stops sharing via browser button
        screenTrack.addEventListener("ended", () => {
          screenStreamRef.current = null;
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack) replaceVideoTrack(cameraTrack);
          setIsScreenSharing(false);
          socketRef.current?.emit("screen-share-stopped", { roomId });
          socketRef.current?.emit("participant-updated", {
            roomId,
            updates: { isScreenSharing: false },
          });
        });

        setIsScreenSharing(true);
        socketRef.current?.emit("screen-share-started", { roomId });
        socketRef.current?.emit("participant-updated", {
          roomId,
          updates: { isScreenSharing: true },
        });
      } catch (err: unknown) {
        const error = err as { name?: string };
        if (error.name !== "AbortError" && error.name !== "NotAllowedError") {
          toast.error("Screen sharing failed.");
        } else {
          toast.info("Screen sharing cancelled.");
        }
      }
    }
  }, [isScreenSharing, roomId, replaceVideoTrack]);

  const toggleHand = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    socketRef.current?.emit(next ? "raise-hand" : "lower-hand", { roomId });
  }, [isHandRaised, roomId]);

  const toggleLock = useCallback(() => {
    socketRef.current?.emit(isLocked ? "meeting-unlocked" : "meeting-locked", { roomId });
  }, [isLocked, roomId]);

  const handleSendMessage = useCallback(
    (message: string) => {
      if (!user) return;
      socketRef.current?.emit("chat-message", {
        roomId,
        message,
        senderName: user.name || user.email,
        senderId: user._id,
      });
    },
    [roomId, user]
  );

  const handleMuteParticipant = useCallback(
    (targetSocketId: string) => {
      socketRef.current?.emit("mute-participant", {
        roomId,
        targetSocketId,
        requesterId: localParticipant?.userId,
      });
    },
    [roomId, localParticipant]
  );

  const handleRemoveParticipant = useCallback(
    (targetSocketId: string) => {
      socketRef.current?.emit("remove-participant", { roomId, targetSocketId });
    },
    [roomId]
  );

  const handlePromoteCoHost = useCallback(
    (targetSocketId: string) => {
      socketRef.current?.emit("assign-cohost", { roomId, targetSocketId });
    },
    [roomId]
  );

  const handleDemoteCoHost = useCallback(
    (targetSocketId: string) => {
      socketRef.current?.emit("remove-cohost", { roomId, targetSocketId });
    },
    [roomId]
  );

  const handleLeave = useCallback(() => {
    socketRef.current?.emit("leave-room", { roomId });
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    closeAllPeers();
    router.push("/meet/create");
  }, [roomId, closeAllPeers, router]);

  const handleEndMeeting = useCallback(() => {
    socketRef.current?.emit("end-meeting", { roomId });
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    closeAllPeers();
    setPhase("ended");
  }, [roomId, closeAllPeers]);

  // Camera flip (mobile)
  const handleFlipCamera = useCallback(async () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      await replaceVideoTrack(newVideoTrack);

      // Replace track in local stream
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack && localStreamRef.current) {
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
        localStreamRef.current.addTrack(newVideoTrack);
      }
      setFacingMode(nextFacing);
    } catch {
      toast.error("Could not switch camera.");
    }
  }, [facingMode, replaceVideoTrack]);

  // Clear unread badge when chat opens
  useEffect(() => {
    if (showChat) setUnreadMessages(0);
  }, [showChat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      closeAllPeers();
    };
  }, [closeAllPeers]);

  // ─── Render: Pre-join ────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center p-4">
        <div className="max-w-md w-full space-y-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <Video className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Sign in to Join Meeting</h2>
          <p className="text-gray-500 text-sm">
            You need to be signed in to join meeting room{" "}
            <code className="font-mono font-bold text-gray-800">{roomId}</code>.
          </p>
          <button
            onClick={handlegooglesignin}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center p-4">
        <div className="max-w-md space-y-4">
          <div className="text-5xl">🚫</div>
          <h2 className="text-xl font-semibold text-gray-900">{errorMsg}</h2>
          <button
            onClick={() => router.push("/meet/create")}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-xl transition-colors"
          >
            Back to Meet
          </button>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center p-4">
        <div className="max-w-md space-y-4">
          <div className="text-5xl">👋</div>
          <h2 className="text-2xl font-bold text-gray-900">You left the meeting</h2>
          <p className="text-gray-500">The meeting has ended.</p>
          <button
            onClick={() => router.push("/meet/create")}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-xl transition-colors"
          >
            Return to Meet
          </button>
        </div>
      </div>
    );
  }

  if (phase === "prejoin") {
    return (
      <>
        <Head>
          <title>Join Meeting – YourTube</title>
        </Head>
        <PreJoin
          roomId={roomId}
          userName={user.name || user.email || "Guest"}
          onJoin={joinMeeting}
          isLoading={joiningLoading}
        />
      </>
    );
  }

  // ─── Render: In-Meeting ──────────────────────────────────────────────────

  const allParticipants = localParticipant
    ? [
        {
          ...localParticipant,
          stream: localStream || undefined,
          isMuted,
          isCameraOff,
          isHandRaised,
          isScreenSharing,
        },
        ...remoteParticipants,
      ]
    : remoteParticipants;

  // Grid columns
  const count = allParticipants.length;
  const gridCols =
    count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : count <= 4 ? "grid-cols-2" : "grid-cols-3";

  const hasSidePanels = showParticipants || showChat;

  return (
    <>
      <Head>
        <title>Meeting: {roomId} – YourTube</title>
      </Head>

      <div className="fixed inset-0 bg-gray-950 flex flex-col z-50">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-1 rounded text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <span className="text-white font-semibold text-sm">YourTube Meet</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-gray-300 text-sm">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{callDuration}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <span className="hidden md:inline">Room:</span>
              <code className="text-gray-200 font-mono bg-gray-800 px-2 py-0.5 rounded border border-gray-700/60">
                {roomId}
              </code>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/meet/${roomId}`;
                  navigator.clipboard.writeText(url);
                  setCopiedLink(true);
                  toast.success("Meeting link copied to clipboard!");
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition-colors border border-gray-700"
                title="Copy Meeting Link"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            {isLocked && (
              <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-600/30">
                🔒 Locked
              </span>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Video grid */}
          <div className="flex-1 p-2 overflow-hidden flex flex-col">
            <div className={`flex-1 grid ${gridCols} gap-2 content-center`}>
              {allParticipants.map((p, i) => {
                const isLocal = localParticipant
                  ? p.socketId === localParticipant.socketId
                  : i === 0;
                return (
                  <ParticipantTile
                    key={p.socketId}
                    participant={p}
                    isLocal={isLocal}
                  />
                );
              })}
            </div>

            {/* Camera flip button (visible on touch devices) */}
            <div className="mt-1 flex justify-end">
              <button
                onClick={handleFlipCamera}
                className="p-2 rounded-full bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors md:hidden"
                title="Flip camera"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Side panels */}
          {hasSidePanels && (
            <div className="w-80 flex-shrink-0 border-l border-gray-800 bg-white flex flex-col overflow-hidden">
              {showParticipants && localParticipant && (
                <ParticipantsPanel
                  participants={remoteParticipants}
                  localParticipant={{
                    ...localParticipant,
                    isMuted,
                    isCameraOff,
                    isHandRaised,
                    isScreenSharing,
                  }}
                  isHost={isHost}
                  isCoHost={isCoHost}
                  onClose={() => setShowParticipants(false)}
                  onMuteParticipant={handleMuteParticipant}
                  onRemoveParticipant={handleRemoveParticipant}
                  onPromoteCoHost={handlePromoteCoHost}
                  onDemoteCoHost={handleDemoteCoHost}
                />
              )}
              {showChat && (
                <ChatPanel
                  messages={chatMessages}
                  currentUserId={user._id || ""}
                  currentUserName={user.name || user.email || ""}
                  chatEnabled={chatEnabled}
                  onSendMessage={handleSendMessage}
                  onClose={() => setShowChat(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="bg-gray-900/80 backdrop-blur px-4 py-3 flex items-center justify-center border-t border-gray-800">
          <MeetingControls
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
            isHandRaised={isHandRaised}
            isHost={isHost}
            isLocked={isLocked}
            showParticipants={showParticipants}
            showChat={showChat}
            unreadMessages={unreadMessages}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onToggleHand={toggleHand}
            onToggleParticipants={() => {
              setShowParticipants((v) => !v);
              if (showChat) setShowChat(false);
            }}
            onToggleChat={() => {
              setShowChat((v) => !v);
              if (showParticipants) setShowParticipants(false);
            }}
            onLeave={handleLeave}
            onEndMeeting={handleEndMeeting}
            onToggleLock={toggleLock}
          />
        </div>
      </div>
    </>
  );
}

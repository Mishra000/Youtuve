import { useRef, useCallback, useEffect } from "react";
import { Socket } from "socket.io-client";

export interface WebRTCParticipant {
  socketId: string;
  userId: string;
  userName: string;
  userImage?: string;
  isHost: boolean;
  isCoHost: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isHandRaised: boolean;
  isScreenSharing: boolean;
  joinedAt: number;
  stream?: MediaStream;
  connectionQuality?: "good" | "fair" | "poor" | "unknown";
}

type SetParticipants = React.Dispatch<React.SetStateAction<WebRTCParticipant[]>>;

const ICE_SERVERS = [
  { urls: process.env.NEXT_PUBLIC_STUN_SERVER_URL || "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  ...(process.env.NEXT_PUBLIC_TURN_SERVER_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_SERVER_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
        },
      ]
    : []),
];

export function useWebRTC(
  socket: Socket | null,
  localStream: MediaStream | null,
  setParticipants: SetParticipants
) {
  // Map: remoteSocketId -> RTCPeerConnection
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const qualityTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );

  // Keep localStreamRef in sync with the prop
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const createPeer = useCallback(
    (remoteSocketId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remoteSocketId);
      if (existing && existing.connectionState !== "closed") return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle incoming remote tracks
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setParticipants((prev) =>
          prev.map((p) =>
            p.socketId === remoteSocketId ? { ...p, stream: remoteStream } : p
          )
        );
      };

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", {
            to: remoteSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Connection quality monitoring
      const qualityTimer = setInterval(async () => {
        if (pc.connectionState === "connected") {
          try {
            const stats = await pc.getStats();
            let quality: "good" | "fair" | "poor" | "unknown" = "unknown";
            stats.forEach((report) => {
              if (report.type === "candidate-pair" && report.state === "succeeded") {
                const rtt = report.currentRoundTripTime;
                if (rtt !== undefined) {
                  if (rtt < 0.15) quality = "good";
                  else if (rtt < 0.4) quality = "fair";
                  else quality = "poor";
                }
              }
            });
            setParticipants((prev) =>
              prev.map((p) =>
                p.socketId === remoteSocketId
                  ? { ...p, connectionQuality: quality }
                  : p
              )
            );
          } catch {
            // stats unavailable — ignore
          }
        }
      }, 5000);
      qualityTimersRef.current.set(remoteSocketId, qualityTimer);

      peersRef.current.set(remoteSocketId, pc);
      return pc;
    },
    [socket, setParticipants]
  );

  const initiateCall = useCallback(
    async (remoteSocketId: string) => {
      if (!socket) return;
      const pc = createPeer(remoteSocketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { to: remoteSocketId, offer });
      } catch (err) {
        console.error("[WebRTC] Failed to create offer:", err);
      }
    },
    [socket, createPeer]
  );

  const handleOffer = useCallback(
    async (remoteSocketId: string, offer: RTCSessionDescriptionInit) => {
      if (!socket) return;
      const pc = createPeer(remoteSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: remoteSocketId, answer });
      } catch (err) {
        console.error("[WebRTC] Failed to handle offer:", err);
      }
    },
    [socket, createPeer]
  );

  const handleAnswer = useCallback(
    async (remoteSocketId: string, answer: RTCSessionDescriptionInit) => {
      const pc = peersRef.current.get(remoteSocketId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("[WebRTC] Failed to handle answer:", err);
      }
    },
    []
  );

  const handleIceCandidate = useCallback(
    async (remoteSocketId: string, candidate: RTCIceCandidateInit) => {
      const pc = peersRef.current.get(remoteSocketId);
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC] Failed to add ICE candidate:", err);
      }
    },
    []
  );

  const closePeer = useCallback((remoteSocketId: string) => {
    const pc = peersRef.current.get(remoteSocketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(remoteSocketId);
    }
    const timer = qualityTimersRef.current.get(remoteSocketId);
    if (timer) {
      clearInterval(timer);
      qualityTimersRef.current.delete(remoteSocketId);
    }
  }, []);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((_, id) => closePeer(id));
  }, [closePeer]);

  /**
   * Replace the video track in all peer connections (for screen share or camera switch)
   */
  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    const peers = Array.from(peersRef.current.values());
    await Promise.all(
      peers.map(async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          try {
            await sender.replaceTrack(newTrack);
          } catch (err) {
            console.error("[WebRTC] Failed to replace track:", err);
          }
        }
      })
    );
  }, []);

  /**
   * Replace the audio track in all peer connections (for device switch)
   */
  const replaceAudioTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    const peers = Array.from(peersRef.current.values());
    await Promise.all(
      peers.map(async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          try {
            await sender.replaceTrack(newTrack);
          } catch (err) {
            console.error("[WebRTC] Failed to replace audio track:", err);
          }
        }
      })
    );
  }, []);

  return {
    peersRef,
    createPeer,
    initiateCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeer,
    closeAllPeers,
    replaceVideoTrack,
    replaceAudioTrack,
  };
}

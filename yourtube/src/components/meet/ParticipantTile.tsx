import React, { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, Hand, Crown, Shield, Wifi } from "lucide-react";
import { WebRTCParticipant } from "@/lib/useWebRTC";
import { useSpeakingDetection } from "@/lib/useSpeakingDetection";

interface ParticipantTileProps {
  participant: WebRTCParticipant;
  isLocal?: boolean;
}

function QualityDot({ quality }: { quality?: string }) {
  if (!quality || quality === "unknown") return null;
  const color =
    quality === "good"
      ? "bg-green-500"
      : quality === "fair"
      ? "bg-yellow-500"
      : "bg-red-500";
  const label =
    quality === "good" ? "Good" : quality === "fair" ? "Fair" : "Poor";
  return (
    <div className="flex items-center gap-1" aria-label={`Connection: ${label}`}>
      <Wifi className="w-3 h-3 text-white/70" />
      <span className={`w-2 h-2 rounded-full ${color}`} />
    </div>
  );
}

export default function ParticipantTile({ participant, isLocal }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSpeaking = useSpeakingDetection(participant.stream || null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const showVideo = !participant.isCameraOff && !!participant.stream;

  return (
    <div
      className={`relative bg-gray-900 rounded-2xl overflow-hidden flex items-center justify-center aspect-video transition-all duration-200 ${
        isSpeaking && !participant.isMuted
          ? "ring-2 ring-green-400 ring-offset-1 ring-offset-gray-800"
          : "ring-1 ring-gray-700"
      }`}
    >
      {/* Video */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
          style={isLocal ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-white text-2xl font-bold">
            {participant.userName?.[0]?.toUpperCase() || "?"}
          </div>
          {participant.isCameraOff && (
            <VideoOff className="w-4 h-4 text-gray-400" />
          )}
        </div>
      )}

      {/* Screen share badge */}
      {participant.isScreenSharing && (
        <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
          Presenting
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-end justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {participant.isHost && (
            <span aria-label="Host">
              <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />
            </span>
          )}
          {participant.isCoHost && !participant.isHost && (
            <span aria-label="Co-host">
              <Shield className="w-3 h-3 text-blue-400 flex-shrink-0" />
            </span>
          )}
          <span className="text-white text-xs font-medium truncate">
            {participant.userName}
            {isLocal ? " (You)" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {participant.isHandRaised && (
            <span aria-label="Hand raised">
              <Hand className="w-3.5 h-3.5 text-yellow-400" />
            </span>
          )}
          <QualityDot quality={participant.connectionQuality} />
          {participant.isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Mic
              className={`w-3.5 h-3.5 ${
                isSpeaking ? "text-green-400" : "text-white/70"
              }`}
            />
          )}
          {participant.isCameraOff ? (
            <VideoOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Video className="w-3.5 h-3.5 text-white/70" />
          )}
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { X, Mic, MicOff, Video, VideoOff, Hand, Crown, Shield, UserX, Star } from "lucide-react";
import { WebRTCParticipant } from "@/lib/useWebRTC";

interface ParticipantsPanelProps {
  participants: WebRTCParticipant[];
  localParticipant: WebRTCParticipant;
  isHost: boolean;
  isCoHost: boolean;
  onClose: () => void;
  onMuteParticipant: (socketId: string) => void;
  onRemoveParticipant: (socketId: string) => void;
  onPromoteCoHost: (socketId: string) => void;
  onDemoteCoHost: (socketId: string) => void;
}

export default function ParticipantsPanel({
  participants,
  localParticipant,
  isHost,
  isCoHost,
  onClose,
  onMuteParticipant,
  onRemoveParticipant,
  onPromoteCoHost,
  onDemoteCoHost,
}: ParticipantsPanelProps) {
  const allParticipants = [localParticipant, ...participants];
  const canModerate = isHost || isCoHost;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-gray-900">
          Participants ({allParticipants.length})
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {allParticipants.map((p) => {
          const isLocal = p.socketId === localParticipant.socketId;
          return (
            <div
              key={p.socketId}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
                  {p.userName?.[0]?.toUpperCase() || "?"}
                </div>
                {p.isHandRaised && (
                  <span className="absolute -top-1 -right-1 text-xs">✋</span>
                )}
              </div>

              {/* Name & badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {p.isHost && (
                    <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                  )}
                  {p.isCoHost && !p.isHost && (
                    <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {p.userName}
                    {isLocal ? " (You)" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.isHost && (
                    <span className="text-xs text-yellow-600">Host</span>
                  )}
                  {p.isCoHost && !p.isHost && (
                    <span className="text-xs text-blue-600">Co-host</span>
                  )}
                  {p.isScreenSharing && (
                    <span className="text-xs text-blue-500">Presenting</span>
                  )}
                </div>
              </div>

              {/* Status icons */}
              <div className="flex items-center gap-2">
                {p.isMuted ? (
                  <MicOff className="w-4 h-4 text-red-500" />
                ) : (
                  <Mic className="w-4 h-4 text-gray-400" />
                )}
                {p.isCameraOff ? (
                  <VideoOff className="w-4 h-4 text-red-500" />
                ) : (
                  <Video className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {/* Host moderation actions */}
              {canModerate && !isLocal && (
                <div className="hidden group-hover:flex items-center gap-1">
                  {!p.isMuted && (
                    <button
                      onClick={() => onMuteParticipant(p.socketId)}
                      title="Mute"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isHost && (
                    <>
                      {p.isCoHost ? (
                        <button
                          onClick={() => onDemoteCoHost(p.socketId)}
                          title="Remove co-host"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onPromoteCoHost(p.socketId)}
                          title="Make co-host"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => onRemoveParticipant(p.socketId)}
                    title="Remove from meeting"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

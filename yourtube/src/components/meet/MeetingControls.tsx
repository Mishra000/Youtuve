import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Users,
  MessageSquare,
  Hand,
  PhoneOff,
  Lock,
  Unlock,
} from "lucide-react";

interface MeetingControlsProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isHost: boolean;
  isLocked: boolean;
  showParticipants: boolean;
  showChat: boolean;
  unreadMessages: number;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
  onEndMeeting: () => void;
  onToggleLock: () => void;
}

interface ControlButtonProps {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  badge?: number;
}

function ControlButton({
  onClick,
  active,
  danger,
  disabled,
  title,
  children,
  badge,
}: ControlButtonProps) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 disabled:opacity-40 ${
          danger
            ? "bg-red-600 hover:bg-red-700 text-white"
            : active
            ? "bg-gray-200 text-gray-900"
            : "bg-white/10 hover:bg-white/20 text-white"
        }`}
      >
        {children}
      </button>
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </div>
  );
}

export default function MeetingControls({
  isMuted,
  isCameraOff,
  isScreenSharing,
  isHandRaised,
  isHost,
  isLocked,
  showParticipants,
  showChat,
  unreadMessages,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleHand,
  onToggleParticipants,
  onToggleChat,
  onLeave,
  onEndMeeting,
  onToggleLock,
}: MeetingControlsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {/* Mic */}
      <ControlButton
        onClick={onToggleMic}
        active={isMuted}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <MicOff className="w-5 h-5 text-red-400" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
        <span className="text-xs hidden sm:block">{isMuted ? "Unmute" : "Mute"}</span>
      </ControlButton>

      {/* Camera */}
      <ControlButton
        onClick={onToggleCamera}
        active={isCameraOff}
        title={isCameraOff ? "Start camera" : "Stop camera"}
      >
        {isCameraOff ? (
          <VideoOff className="w-5 h-5 text-red-400" />
        ) : (
          <Video className="w-5 h-5" />
        )}
        <span className="text-xs hidden sm:block">{isCameraOff ? "Start" : "Stop"}</span>
      </ControlButton>

      {/* Screen share */}
      <ControlButton
        onClick={onToggleScreenShare}
        active={isScreenSharing}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
      >
        {isScreenSharing ? (
          <MonitorOff className="w-5 h-5 text-blue-400" />
        ) : (
          <Monitor className="w-5 h-5" />
        )}
        <span className="text-xs hidden sm:block">
          {isScreenSharing ? "Stop" : "Share"}
        </span>
      </ControlButton>

      {/* Raise hand */}
      <ControlButton
        onClick={onToggleHand}
        active={isHandRaised}
        title={isHandRaised ? "Lower hand" : "Raise hand"}
      >
        <Hand
          className={`w-5 h-5 ${isHandRaised ? "text-yellow-400" : ""}`}
        />
        <span className="text-xs hidden sm:block">
          {isHandRaised ? "Lower" : "Raise"}
        </span>
      </ControlButton>

      {/* Participants */}
      <ControlButton
        onClick={onToggleParticipants}
        active={showParticipants}
        title="Participants"
      >
        <Users className="w-5 h-5" />
        <span className="text-xs hidden sm:block">People</span>
      </ControlButton>

      {/* Chat */}
      <ControlButton
        onClick={onToggleChat}
        active={showChat}
        title="Chat"
        badge={unreadMessages}
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-xs hidden sm:block">Chat</span>
      </ControlButton>

      {/* Host: Lock/Unlock */}
      {isHost && (
        <ControlButton
          onClick={onToggleLock}
          title={isLocked ? "Unlock meeting" : "Lock meeting"}
        >
          {isLocked ? (
            <Lock className="w-5 h-5 text-yellow-400" />
          ) : (
            <Unlock className="w-5 h-5" />
          )}
          <span className="text-xs hidden sm:block">
            {isLocked ? "Unlock" : "Lock"}
          </span>
        </ControlButton>
      )}

      {/* Divider */}
      <div className="w-px h-10 bg-white/20 mx-1 hidden sm:block" />

      {/* Leave */}
      <ControlButton onClick={onLeave} danger title="Leave meeting">
        <PhoneOff className="w-5 h-5" />
        <span className="text-xs hidden sm:block">Leave</span>
      </ControlButton>

      {/* Host: End meeting */}
      {isHost && (
        <ControlButton onClick={onEndMeeting} danger title="End meeting for all">
          <PhoneOff className="w-5 h-5" />
          <span className="text-xs hidden sm:block">End</span>
        </ControlButton>
      )}
    </div>
  );
}

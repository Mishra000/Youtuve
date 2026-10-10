import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Settings,
} from "lucide-react";

interface Device {
  deviceId: string;
  label: string;
}

interface PreJoinProps {
  roomId?: string;
  userName: string;
  onJoin: (opts: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioDeviceId: string;
    videoDeviceId: string;
  }) => void;
  isLoading?: boolean;
}

export default function PreJoin({ roomId, userName, onJoin, isLoading }: PreJoinProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState<Device[]>([]);
  const [videoDevices, setVideoDevices] = useState<Device[]>([]);
  const [selectedAudio, setSelectedAudio] = useState("");
  const [selectedVideo, setSelectedVideo] = useState("");
  const [permError, setPermError] = useState("");
  const [showDevices, setShowDevices] = useState(false);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const init = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        currentStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(
          devices
            .filter((d) => d.kind === "audioinput")
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
            }))
        );
        setVideoDevices(
          devices
            .filter((d) => d.kind === "videoinput")
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Camera ${d.deviceId.slice(0, 4)}`,
            }))
        );

        const audioTrack = s.getAudioTracks()[0];
        const videoTrack = s.getVideoTracks()[0];
        if (audioTrack) setSelectedAudio(audioTrack.getSettings().deviceId || "");
        if (videoTrack) setSelectedVideo(videoTrack.getSettings().deviceId || "");
      } catch (err: unknown) {
        const error = err as { name?: string };
        if (error.name === "NotAllowedError") {
          setPermError(
            "Camera/microphone permission denied. You can still join without video."
          );
        } else if (error.name === "NotFoundError") {
          setPermError(
            "No camera or microphone found. Check your device connections."
          );
        } else {
          setPermError(`Could not access camera/microphone: ${error.name}`);
        }
      }
    };

    init();

    return () => {
      currentStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach((t) => (t.enabled = !audioEnabled));
    }
    setAudioEnabled((prev) => !prev);
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = !videoEnabled));
    }
    setVideoEnabled((prev) => !prev);
  };

  const handleJoin = () => {
    // Stop preview stream — the meeting page will re-acquire with proper constraints
    stream?.getTracks().forEach((t) => t.stop());
    onJoin({
      audioEnabled,
      videoEnabled,
      audioDeviceId: selectedAudio,
      videoDeviceId: selectedVideo,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ready to join?</h1>
      {roomId && (
        <div className="text-xs text-gray-600 font-mono bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
          Room ID: <span className="font-bold text-gray-900">{roomId}</span>
        </div>
      )}
      <p className="text-gray-500 text-sm">
        Joining as <span className="font-semibold text-gray-800">{userName}</span>
      </p>

      {/* Preview */}
      <div className="relative w-full max-w-md aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-lg">
        {videoEnabled && stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover mirror"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center text-white text-3xl font-bold">
              {userName?.[0]?.toUpperCase() || "?"}
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition-colors ${
              audioEnabled
                ? "bg-white/20 hover:bg-white/30 text-white"
                : "bg-red-600 text-white"
            }`}
            title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition-colors ${
              videoEnabled
                ? "bg-white/20 hover:bg-white/30 text-white"
                : "bg-red-600 text-white"
            }`}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            {videoEnabled ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => setShowDevices((v) => !v)}
            className="p-3 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
            title="Device settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Permission error */}
      {permError && (
        <div className="w-full max-w-md bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          ⚠️ {permError}
        </div>
      )}

      {/* Device selectors */}
      {showDevices && (
        <div className="w-full max-w-md space-y-3 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-sm text-gray-700">Device Settings</h3>
          {audioDevices.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Microphone</label>
              <select
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {videoDevices.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Camera</label>
              <select
                value={selectedVideo}
                onChange={(e) => setSelectedVideo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleJoin}
        disabled={isLoading}
        className="w-full max-w-md bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
        ) : null}
        {isLoading ? "Joining…" : "Join Meeting"}
      </button>
    </div>
  );
}

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/router";
import { getVideoUrl } from "@/lib/axiosinstance";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const WATCH_COMPLETION_PERCENTAGE = 90;
const PROGRESS_SAVE_INTERVAL_MS = 8000;
const CONTROLS_HIDE_DELAY_MS = 3000;
const AUTOPLAY_COUNTDOWN_SEC = 5;
const SEEK_SMALL = 10;
const SEEK_LARGE = 30;
const VOLUME_STEP = 0.05;
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
// SVG ICONS
// ─────────────────────────────────────────────
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);
const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </svg>
);
const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);
const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
  </svg>
);
const MuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);
const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);
const ExitFullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
  </svg>
);
const TheaterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z" />
  </svg>
);
const PipIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h8v5h-8z" />
  </svg>
);
const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
  </svg>
);
const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
  </svg>
);
const CaptionsIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" fill={active ? "#ef4444" : "currentColor"} className="w-5 h-5">
    <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z" />
  </svg>
);

// ─────────────────────────────────────────────
// SINGLE-VIDEO MANAGER (prevent multiple playing)
// ─────────────────────────────────────────────
const globalActiveVideo: { el: HTMLVideoElement | null } = { el: null };

// ─────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────
function Tooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <div className="bg-black/90 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg flex flex-col items-center gap-0.5">
        <span>{label}</span>
        {shortcut && <span className="text-gray-400 text-[10px]">{shortcut}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONTROL BUTTON
// ─────────────────────────────────────────────
function CtrlBtn({
  onClick,
  label,
  shortcut,
  children,
  disabled,
  className = "",
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="relative group">
      <button
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        disabled={disabled}
        aria-label={`${label}${shortcut ? ` (${shortcut})` : ""}`}
        className={`flex items-center justify-center text-white hover:text-gray-300 transition-colors p-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${className}`}
      >
        {children}
      </button>
      <Tooltip label={label} shortcut={shortcut} />
    </div>
  );
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface VideoData {
  _id: string;
  videotitle?: string;
  filepath?: string;
  filetype?: string;
  videochanel?: string;
}

interface Props {
  video: VideoData;
  relatedVideos?: VideoData[];
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function VideoPlayer({ video, relatedVideos = [] }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const completionSentRef = useRef(false);
  const lastSavedPositionRef = useRef(0);

  // ── State ──────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFlash, setSeekFlash] = useState<{ show: boolean; value: number }>({ show: false, value: 0 });
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  const [resumeData, setResumeData] = useState<{ position: number } | null>(null);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const nextVideo = relatedVideos.length > 0 ? relatedVideos[0] : null;
  const videoSrc = getVideoUrl(video?.filepath);

  // ── Restore theater from localStorage ─────
  useEffect(() => {
    const saved = localStorage.getItem("yt_theater");
    if (saved === "1") setIsTheater(true);
  }, []);

  // ── PiP support check ─────────────────────
  useEffect(() => {
    setPipSupported(typeof document !== "undefined" && "pictureInPictureEnabled" in document);
  }, []);

  // ── Load watch progress on mount ──────────
  useEffect(() => {
    if (!user?._id || !video?._id) return;
    axiosInstance
      .get(`/history/progress/${video._id}?userId=${user._id}`)
      .then((res) => {
        if (res.data?.found && (res.data.currentPosition || 0) > 5) {
          setResumeData({ position: res.data.currentPosition });
          setResumePrompt(true);
        }
      })
      .catch(() => {});
  }, [user?._id, video?._id]);

  // ── Register as active video (multi-video prevention) ──
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onPlay = () => {
      if (globalActiveVideo.el && globalActiveVideo.el !== vid) {
        globalActiveVideo.el.pause();
      }
      globalActiveVideo.el = vid;
    };
    vid.addEventListener("play", onPlay);
    return () => vid.removeEventListener("play", onPlay);
  }, []);

  // ── Detect text tracks ─────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const checkTracks = () => setHasCaptions(vid.textTracks.length > 0);
    checkTracks();
    vid.addEventListener("loadedmetadata", checkTracks);
    return () => vid.removeEventListener("loadedmetadata", checkTracks);
  }, []);

  // ── Video events ───────────────────────────
  const updateBuffered = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !vid.buffered.length) return;
    try {
      setBuffered(vid.buffered.end(vid.buffered.length - 1));
    } catch {}
  }, []);

  const saveProgress = useCallback(
    (forceComplete = false) => {
      const vid = videoRef.current;
      if (!user?._id || !video?._id || !vid) return;
      const pos = vid.currentTime;
      const dur = vid.duration || 0;
      if (!dur || Math.abs(pos - lastSavedPositionRef.current) < 1) return;
      lastSavedPositionRef.current = pos;
      const pct = Math.min(100, (pos / dur) * 100);
      axiosInstance
        .post(`/history/progress/${video._id}`, {
          userId: user._id,
          currentPosition: pos,
          duration: dur,
          percentage: forceComplete ? WATCH_COMPLETION_PERCENTAGE : pct,
        })
        .catch(() => {});
    },
    [user, video]
  );

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onLoadedMetadata = () => {
      setDuration(vid.duration || 0);
      setIsLoading(false);
    };
    const onTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      updateBuffered();
    };
    const onProgress = () => updateBuffered();
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => { setIsBuffering(false); setIsLoading(false); };
    const onPlaying = () => { setIsBuffering(false); setIsPlaying(true); };
    const onPause = () => { setIsPlaying(false); saveProgress(); };
    const onEnded = () => {
      setIsPlaying(false);
      setEnded(true);
      saveProgress(true);
    };
    const onError = () => {
      setHasError(true);
      setIsLoading(false);
      setErrorMsg("Unable to load this video. It may be unavailable or unsupported.");
    };
    const onVolumeChange = () => {
      setVolume(vid.volume);
      setIsMuted(vid.muted);
    };
    const onFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement));
    };

    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("progress", onProgress);
    vid.addEventListener("waiting", onWaiting);
    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("canplaythrough", onCanPlay);
    vid.addEventListener("playing", onPlaying);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("ended", onEnded);
    vid.addEventListener("error", onError);
    vid.addEventListener("volumechange", onVolumeChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("progress", onProgress);
      vid.removeEventListener("waiting", onWaiting);
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("canplaythrough", onCanPlay);
      vid.removeEventListener("playing", onPlaying);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("ended", onEnded);
      vid.removeEventListener("error", onError);
      vid.removeEventListener("volumechange", onVolumeChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [updateBuffered, saveProgress]);

  // ── Autoplay on ended ──────────────────────
  useEffect(() => {
    if (!ended || autoplayCancelled || !nextVideo) return;
    let count = AUTOPLAY_COUNTDOWN_SEC;
    setAutoplayCountdown(count);
    autoplayTimerRef.current = setInterval(() => {
      count -= 1;
      setAutoplayCountdown(count);
      if (count <= 0) {
        clearInterval(autoplayTimerRef.current!);
        setAutoplayCountdown(null);
        router.push(`/watch/${nextVideo._id}`);
      }
    }, 1000);
    return () => { if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  // ── Completion tracking ────────────────────
  useEffect(() => {
    if (!duration || completionSentRef.current) return;
    const pct = (currentTime / duration) * 100;
    if (pct >= WATCH_COMPLETION_PERCENTAGE) {
      completionSentRef.current = true;
      saveProgress(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, duration]);

  // ── Periodic save ──────────────────────────
  useEffect(() => {
    progressSaveTimerRef.current = setInterval(() => {
      const vid = videoRef.current;
      if (vid && !vid.paused && !vid.ended) saveProgress();
    }, PROGRESS_SAVE_INTERVAL_MS);
    return () => { if (progressSaveTimerRef.current) clearInterval(progressSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveProgress]);

  // ── Visibility / unload save ───────────────
  useEffect(() => {
    const onHide = () => saveProgress();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
      saveProgress();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveProgress]);

  // ── Keyboard shortcuts ─────────────────────
  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (ended) { vid.currentTime = 0; setEnded(false); completionSentRef.current = false; }
    vid.paused ? vid.play().catch(() => {}) : vid.pause();
  }, [ended]);

  const seek = useCallback((delta: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + delta));
    setSeekFlash({ show: true, value: delta });
    setTimeout(() => setSeekFlash({ show: false, value: 0 }), 800);
  }, []);

  const seekTo = useCallback((pct: number) => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration, pct * vid.duration));
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const v = Math.max(0, Math.min(1, vid.volume + delta));
    vid.volume = v;
    vid.muted = v === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {}
  }, []);

  const toggleTheater = useCallback(() => {
    setIsTheater((v) => {
      const next = !v;
      localStorage.setItem("yt_theater", next ? "1" : "0");
      return next;
    });
  }, []);

  const togglePip = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || !pipSupported) return;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await (vid as any).requestPictureInPicture();
    } catch {}
  }, [pipSupported]);

  const toggleCaptions = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const tracks = vid.textTracks;
    if (!tracks.length) return;
    const next = !captionsEnabled;
    setCaptionsEnabled(next);
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = next ? "showing" : "hidden";
  }, [captionsEnabled]);

  const cycleSpeed = useCallback((dir: number) => {
    setSpeed((cur) => {
      const idx = SPEEDS.indexOf(cur);
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, idx + dir))];
      if (videoRef.current) videoRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const setSpeedTo = useCallback((s: number) => {
    setSpeed(s);
    setShowSpeedMenu(false);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }, []);

  const goNext = useCallback(() => {
    if (!nextVideo) return;
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    setAutoplayCountdown(null);
    router.push(`/watch/${nextVideo._id}`);
  }, [nextVideo, router]);

  const cancelAutoplay = useCallback(() => {
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    setAutoplayCountdown(null);
    setAutoplayCancelled(true);
  }, []);

  // ── Controls visibility ────────────────────
  const showControlsBriefly = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); seek(e.shiftKey ? -SEEK_LARGE : -SEEK_SMALL); break;
        case "ArrowRight": e.preventDefault(); seek(e.shiftKey ? SEEK_LARGE : SEEK_SMALL); break;
        case "ArrowUp": e.preventDefault(); changeVolume(VOLUME_STEP); break;
        case "ArrowDown": e.preventDefault(); changeVolume(-VOLUME_STEP); break;
        case "m": case "M": e.preventDefault(); toggleMute(); break;
        case "f": case "F": e.preventDefault(); toggleFullscreen(); break;
        case "t": case "T": e.preventDefault(); toggleTheater(); break;
        case "p": case "P": e.preventDefault(); togglePip(); break;
        case "c": case "C": e.preventDefault(); toggleCaptions(); break;
        case ">": e.preventDefault(); cycleSpeed(1); break;
        case "<": e.preventDefault(); cycleSpeed(-1); break;
        case "n": case "N": e.preventDefault(); goNext(); break;
        default: return;
      }
      showControlsBriefly();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, changeVolume, toggleMute, toggleFullscreen, toggleTheater, togglePip, toggleCaptions, cycleSpeed, goNext, showControlsBriefly]);

  // ── Timeline interactions ──────────────────
  const getProgressPct = (e: React.MouseEvent<HTMLDivElement>): number => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };
  const onProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    seekTo(getProgressPct(e));
  };
  const onProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * (videoRef.current?.duration || 0));
    setHoverX(e.clientX - rect.left);
    if (isDraggingRef.current) seekTo(pct);
    capturePreview(pct);
  };
  const onProgressMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isDraggingRef.current) { isDraggingRef.current = false; seekTo(getProgressPct(e)); }
    setHoverTime(null);
    setPreviewDataUrl(null);
  };
  const onProgressMouseLeave = () => {
    setHoverTime(null);
    setPreviewDataUrl(null);
    isDraggingRef.current = false;
  };

  // ── Preview frame capture ──────────────────
  const capturePreview = useCallback((pct: number) => {
    const vid = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!vid || !canvas || !vid.duration) return;
    const tmp = document.createElement("video");
    tmp.src = vid.currentSrc || (vid.querySelector("source") as HTMLSourceElement)?.src || "";
    tmp.crossOrigin = "anonymous";
    tmp.muted = true;
    tmp.currentTime = pct * vid.duration;
    tmp.addEventListener("seeked", () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 160;
      canvas.height = 90;
      ctx.drawImage(tmp, 0, 0, 160, 90);
      setPreviewDataUrl(canvas.toDataURL("image/jpeg", 0.5));
      tmp.src = "";
    }, { once: true });
  }, []);

  // ── Computed ──────────────────────────────
  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const remaining = Math.max(0, duration - currentTime);

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-xl overflow-hidden select-none ${
        isTheater && !isFullscreen ? "w-full" : "aspect-video"
      }`}
      style={{ cursor: controlsVisible ? "default" : "none" }}
      onMouseMove={showControlsBriefly}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
      }}
    >
      {/* Hidden canvas for preview frames */}
      <canvas ref={previewCanvasRef} className="hidden" />

      {/* ── Video element ─────────────────────── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        preload="metadata"
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
        onDoubleClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
      >
        {videoSrc && <source src={videoSrc} type={video?.filetype || "video/mp4"} />}
        Your browser does not support the video tag.
      </video>

      {/* ── Loading spinner ───────────────────── */}
      {(isLoading || isBuffering) && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error ────────────────────────────── */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white gap-3 p-6">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-red-400">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <p className="text-center">{errorMsg}</p>
          <button
            onClick={() => { setHasError(false); setIsLoading(true); videoRef.current?.load(); }}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Seek flash ───────────────────────── */}
      {seekFlash.show && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 text-white text-xl font-bold px-5 py-2 rounded-xl">
            {seekFlash.value > 0 ? `+${seekFlash.value}s` : `${seekFlash.value}s`}
          </div>
        </div>
      )}

      {/* ── Resume prompt ─────────────────────── */}
      {resumePrompt && resumeData && !isLoading && (
        <div className="absolute bottom-20 left-4 right-4 sm:right-auto bg-black/90 text-white rounded-xl p-3 flex flex-wrap items-center gap-2 shadow-lg z-30">
          <span className="text-sm">Resume from {fmtTime(resumeData.position)}</span>
          <button
            onClick={() => { setResumePrompt(false); if (videoRef.current && resumeData) { videoRef.current.currentTime = resumeData.position; videoRef.current.play().catch(() => {}); } }}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-medium transition-colors"
          >
            Resume
          </button>
          <button
            onClick={() => { setResumePrompt(false); videoRef.current?.play().catch(() => {}); }}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs transition-colors"
          >
            Start over
          </button>
        </div>
      )}

      {/* ── Autoplay next countdown ────────────── */}
      {autoplayCountdown !== null && nextVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-30">
          <div className="bg-gray-900 rounded-2xl p-6 text-white text-center shadow-2xl max-w-xs w-full mx-4">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Up next</p>
            <p className="font-semibold text-sm mb-4 line-clamp-2">{nextVideo.videotitle}</p>
            <div className="text-6xl font-bold mb-3 text-red-400">{autoplayCountdown}</div>
            <p className="text-xs text-gray-400 mb-5">Starting automatically...</p>
            <div className="flex gap-3 justify-center">
              <button onClick={goNext} className="px-5 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors">
                Play Now
              </button>
              <button onClick={cancelAutoplay} className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Replay overlay ─────────────────────── */}
      {ended && autoplayCountdown === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
          <button
            onClick={() => {
              if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}); }
              setEnded(false);
              completionSentRef.current = false;
              setAutoplayCancelled(false);
            }}
            aria-label="Replay video"
            className="flex flex-col items-center gap-2 text-white hover:text-gray-300 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
              <ReplayIcon />
            </div>
            <span className="text-sm">Replay</span>
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CONTROLS BAR
          ══════════════════════════════════════════ */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${
          controlsVisible || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Gradient backdrop */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none rounded-b-xl" />

        <div className="relative px-3 pb-2 pt-2 space-y-1.5">
          {/* ── Timeline ─────────────────────── */}
          <div
            ref={progressRef}
            role="slider"
            aria-label="Video timeline"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(playedPct)}
            className="relative h-1.5 group/bar rounded-full bg-white/25 cursor-pointer"
            style={{ touchAction: "none" }}
            onMouseDown={onProgressMouseDown}
            onMouseMove={onProgressMouseMove}
            onMouseUp={onProgressMouseUp}
            onMouseLeave={onProgressMouseLeave}
          >
            {/* Buffered */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-white/30 pointer-events-none transition-[width]"
              style={{ width: `${bufferedPct}%` }}
            />
            {/* Played */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-red-500 pointer-events-none"
              style={{ width: `${playedPct}%` }}
            />
            {/* Thumb dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-red-500 shadow opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${playedPct}% - 7px)` }}
            />

            {/* Hover preview bubble */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-6 flex flex-col items-center gap-1 pointer-events-none z-50"
                style={{ left: hoverX, transform: "translateX(-50%)" }}
              >
                {previewDataUrl && (
                  <img
                    src={previewDataUrl}
                    alt="preview"
                    className="w-36 h-20 rounded object-cover border border-white/20 shadow-2xl"
                  />
                )}
                <div className="bg-black/80 text-white text-xs px-2 py-0.5 rounded shadow">
                  {fmtTime(hoverTime)}
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom control row ─────────────── */}
          <div className="flex items-center justify-between gap-1">
            {/* LEFT */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <CtrlBtn onClick={() => togglePlay()} label={ended ? "Replay" : isPlaying ? "Pause" : "Play"} shortcut="Space / K">
                {ended ? <ReplayIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
              </CtrlBtn>

              <CtrlBtn onClick={() => seek(-SEEK_SMALL)} label={`-${SEEK_SMALL}s`} shortcut="←">
                <SkipBackIcon />
              </CtrlBtn>

              <CtrlBtn onClick={() => seek(SEEK_SMALL)} label={`+${SEEK_SMALL}s`} shortcut="→">
                <SkipForwardIcon />
              </CtrlBtn>

              {/* Volume */}
              <div className="flex items-center gap-1">
                <CtrlBtn onClick={() => toggleMute()} label={isMuted || volume === 0 ? "Unmute" : "Mute"} shortcut="M">
                  {isMuted || volume === 0 ? <MuteIcon /> : volume < 0.5 ? <VolumeLowIcon /> : <VolumeHighIcon />}
                </CtrlBtn>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
                  }}
                  aria-label="Volume"
                  className="hidden sm:block w-16 lg:w-20 h-1 accent-red-500 cursor-pointer rounded-full"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Time */}
              <div className="text-white text-xs ml-1 whitespace-nowrap hidden sm:flex items-center gap-1">
                <span className="font-medium tabular-nums">{fmtTime(currentTime)}</span>
                <span className="text-white/50">/</span>
                <span className="text-white/70 tabular-nums">{fmtTime(duration)}</span>
              </div>
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Remaining time (small screens) */}
              <span className="text-white/60 text-xs tabular-nums hidden xs:block sm:hidden">
                -{fmtTime(remaining)}
              </span>

              {/* Playback speed */}
              <div className="relative">
                <CtrlBtn
                  onClick={(e) => { e.stopPropagation(); setShowSpeedMenu((v) => !v); }}
                  label={`Speed ${speed}×`}
                  shortcut="< >"
                >
                  <span className="text-white text-xs font-bold w-8 text-center leading-none">{speed}×</span>
                </CtrlBtn>
                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-sm rounded-xl shadow-2xl py-1.5 z-50 min-w-[100px] border border-white/10">
                    <div className="px-3 py-1 text-xs text-gray-400 font-medium border-b border-white/10 mb-1">Speed</div>
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={(e) => { e.stopPropagation(); setSpeedTo(s); }}
                        className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors ${
                          s === speed ? "text-red-400 font-semibold" : "text-white"
                        }`}
                      >
                        {s === 1 ? "Normal (1×)" : `${s}×`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Captions */}
              {hasCaptions && (
                <CtrlBtn onClick={() => toggleCaptions()} label="Captions" shortcut="C">
                  <CaptionsIcon active={captionsEnabled} />
                </CtrlBtn>
              )}

              {/* PiP */}
              {pipSupported && (
                <CtrlBtn onClick={() => togglePip()} label="Picture-in-Picture" shortcut="P">
                  <PipIcon />
                </CtrlBtn>
              )}

              {/* Theater */}
              <CtrlBtn onClick={() => toggleTheater()} label={isTheater ? "Default view" : "Theater mode"} shortcut="T">
                <TheaterIcon />
              </CtrlBtn>

              {/* Fullscreen */}
              <CtrlBtn onClick={() => toggleFullscreen()} label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} shortcut="F">
                {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </CtrlBtn>
            </div>
          </div>
        </div>
      </div>

      {/* Time overlay when controls hidden */}
      {!controlsVisible && isPlaying && (
        <div className="absolute bottom-2 right-2 text-white/40 text-xs tabular-nums pointer-events-none">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </div>
      )}
    </div>
  );
}

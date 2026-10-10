import React, { useState } from "react";
import { Button } from "./ui/button";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import {
  executeVideoDownload,
  authorizeVideoDownload,
} from "@/lib/downloadService";
import { toast } from "sonner";
import SubscriptionPlanModal from "./SubscriptionPlanModal";

interface DownloadButtonProps {
  videoId: string;
  videoTitle?: string;
  className?: string;
  variant?: "ghost" | "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  onDownloadComplete?: (remainingDownloads: number) => void;
}

export default function DownloadButton({
  videoId,
  videoTitle = "video",
  className = "",
  variant = "ghost",
  size = "sm",
  showLabel = true,
  onDownloadComplete,
}: DownloadButtonProps) {
  const { user, handlegooglesignin } = useUser();
  const [downloadState, setDownloadState] = useState<
    "idle" | "authorizing" | "downloading" | "success" | "denied"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const handleDownload = async () => {
    // 1. Auth check
    if (!user?._id) {
      toast.error("Please log in to download videos", {
        action: {
          label: "Sign in",
          onClick: () => handlegooglesignin(),
        },
      });
      return;
    }

    if (downloadState === "authorizing" || downloadState === "downloading") {
      return;
    }

    setDownloadState("authorizing");
    setProgress(0);

    try {
      // 2. Pre-authorization check against backend
      const authResult = await authorizeVideoDownload(videoId, user._id);

      if (!authResult.success) {
        setDownloadState("denied");
        toast.error(authResult.message || "Download not authorized");
        return;
      }

      if (authResult.isDuplicate) {
        toast.info("Duplicate download window active — no quota deducted!");
      }

      // 3. Initiate authorized file stream
      setDownloadState("downloading");
      toast.info("Download started...", { duration: 3000 });

      const downloadResult = await executeVideoDownload(
        videoId,
        user._id,
        videoTitle,
        (percent) => {
          setProgress(percent);
        }
      );

      setDownloadState("success");
      toast.success(
        `Downloaded: ${downloadResult.filename} (${downloadResult.remainingDownloads} downloads left today)`
      );

      if (onDownloadComplete) {
        onDownloadComplete(downloadResult.remainingDownloads);
      }

      setTimeout(() => {
        setDownloadState("idle");
      }, 4000);
    } catch (err: unknown) {
      setDownloadState("denied");
      const res = (
        err as {
          response?: {
            status?: number;
            data?: { message?: string; code?: string; isExpired?: boolean };
          };
        }
      )?.response;

      const code = res?.data?.code;
      const msg = res?.data?.message || "Failed to download video";

      if (code === "LIMIT_REACHED") {
        toast.error("Daily download limit reached", {
          action: {
            label: "Upgrade Plan",
            onClick: () => setIsPlanModalOpen(true),
          },
          duration: 6000,
        });
      } else if (res?.data?.isExpired) {
        toast.error("Your subscription has expired (Reverted to Free limits)", {
          action: {
            label: "Renew Plan",
            onClick: () => setIsPlanModalOpen(true),
          },
        });
      } else if (code === "FILE_UNAVAILABLE" || code === "VIDEO_NOT_FOUND") {
        toast.error("Video is not available for download");
      } else if (code === "AUTH_REQUIRED") {
        toast.error("Please log in to download videos");
      } else {
        toast.error(msg);
      }

      setTimeout(() => {
        setDownloadState("idle");
      }, 3000);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleDownload}
        disabled={
          downloadState === "authorizing" || downloadState === "downloading"
        }
        title="Download video"
        id={`download-btn-${videoId}`}
      >
        {downloadState === "authorizing" && (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-gray-500" />
            {showLabel && <span>Checking quota...</span>}
          </>
        )}

        {downloadState === "downloading" && (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-600" />
            {showLabel && (
              <span>
                {progress > 0 ? `Downloading ${progress}%` : "Downloading..."}
              </span>
            )}
          </>
        )}

        {downloadState === "success" && (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
            {showLabel && <span className="text-green-700">Downloaded</span>}
          </>
        )}

        {downloadState === "denied" && (
          <>
            <AlertCircle className="w-4 h-4 mr-2 text-red-600" />
            {showLabel && <span className="text-red-600">Denied</span>}
          </>
        )}

        {downloadState === "idle" && (
          <>
            <Download className="w-4 h-4 mr-2" />
            {showLabel && <span>Download</span>}
          </>
        )}
      </Button>

      {/* Subscription upgrade modal triggered if user hits limit */}
      {user?._id && (
        <SubscriptionPlanModal
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
          userId={user._id}
          onPlanUpdated={() => {
            setDownloadState("idle");
          }}
        />
      )}
    </>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { format } from "date-fns";
import {
  Download,
  Crown,
  Play,
  Clock,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
  fetchDownloadHistory,
  fetchUserQuota,
  DownloadRecord,
  UserQuota,
  formatBytes,
} from "@/lib/downloadService";
import { getVideoUrl } from "@/lib/axiosinstance";
import SubscriptionPlanModal from "@/components/SubscriptionPlanModal";
import DownloadButton from "@/components/DownloadButton";
import { toast } from "sonner";

export default function DownloadsPage() {
  const { user, handlegooglesignin } = useUser();
  const [history, setHistory] = useState<DownloadRecord[]>([]);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?._id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [historyData, quotaData] = await Promise.all([
        fetchDownloadHistory(user._id),
        fetchUserQuota(user._id),
      ]);
      setHistory(historyData.history || []);
      setQuota(quotaData);
    } catch (err) {
      console.error("Failed to load downloads data:", err);
      toast.error("Failed to load download history");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user) {
    return (
      <>
        <Head>
          <title>Downloads – YourTube</title>
        </Head>
        <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <Download className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Keep track of your downloads
          </h2>
          <p className="text-gray-500 max-w-md mx-auto text-sm">
            Sign in to access your downloaded videos, manage your daily quota, and
            choose your subscription plan.
          </p>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handlegooglesignin}
          >
            Sign in
          </Button>
        </div>
      </>
    );
  }

  const getStatusBadge = (status: string, reason?: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
            Completed
          </span>
        );
      case "downloading":
      case "authorized":
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
            In progress
          </span>
        );
      case "denied":
        return (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200"
            title={reason || "Daily limit reached"}
          >
            Denied
          </span>
        );
      case "interrupted":
        return (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"
            title={reason || "Connection closed before completion"}
          >
            Interrupted
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  const getPlanBadge = (plan: string) => {
    const p = (plan || "FREE").toUpperCase();
    switch (p) {
      case "GOLD":
        return (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-400 text-yellow-950 border border-yellow-500">
            GOLD
          </span>
        );
      case "SILVER":
        return (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300">
            SILVER
          </span>
        );
      case "BRONZE":
        return (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">
            BRONZE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border">
            FREE
          </span>
        );
    }
  };

  const currentPlan = quota?.plan || "FREE";
  const usedToday = quota?.downloadsToday ?? 0;
  const limitToday = quota?.dailyLimit ?? 1;
  const remainingToday = quota?.remainingDownloads ?? 0;
  const progressPercent = Math.min(
    100,
    Math.round((usedToday / (limitToday || 1)) * 100)
  );

  return (
    <>
      <Head>
        <title>Downloads & Subscription – YourTube</title>
      </Head>

      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
              <Download className="w-6 h-6 text-red-600" />
              Downloads & Subscription
            </h1>
            <p className="text-sm text-gray-500">
              Manage your daily download quotas, active subscription plan, and
              view audited download history.
            </p>
          </div>

          <Button
            className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-medium shadow-sm"
            onClick={() => setIsPlanModalOpen(true)}
            id="manage-plan-btn"
          >
            <Crown className="w-4 h-4 text-yellow-300" />
            Upgrade / Change Plan
          </Button>
        </div>

        {/* Quota Dashboard Banner */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Plan Info */}
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">
                Active Tier
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-gray-900">
                  {currentPlan}
                </span>
                {getPlanBadge(currentPlan)}
                {quota?.isExpired && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Expired
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {limitToday} download{limitToday > 1 ? "s" : ""} allowed per day
              </p>
            </div>

            {/* Quota Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-gray-600">
                <span>Today&apos;s Downloads</span>
                <span>
                  {usedToday} / {limitToday} used
                </span>
              </div>
              <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    progressPercent >= 100
                      ? "bg-red-500"
                      : progressPercent >= 80
                      ? "bg-amber-500"
                      : "bg-green-600"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Remaining: <strong className="text-green-700">{remainingToday}</strong></span>
                <span>Resets 00:00 UTC</span>
              </div>
            </div>

            {/* Duplicate Protection Rule Info */}
            <div className="bg-white/80 border border-gray-200 rounded-xl p-3 text-xs space-y-1 text-gray-600">
              <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Duplicate Protection Active
              </div>
              <p>
                Re-downloading the same video within <strong>30 minutes</strong> does
                not consume extra quota.
              </p>
            </div>
          </div>
        </div>

        {/* Download History Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              Download History ({history.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="text-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading download history...
            </div>
          ) : history.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-2xl p-12 text-center space-y-3">
              <Download className="w-12 h-12 text-gray-400 mx-auto" />
              <h3 className="font-semibold text-gray-800 text-base">
                No videos downloaded yet
              </h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Browse videos on YourTube and click the Download button to save them
                for offline viewing.
              </p>
              <Link href="/">
                <Button variant="outline" size="sm" className="mt-2">
                  Explore Videos
                </Button>
              </Link>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="divide-y divide-gray-100">
                {history.map((record) => {
                  const videoId = record.videoId?._id || record.videoId;
                  const displayTitle =
                    record.videoTitle ||
                    record.videoId?.videotitle ||
                    "YourTube Video";
                  const displaySize = formatBytes(
                    record.fileSize || record.videoId?.filesize
                  );
                  const formattedTime = (() => {
                    try {
                      return format(
                        new Date(record.downloadTimestamp || record.createdAt),
                        "dd MMM yyyy, h:mm a"
                      );
                    } catch {
                      return "Recently";
                    }
                  })();

                  const videoSrc = record.videoId?.filepath
                    ? getVideoUrl(record.videoId.filepath)
                    : null;

                  return (
                    <div
                      key={record._id}
                      className="p-4 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Video Thumbnail */}
                        <div className="relative w-24 h-14 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {videoSrc ? (
                            <video
                              src={videoSrc}
                              className="w-full h-full object-cover"
                              muted
                              preload="metadata"
                            />
                          ) : (
                            <Play className="w-6 h-6 text-gray-500" />
                          )}
                        </div>

                        {/* Title & Metadata */}
                        <div className="min-w-0 space-y-1">
                          {videoId ? (
                            <Link
                              href={`/watch/${videoId}`}
                              className="font-semibold text-sm text-gray-900 hover:text-blue-600 line-clamp-1 flex items-center gap-1.5"
                            >
                              {displayTitle}
                              <ExternalLink className="w-3.5 h-3.5 opacity-60 inline" />
                            </Link>
                          ) : (
                            <span className="font-semibold text-sm text-gray-900 line-clamp-1">
                              {displayTitle}
                            </span>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formattedTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {displaySize}
                            </span>
                            <span>{getPlanBadge(record.subscriptionPlan)}</span>
                            {record.isDuplicateReused && (
                              <span className="text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                Duplicate Reused
                              </span>
                            )}
                          </div>

                          {/* Audit info */}
                          <div className="text-[11px] text-gray-400">
                            {record.deviceInformation || "Desktop"} •{" "}
                            {record.browser || "Browser"} • IP: {record.ipAddress || "127.0.0.1"}
                            {record.failureReason && (
                              <span className="text-red-500 block">
                                Reason: {record.failureReason}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status and Action */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {getStatusBadge(record.status, record.failureReason)}

                        {videoId && (
                          <DownloadButton
                            videoId={String(videoId)}
                            videoTitle={displayTitle}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            showLabel={true}
                            onDownloadComplete={() => loadData()}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subscription Tier Modal */}
      {user?._id && (
        <SubscriptionPlanModal
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
          userId={user._id}
          currentQuota={quota}
          onPlanUpdated={loadData}
        />
      )}
    </>
  );
}

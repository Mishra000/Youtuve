import axiosInstance, { getBackendUrl } from "./axiosinstance";

export interface SubscriptionPlan {
  id: string;
  name: string;
  dailyDownloadLimit: number;
  description: string;
  price: number;
}

export interface UserQuota {
  plan: "FREE" | "BRONZE" | "SILVER" | "GOLD";
  originalPlan?: string;
  isExpired: boolean;
  endDate: string | null;
  dailyLimit: number;
  downloadsToday: number;
  remainingDownloads: number;
  duplicateWindowMinutes: number;
  serverTime: string;
}

export interface DownloadRecord {
  _id: string;
  userId: string;
  videoId: {
    _id: string;
    videotitle?: string;
    filepath?: string;
    filesize?: string;
    videochanel?: string;
    createdAt?: string;
  } | null;
  videoTitle: string;
  status:
    | "pending"
    | "authorized"
    | "downloading"
    | "completed"
    | "failed"
    | "interrupted"
    | "denied";
  fileSize: string;
  subscriptionPlan: string;
  ipAddress: string;
  deviceInformation: string;
  browser: string;
  userAgent: string;
  failureReason: string;
  isDuplicateReused: boolean;
  downloadTimestamp: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch authoritative user download quota from backend
 */
export async function fetchUserQuota(userId: string): Promise<UserQuota> {
  const res = await axiosInstance.get("/download/quota", {
    headers: { "x-user-id": userId },
  });
  return res.data;
}

/**
 * Fetch all available subscription plans and their limits
 */
export async function fetchSubscriptionPlans(): Promise<
  Record<string, SubscriptionPlan>
> {
  const res = await axiosInstance.get("/download/plans");
  return res.data.plans;
}

/**
 * Pre-authorize video download (checks quota & duplicate window)
 */
export async function authorizeVideoDownload(
  videoId: string,
  userId: string
): Promise<{
  success: boolean;
  message: string;
  remainingDownloads: number;
  limit: number;
  plan: string;
  isDuplicate?: boolean;
}> {
  const res = await axiosInstance.post(
    `/download/authorize/${videoId}`,
    {},
    {
      headers: { "x-user-id": userId },
    }
  );
  return res.data;
}

/**
 * Download authorized video file via secure streaming endpoint
 */
export async function executeVideoDownload(
  videoId: string,
  userId: string,
  fallbackTitle: string = "video",
  onProgress?: (percent: number) => void
): Promise<{
  success: boolean;
  remainingDownloads: number;
  plan: string;
  filename: string;
}> {
  const res = await axiosInstance.get(`/download/video/${videoId}`, {
    headers: { "x-user-id": userId },
    responseType: "blob",
    onDownloadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percent);
      }
    },
  });

  // Extract filename from Content-Disposition header if available
  let filename = `${fallbackTitle.replace(/[^\w\s.-]/gi, "").trim() || "video"}.mp4`;
  const disposition = res.headers["content-disposition"];
  if (disposition) {
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, "").trim());
    }
  }

  const remainingDownloads = parseInt(
    res.headers["x-remaining-downloads"] || "0",
    10
  );
  const plan = res.headers["x-subscription-plan"] || "FREE";

  // Trigger browser download via object URL
  const blob = new Blob([res.data], {
    type: res.headers["content-type"] || "video/mp4",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);

  return {
    success: true,
    remainingDownloads,
    plan,
    filename,
  };
}

/**
 * Fetch user download history
 */
export async function fetchDownloadHistory(
  userId: string,
  page: number = 1,
  limit: number = 50
): Promise<{
  history: DownloadRecord[];
  total: number;
  page: number;
  pages: number;
  quota: {
    plan: string;
    dailyLimit: number;
    downloadsToday: number;
    remainingDownloads: number;
  };
}> {
  const res = await axiosInstance.get("/download/history", {
    headers: { "x-user-id": userId },
    params: { page, limit },
  });
  return res.data;
}

/**
 * Change or test subscription plan (Free, Bronze, Silver, Gold, or Expired)
 */
export async function updateSubscriptionPlan(
  userId: string,
  plan: string,
  options: { durationDays?: number; expireNow?: boolean } = {}
): Promise<{
  success: boolean;
  message: string;
  subscription: {
    plan: string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
  };
  quota: UserQuota;
}> {
  const res = await axiosInstance.post(
    "/download/subscription/upgrade",
    {
      plan,
      ...options,
    },
    {
      headers: { "x-user-id": userId },
    }
  );
  return res.data;
}

/**
 * Helper to format byte sizes into readable format (e.g. 1.2 MB)
 */
export function formatBytes(bytesStr: string | number | undefined): string {
  const bytes = typeof bytesStr === "string" ? parseInt(bytesStr, 10) : bytesStr;
  if (!bytes || isNaN(bytes) || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

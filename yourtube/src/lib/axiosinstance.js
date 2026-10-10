import axios from "axios";

export const getBackendUrl = () => {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  return url.replace(/\/+$/, "");
};

export const getVideoUrl = (filepath) => {
  if (!filepath) return "";
  const pathStr = String(filepath).trim();
  if (pathStr.startsWith("http://") || pathStr.startsWith("https://")) {
    return pathStr;
  }
  const cleanPath = pathStr.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${getBackendUrl()}/${cleanPath}`;
};

const axiosInstance = axios.create({
  baseURL: getBackendUrl(),
});

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const deviceId = localStorage.getItem("yt_device_id");
    if (deviceId) {
      config.headers["x-device-id"] = deviceId;
    }

    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?._id) {
          config.headers["x-user-id"] = user._id;
          config.headers["Authorization"] = `Bearer ${user._id}`;
        }
      }
    } catch {
      // ignore
    }
  }
  return config;
});

export default axiosInstance;
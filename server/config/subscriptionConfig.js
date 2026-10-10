// Central Subscription & Download Configuration
// Default daily limits can be overridden via environment variables

export const SUBSCRIPTION_PLANS = {
  FREE: {
    id: "FREE",
    name: "Free",
    dailyDownloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_FREE || "1", 10),
    description: "Standard daily access for casual viewers",
    price: 0,
  },
  BRONZE: {
    id: "BRONZE",
    name: "Bronze",
    dailyDownloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_BRONZE || "5", 10),
    description: "5 downloads per day for regular viewers",
    price: 4.99,
  },
  SILVER: {
    id: "SILVER",
    name: "Silver",
    dailyDownloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_SILVER || "10", 10),
    description: "10 downloads per day for power viewers",
    price: 9.99,
  },
  GOLD: {
    id: "GOLD",
    name: "Gold",
    dailyDownloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_GOLD || "20", 10),
    description: "20 downloads per day with highest priority",
    price: 19.99,
  },
};

// Window in minutes during which repeated downloads of the same video
// do NOT consume additional quota (default: 30 minutes)
export const DOWNLOAD_DUPLICATE_WINDOW_MINUTES = parseInt(
  process.env.DOWNLOAD_DUPLICATE_WINDOW_MINUTES || "30",
  10
);

// Rate-limiting window and max requests for download initiation
export const DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS = parseInt(
  process.env.DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS || "60",
  10
);
export const DOWNLOAD_RATE_LIMIT_MAX_REQUESTS = parseInt(
  process.env.DOWNLOAD_RATE_LIMIT_MAX_REQUESTS || "10",
  10
);

export function getPlanConfig(planName) {
  const normalized = (planName || "FREE").toUpperCase();
  return SUBSCRIPTION_PLANS[normalized] || SUBSCRIPTION_PLANS.FREE;
}

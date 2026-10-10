// Centralized Subscription Plans & Features Configuration
// All limits, pricing, cycles, and feature permissions are defined here.

export const PLAN_HIERARCHY = {
  FREE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
};

export const BILLING_CYCLES = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};

export const SUBSCRIPTION_PLANS = {
  FREE: {
    planId: "FREE",
    name: "Free",
    currency: "INR",
    symbol: "₹",
    description: "Standard daily access for casual viewers",
    pricing: {
      MONTHLY: {
        price: 0,
        durationDays: 30,
        label: "₹0 / month",
      },
      QUARTERLY: {
        price: 0,
        durationDays: 90,
        label: "₹0 / 3 months",
      },
      YEARLY: {
        price: 0,
        durationDays: 365,
        label: "₹0 / year",
      },
    },
    streamingQuality: "480p / 720p SD/HD",
    maxQualityResolution: 720,
    watchTimeLimitMinutes: parseInt(process.env.WATCH_LIMIT_FREE || "120", 10), // 2 hrs/day
    downloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_FREE || "1", 10),
    premiumVideoAccess: false,
    exclusiveContent: false,
    adFree: false,
    premiumCourses: false,
    priorityContent: false,
    offlineDownloads: "1 download/day",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-300",
  },

  BRONZE: {
    planId: "BRONZE",
    name: "Bronze",
    currency: "INR",
    symbol: "₹",
    description: "Full HD streaming, 5 downloads/day, and premium video access",
    pricing: {
      MONTHLY: {
        price: parseInt(process.env.PRICE_BRONZE_MONTHLY || "199", 10),
        durationDays: 30,
        label: "₹199 / month",
      },
      QUARTERLY: {
        price: parseInt(process.env.PRICE_BRONZE_QUARTERLY || "549", 10),
        durationDays: 90,
        label: "₹549 / 3 months (Save 8%)",
        discountPercent: 8,
      },
      YEARLY: {
        price: parseInt(process.env.PRICE_BRONZE_YEARLY || "1999", 10),
        durationDays: 365,
        label: "₹1,999 / year (Save 16%)",
        discountPercent: 16,
      },
    },
    streamingQuality: "1080p Full HD",
    maxQualityResolution: 1080,
    watchTimeLimitMinutes: parseInt(process.env.WATCH_LIMIT_BRONZE || "360", 10), // 6 hrs/day
    downloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_BRONZE || "5", 10),
    premiumVideoAccess: true,
    exclusiveContent: false,
    adFree: false,
    premiumCourses: false,
    priorityContent: false,
    offlineDownloads: "5 downloads/day",
    badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
  },

  SILVER: {
    planId: "SILVER",
    name: "Silver",
    currency: "INR",
    symbol: "₹",
    description: "2K QHD streaming, 10 downloads/day, ad-free viewing, and premium courses",
    pricing: {
      MONTHLY: {
        price: parseInt(process.env.PRICE_SILVER_MONTHLY || "399", 10),
        durationDays: 30,
        label: "₹399 / month",
      },
      QUARTERLY: {
        price: parseInt(process.env.PRICE_SILVER_QUARTERLY || "1099", 10),
        durationDays: 90,
        label: "₹1,099 / 3 months (Save 9%)",
        discountPercent: 9,
      },
      YEARLY: {
        price: parseInt(process.env.PRICE_SILVER_YEARLY || "3999", 10),
        durationDays: 365,
        label: "₹3,999 / year (Save 16%)",
        discountPercent: 16,
      },
    },
    streamingQuality: "1440p 2K QHD",
    maxQualityResolution: 1440,
    watchTimeLimitMinutes: 0, // 0 = Unlimited
    downloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_SILVER || "10", 10),
    premiumVideoAccess: true,
    exclusiveContent: true,
    adFree: true,
    premiumCourses: true,
    priorityContent: false,
    offlineDownloads: "10 downloads/day",
    badgeColor: "bg-slate-200 text-slate-800 border-slate-300",
  },

  GOLD: {
    planId: "GOLD",
    name: "Gold",
    currency: "INR",
    symbol: "₹",
    description: "4K UHD + HDR, 20 downloads/day, priority releases, and all exclusive perks",
    pricing: {
      MONTHLY: {
        price: parseInt(process.env.PRICE_GOLD_MONTHLY || "699", 10),
        durationDays: 30,
        label: "₹699 / month",
      },
      QUARTERLY: {
        price: parseInt(process.env.PRICE_GOLD_QUARTERLY || "1899", 10),
        durationDays: 90,
        label: "₹1,899 / 3 months (Save 10%)",
        discountPercent: 10,
      },
      YEARLY: {
        price: parseInt(process.env.PRICE_GOLD_YEARLY || "6999", 10),
        durationDays: 365,
        label: "₹6,999 / year (Save 17%)",
        discountPercent: 17,
      },
    },
    streamingQuality: "4K UHD + HDR",
    maxQualityResolution: 2160,
    watchTimeLimitMinutes: 0, // Unlimited
    downloadLimit: parseInt(process.env.DOWNLOAD_LIMIT_GOLD || "20", 10),
    premiumVideoAccess: true,
    exclusiveContent: true,
    adFree: true,
    premiumCourses: true,
    priorityContent: true,
    offlineDownloads: "20 downloads/day (Priority queue)",
    badgeColor: "bg-yellow-400 text-yellow-950 border-yellow-500 font-bold",
  },
};

/**
 * Get plan config by ID (case-insensitive)
 */
export function getPlanDetails(planId) {
  const normalized = String(planId || "FREE").toUpperCase();
  return SUBSCRIPTION_PLANS[normalized] || SUBSCRIPTION_PLANS.FREE;
}

/**
 * Authoritatively calculate amount in INR based on plan and billing cycle
 */
export function calculateOrderAmount(planId, billingCycle) {
  const plan = getPlanDetails(planId);
  const cycle = String(billingCycle || "MONTHLY").toUpperCase();
  const pricingOption = plan.pricing[cycle] || plan.pricing.MONTHLY;

  return {
    amountInRupees: pricingOption.price,
    amountInPaise: pricingOption.price * 100,
    durationDays: pricingOption.durationDays,
    currency: plan.currency || "INR",
    planName: plan.name,
    cycle,
  };
}

/**
 * Calculate subscription start, expiry, and next renewal dates
 */
export function calculateSubscriptionDates(billingCycle, fromDate = new Date()) {
  const cycle = String(billingCycle || "MONTHLY").toUpperCase();
  let durationDays = 30;
  if (cycle === "QUARTERLY") durationDays = 90;
  if (cycle === "YEARLY") durationDays = 365;

  const startDate = new Date(fromDate);
  const expiryDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const nextRenewalDate = new Date(expiryDate);

  return {
    startDate,
    expiryDate,
    nextRenewalDate,
    durationDays,
  };
}

/**
 * Validate upgrade or downgrade relationship
 */
export function isValidUpgrade(currentPlan, targetPlan) {
  const currLevel = PLAN_HIERARCHY[String(currentPlan || "FREE").toUpperCase()] || 0;
  const targetLevel = PLAN_HIERARCHY[String(targetPlan || "FREE").toUpperCase()] || 0;
  return targetLevel > currLevel;
}

export function isSameOrHigherTier(userPlan, requiredPlan) {
  const userLevel = PLAN_HIERARCHY[String(userPlan || "FREE").toUpperCase()] || 0;
  const reqLevel = PLAN_HIERARCHY[String(requiredPlan || "FREE").toUpperCase()] || 0;
  return userLevel >= reqLevel;
}

import axiosInstance from "./axiosinstance";

export interface PricingCycle {
  price: number;
  durationDays: number;
  label: string;
  discountPercent?: number;
}

export interface PlanConfig {
  planId: "FREE" | "BRONZE" | "SILVER" | "GOLD";
  name: string;
  currency: string;
  symbol: string;
  description: string;
  pricing: {
    MONTHLY: PricingCycle;
    QUARTERLY: PricingCycle;
    YEARLY: PricingCycle;
  };
  streamingQuality: string;
  maxQualityResolution: number;
  watchTimeLimitMinutes: number;
  downloadLimit: number;
  premiumVideoAccess: boolean;
  exclusiveContent: boolean;
  adFree: boolean;
  premiumCourses: boolean;
  priorityContent: boolean;
  offlineDownloads: string;
  badgeColor: string;
}

export interface UserSubscriptionStatus {
  plan: "FREE" | "BRONZE" | "SILVER" | "GOLD";
  originalPlan: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "PENDING" | "FAILED";
  isExpired: boolean;
  startDate: string;
  expiryDate: string | null;
  nextRenewalDate: string | null;
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | "NONE";
  autoRenew: boolean;
  scheduledDowngradePlan: string | null;
  daysRemaining: number;
}

export interface UserFeatures {
  streamingQuality: string;
  maxQualityResolution: number;
  watchTimeLimitMinutes: number;
  downloadLimit: number;
  premiumVideoAccess: boolean;
  exclusiveContent: boolean;
  adFree: boolean;
  premiumCourses: boolean;
  priorityContent: boolean;
  offlineDownloads: string;
}

export interface TransactionRecord {
  _id: string;
  userId: string;
  subscriptionPlan: string;
  billingCycle: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentStatus: "CREATED" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED";
  paymentMethod: string;
  subscriptionStartDate: string;
  subscriptionExpiryDate: string;
  failureReason?: string;
  createdAt: string;
  invoiceDetails?: {
    invoiceDate: string;
    planName: string;
    billingCycle: string;
    baseAmount: number;
    taxAmount: number;
    totalAmount: number;
    paidAt?: string;
  };
}

/**
 * Load Razorpay Checkout JS dynamically
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn("Failed to load Razorpay script from CDN");
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Fetch all available subscription plans & pricing
 */
export async function fetchSubscriptionPlans(): Promise<{
  plans: Record<string, PlanConfig>;
  razorpayKeyId: string;
}> {
  const res = await axiosInstance.get("/subscription/plans");
  return res.data;
}

/**
 * Fetch current user subscription status & permissions
 */
export async function fetchSubscriptionStatus(userId: string): Promise<{
  subscription: UserSubscriptionStatus;
  features: UserFeatures;
}> {
  const res = await axiosInstance.get("/subscription/status", {
    headers: { "x-user-id": userId },
  });
  return res.data;
}

/**
 * Create a Razorpay Order on the backend
 */
export async function createSubscriptionOrder(
  userId: string,
  plan: string,
  billingCycle: string
): Promise<{
  order: {
    id: string;
    amount: number;
    amountInRupees: number;
    currency: string;
    plan: string;
    billingCycle: string;
    invoiceNumber: string;
    keyId: string;
    customer: {
      name: string;
      email: string;
    };
  };
  transactionId: string;
}> {
  const res = await axiosInstance.post(
    "/subscription/create-order",
    { plan, billingCycle },
    { headers: { "x-user-id": userId } }
  );
  return res.data;
}

/**
 * Verify Razorpay payment signature on backend
 */
export async function verifyPayment(
  userId: string,
  paymentData: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentMethod?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  subscription: UserSubscriptionStatus;
  transaction: Partial<TransactionRecord>;
}> {
  const res = await axiosInstance.post("/subscription/verify-payment", paymentData, {
    headers: { "x-user-id": userId },
  });
  return res.data;
}

/**
 * Cancel checkout order
 */
export async function cancelSubscriptionOrder(
  userId: string,
  razorpayOrderId: string,
  reason?: string
): Promise<void> {
  await axiosInstance.post(
    "/subscription/cancel-order",
    { razorpayOrderId, reason },
    { headers: { "x-user-id": userId } }
  );
}

/**
 * Toggle auto-renew status
 */
export async function toggleAutoRenew(userId: string): Promise<{
  autoRenew: boolean;
  status: string;
  message: string;
}> {
  const res = await axiosInstance.post(
    "/subscription/toggle-auto-renew",
    {},
    { headers: { "x-user-id": userId } }
  );
  return res.data;
}

/**
 * Schedule a downgrade at end of current paid cycle
 */
export async function scheduleDowngrade(
  userId: string,
  targetPlan: string
): Promise<{
  scheduledDowngradePlan: string;
  effectiveDate: string;
  message: string;
}> {
  const res = await axiosInstance.post(
    "/subscription/schedule-downgrade",
    { targetPlan },
    { headers: { "x-user-id": userId } }
  );
  return res.data;
}

/**
 * Fetch billing & invoice history
 */
export async function fetchBillingHistory(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{
  transactions: TransactionRecord[];
  total: number;
  page: number;
  pages: number;
}> {
  const res = await axiosInstance.get("/subscription/billing-history", {
    headers: { "x-user-id": userId },
    params: { page, limit },
  });
  return res.data;
}

/**
 * Fetch single invoice details
 */
export async function fetchInvoiceDetails(
  userId: string,
  transactionId: string
): Promise<{
  invoice: {
    invoiceNumber: string;
    date: string;
    user: { name: string; email: string };
    plan: string;
    billingCycle: string;
    amount: number;
    currency: string;
    paymentStatus: string;
    paymentMethod: string;
    razorpayPaymentId: string;
    razorpayOrderId: string;
    subscriptionStartDate: string;
    subscriptionExpiryDate: string;
  };
}> {
  const res = await axiosInstance.get(`/subscription/invoice/${transactionId}`, {
    headers: { "x-user-id": userId },
  });
  return res.data;
}

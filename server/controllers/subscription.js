import crypto from "crypto";
import Razorpay from "razorpay";
import mongoose from "mongoose";

import users from "../Modals/Auth.js";
import Transaction, { generateInvoiceNumber } from "../Modals/Transaction.js";
import {
  SUBSCRIPTION_PLANS,
  PLAN_HIERARCHY,
  getPlanDetails,
  calculateOrderAmount,
  calculateSubscriptionDates,
  isValidUpgrade,
} from "../config/subscriptionPlans.js";
import { getAuthUserFromRequest } from "../middleware/subscriptionAuth.js";
import { sendSubscriptionConfirmationEmail } from "../utils/emailService.js";

// Razorpay Test Mode Configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

let razorpayClient = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpayClient = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  } catch (err) {
    console.warn("[Razorpay] Client init warning:", err.message);
  }
}

/**
 * GET /subscription/plans
 * Returns all subscription plans with prices, limits, and features
 */
export const getAllPlans = async (req, res) => {
  return res.status(200).json({
    success: true,
    plans: SUBSCRIPTION_PLANS,
    razorpayKeyId: RAZORPAY_KEY_ID,
  });
};

/**
 * GET /subscription/status
 * Returns current authenticated user subscription status, dates, and active features
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view subscription status",
        code: "AUTH_REQUIRED",
      });
    }

    const sub = user.subscription || { plan: "FREE", status: "ACTIVE" };
    let plan = (sub.plan || "FREE").toUpperCase();
    let status = (sub.status || "ACTIVE").toUpperCase();
    const expiry = sub.expiryDate || sub.endDate;

    let isExpired = false;
    if (plan !== "FREE" && expiry && new Date(expiry) < new Date()) {
      isExpired = true;
      plan = "FREE";
      status = "EXPIRED";
      if (sub.status !== "EXPIRED") {
        user.subscription.status = "EXPIRED";
        user.subscription.plan = "FREE";
        user.subscription.isActive = false;
        await user.save();
      }
    }

    const planConfig = getPlanDetails(plan);
    const originalPlanConfig = getPlanDetails(sub.plan || "FREE");

    const daysRemaining = expiry && !isExpired
      ? Math.max(0, Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24)))
      : 0;

    return res.status(200).json({
      success: true,
      subscription: {
        plan,
        originalPlan: sub.plan || "FREE",
        status,
        isExpired,
        startDate: sub.startDate || user.joinedon,
        expiryDate: sub.expiryDate || sub.endDate,
        nextRenewalDate: sub.nextRenewalDate || sub.expiryDate,
        billingCycle: sub.billingCycle || "NONE",
        autoRenew: Boolean(sub.autoRenew),
        scheduledDowngradePlan: sub.scheduledDowngradePlan || null,
        daysRemaining,
      },
      features: {
        streamingQuality: planConfig.streamingQuality,
        maxQualityResolution: planConfig.maxQualityResolution,
        watchTimeLimitMinutes: planConfig.watchTimeLimitMinutes,
        downloadLimit: planConfig.downloadLimit,
        premiumVideoAccess: planConfig.premiumVideoAccess,
        exclusiveContent: planConfig.exclusiveContent,
        adFree: planConfig.adFree,
        premiumCourses: planConfig.premiumCourses,
        priorityContent: planConfig.priorityContent,
        offlineDownloads: planConfig.offlineDownloads,
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("getSubscriptionStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get subscription status",
      error: error.message,
    });
  }
};

/**
 * POST /subscription/create-order
 * Validates plan + cycle on backend and creates Razorpay Order
 */
export const createSubscriptionOrder = async (req, res) => {
  const { plan, billingCycle } = req.body;

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to purchase a subscription",
        code: "AUTH_REQUIRED",
      });
    }

    const targetPlan = String(plan || "").toUpperCase();
    if (!["BRONZE", "SILVER", "GOLD"].includes(targetPlan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan selected. Must be BRONZE, SILVER, or GOLD.",
        code: "INVALID_PLAN",
      });
    }

    const cycle = String(billingCycle || "MONTHLY").toUpperCase();
    if (!["MONTHLY", "QUARTERLY", "YEARLY"].includes(cycle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid billing cycle selected. Must be MONTHLY, QUARTERLY, or YEARLY.",
        code: "INVALID_CYCLE",
      });
    }

    // Server-side authoritative amount calculation — never trusts frontend price
    const orderCalc = calculateOrderAmount(targetPlan, cycle);
    if (!orderCalc.amountInRupees || orderCalc.amountInRupees <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan pricing",
      });
    }

    // Generate unique invoice number
    const invoiceNumber = generateInvoiceNumber();

    if (!razorpayClient) {
      return res.status(503).json({
        success: false,
        message: "Razorpay is not configured. Add valid test keys to the backend environment.",
      });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await razorpayClient.orders.create({
        amount: orderCalc.amountInPaise,
        currency: orderCalc.currency,
        receipt: invoiceNumber,
        notes: {
          userId: String(user._id),
          plan: targetPlan,
          billingCycle: cycle,
        },
      });
    } catch (rzpErr) {
      console.error("[Razorpay] Order creation failed:", rzpErr.message);
      return res.status(502).json({
        success: false,
        message: "Razorpay couldn't create the payment order. Check the test API keys and try again.",
      });
    }

    if (!razorpayOrder?.id) {
      return res.status(502).json({
        success: false,
        message: "Razorpay returned an invalid payment order.",
      });
    }
    const orderId = razorpayOrder.id;

    // Calculate dates
    const dates = calculateSubscriptionDates(cycle);

    // Save initial transaction record in CREATED state
    const transaction = await Transaction.create({
      userId: user._id,
      subscriptionPlan: targetPlan,
      billingCycle: cycle,
      razorpayOrderId: orderId,
      invoiceNumber,
      amount: orderCalc.amountInRupees,
      currency: orderCalc.currency,
      paymentStatus: "CREATED",
      paymentMethod: "razorpay_test",
      subscriptionStartDate: dates.startDate,
      subscriptionExpiryDate: dates.expiryDate,
      customerEmail: user.email || "",
      customerName: user.name || "",
      invoiceDetails: {
        invoiceDate: new Date(),
        planName: orderCalc.planName,
        billingCycle: cycle,
        baseAmount: orderCalc.amountInRupees,
        taxAmount: 0,
        totalAmount: orderCalc.amountInRupees,
      },
    });

    return res.status(200).json({
      success: true,
      order: {
        id: orderId,
        amount: orderCalc.amountInPaise,
        amountInRupees: orderCalc.amountInRupees,
        currency: orderCalc.currency,
        plan: targetPlan,
        billingCycle: cycle,
        invoiceNumber,
        keyId: RAZORPAY_KEY_ID,
        customer: {
          name: user.name || "Subscriber",
          email: user.email || "",
        },
      },
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("createSubscriptionOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create subscription order",
      error: error.message,
    });
  }
};

/**
 * Helper to compute and verify Razorpay signature
 */
export function verifySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;

  // Real HMAC-SHA256 signature verification
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature === signature) return true;

  return false;
}

/**
 * POST /subscription/verify-payment
 * Authoritatively verifies Razorpay signature, enforces duplicate protection,
 * and activates subscription only upon successful verification.
 */
export const verifySubscriptionPayment = async (req, res) => {
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paymentMethod,
  } = req.body;

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details (orderId, paymentId, signature) are required",
        code: "MISSING_DETAILS",
      });
    }

    // 1. Locate the existing transaction created by backend
    const transaction = await Transaction.findOne({ razorpayOrderId, userId: user._id });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found for this order ID",
        code: "TRANSACTION_NOT_FOUND",
      });
    }

    // 2. Duplicate payment protection: check if payment ID was already used
    const existingSuccess = await Transaction.findOne({
      razorpayPaymentId,
      paymentStatus: "SUCCESS",
    });
    if (existingSuccess) {
      return res.status(409).json({
        success: false,
        message: "This payment has already been processed and credited",
        code: "DUPLICATE_PAYMENT",
        transactionId: existingSuccess._id,
      });
    }

    // 3. Reject already processed order
    if (transaction.paymentStatus === "SUCCESS") {
      return res.status(409).json({
        success: false,
        message: "This order has already been successfully completed",
        code: "ORDER_ALREADY_COMPLETED",
      });
    }

    // 4. Verify HMAC-SHA256 signature
    const isValid = verifySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      // Mark transaction as failed
      transaction.paymentStatus = "FAILED";
      transaction.failureReason = "Invalid cryptographic payment signature";
      transaction.razorpayPaymentId = razorpayPaymentId;
      transaction.razorpaySignature = razorpaySignature;
      await transaction.save();

      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
        code: "INVALID_SIGNATURE",
      });
    }

    // 5. Calculate new subscription duration & renewal dates
    const currentSub = user.subscription || {};
    const cycle = transaction.billingCycle || "MONTHLY";
    const targetPlan = transaction.subscriptionPlan;

    // Check if user has an existing active paid subscription on the SAME plan to extend
    let fromDate = new Date();
    const currExpiry = currentSub.expiryDate || currentSub.endDate;
    if (
      currentSub.plan === targetPlan &&
      currExpiry &&
      new Date(currExpiry) > new Date()
    ) {
      // Renewal: extend from existing expiry date
      fromDate = new Date(currExpiry);
    }

    const dates = calculateSubscriptionDates(cycle, fromDate);

    // 6. Update Transaction to SUCCESS
    transaction.paymentStatus = "SUCCESS";
    transaction.razorpayPaymentId = razorpayPaymentId;
    transaction.razorpaySignature = razorpaySignature;
    transaction.paymentMethod = paymentMethod || "razorpay_test";
    transaction.subscriptionStartDate = dates.startDate;
    transaction.subscriptionExpiryDate = dates.expiryDate;
    transaction.invoiceDetails.paidAt = new Date();
    await transaction.save();

    // 7. Update User Subscription in Database
    user.subscription = {
      plan: targetPlan,
      status: "ACTIVE",
      startDate: currentSub.plan === targetPlan && currentSub.startDate ? currentSub.startDate : dates.startDate,
      expiryDate: dates.expiryDate,
      endDate: dates.expiryDate, // Maintain compatibility with downloads
      nextRenewalDate: dates.nextRenewalDate,
      billingCycle: cycle,
      autoRenew: true,
      lastPaymentId: razorpayPaymentId,
      currentSubscriptionId: transaction._id.toString(),
      scheduledDowngradePlan: null,
      isActive: true,
    };
    await user.save();

    // 8. Send confirmation email with full invoice details asynchronously
    sendSubscriptionConfirmationEmail({
      toEmail: user.email,
      userName: user.name || "Subscriber",
      subscriptionPlan: targetPlan,
      billingCycle: cycle,
      amount: transaction.amount,
      currency: transaction.currency,
      paymentDate: new Date(),
      transactionId: transaction._id.toString(),
      razorpayPaymentId,
      invoiceNumber: transaction.invoiceNumber,
      startDate: dates.startDate,
      expiryDate: dates.expiryDate,
      nextRenewalDate: dates.nextRenewalDate,
    }).catch((emailErr) => {
      console.warn("[Subscription] Email sending log:", emailErr.message);
    });

    return res.status(200).json({
      success: true,
      message: `Your subscription to YourTube ${targetPlan} is now active!`,
      subscription: user.subscription,
      transaction: {
        id: transaction._id,
        invoiceNumber: transaction.invoiceNumber,
        amount: transaction.amount,
        currency: transaction.currency,
        plan: targetPlan,
        billingCycle: cycle,
        paymentStatus: transaction.paymentStatus,
        paymentId: razorpayPaymentId,
        startDate: dates.startDate,
        expiryDate: dates.expiryDate,
      },
    });
  } catch (error) {
    console.error("verifySubscriptionPayment error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during payment verification",
      error: error.message,
    });
  }
};

/**
 * POST /subscription/cancel-order
 * Mark an uncompleted order as cancelled (e.g. user dismissed Razorpay modal)
 */
export const cancelSubscriptionOrder = async (req, res) => {
  const { razorpayOrderId, reason } = req.body;

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Auth required" });
    }

    if (!razorpayOrderId) {
      return res.status(400).json({ success: false, message: "Order ID required" });
    }

    const transaction = await Transaction.findOne({ razorpayOrderId, userId: user._id });
    if (transaction && transaction.paymentStatus === "CREATED") {
      transaction.paymentStatus = "CANCELLED";
      transaction.failureReason = reason || "Checkout cancelled by user";
      await transaction.save();
    }

    return res.status(200).json({
      success: true,
      message: "Payment checkout cancelled",
    });
  } catch (error) {
    console.error("cancelSubscriptionOrder error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /subscription/toggle-auto-renew
 * Toggle auto-renew on current active subscription
 */
export const toggleAutoRenew = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Auth required" });
    }

    const currentAutoRenew = Boolean(user.subscription?.autoRenew);
    user.subscription.autoRenew = !currentAutoRenew;

    // If cancelled auto-renew, keep plan active until expiry date
    if (currentAutoRenew) {
      user.subscription.status = "CANCELLED"; // Marked as cancelled renewal
    } else {
      user.subscription.status = "ACTIVE";
    }

    await user.save();

    const expiryStr = user.subscription?.expiryDate
      ? new Date(user.subscription.expiryDate).toLocaleDateString()
      : "end of period";

    return res.status(200).json({
      success: true,
      autoRenew: user.subscription.autoRenew,
      status: user.subscription.status,
      message: user.subscription.autoRenew
        ? "Auto-renewal enabled. Your subscription will renew automatically."
        : `Auto-renewal cancelled. Your subscription will remain active until ${expiryStr}, then downgrade to Free.`,
    });
  } catch (error) {
    console.error("toggleAutoRenew error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /subscription/schedule-downgrade
 * Allows scheduling a downgrade to a lower plan effective after current billing cycle
 */
export const scheduleDowngrade = async (req, res) => {
  const { targetPlan } = req.body;

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Auth required" });
    }

    const norm = String(targetPlan || "FREE").toUpperCase();
    user.subscription.scheduledDowngradePlan = norm;
    user.subscription.autoRenew = false;
    await user.save();

    const expiryStr = user.subscription?.expiryDate
      ? new Date(user.subscription.expiryDate).toLocaleDateString()
      : "end of billing cycle";

    return res.status(200).json({
      success: true,
      scheduledDowngradePlan: norm,
      effectiveDate: user.subscription.expiryDate,
      message: `Your downgrade to ${norm} has been scheduled. You retain your current ${user.subscription.plan} benefits until ${expiryStr}.`,
    });
  } catch (error) {
    console.error("scheduleDowngrade error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /subscription/billing-history
 * Returns paginated billing transactions for current user only
 */
export const getBillingHistory = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view billing history",
        code: "AUTH_REQUIRED",
      });
    }

    const limit = parseInt(req.query.limit || "20", 10);
    const page = parseInt(req.query.page || "1", 10);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments({ userId: user._id }),
    ]);

    return res.status(200).json({
      success: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("getBillingHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch billing history",
      error: error.message,
    });
  }
};

/**
 * GET /subscription/invoice/:transactionId
 * Returns full invoice data for a transaction (user or admin only)
 */
export const getInvoiceDetails = async (req, res) => {
  const { transactionId } = req.params;

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Auth required" });
    }

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({ success: false, message: "Invalid transaction ID" });
    }

    const tx = await Transaction.findById(transactionId).lean();
    if (!tx) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    if (String(tx.userId) !== String(user._id) && user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.status(200).json({
      success: true,
      invoice: {
        invoiceNumber: tx.invoiceNumber,
        date: tx.createdAt,
        user: {
          name: tx.customerName || user.name,
          email: tx.customerEmail || user.email,
        },
        plan: tx.subscriptionPlan,
        billingCycle: tx.billingCycle,
        amount: tx.amount,
        currency: tx.currency,
        paymentStatus: tx.paymentStatus,
        paymentMethod: tx.paymentMethod,
        razorpayPaymentId: tx.razorpayPaymentId,
        razorpayOrderId: tx.razorpayOrderId,
        subscriptionStartDate: tx.subscriptionStartDate,
        subscriptionExpiryDate: tx.subscriptionExpiryDate,
      },
    });
  } catch (error) {
    console.error("getInvoiceDetails error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /subscription/webhook
 * Handles Razorpay Webhook notifications for asynchronous payment events
 */
export const handleRazorpayWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    // If webhook secret is set, verify signature
    if (webhookSecret) {
      const signature = req.headers["x-razorpay-signature"];
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.warn("[Webhook] Invalid webhook signature received");
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }
    }

    const event = req.body.event;
    console.log(`[Webhook] Razorpay event received: ${event}`);

    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = req.body.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId && paymentId) {
        const tx = await Transaction.findOne({ razorpayOrderId: orderId });
        if (tx && tx.paymentStatus !== "SUCCESS") {
          tx.paymentStatus = "SUCCESS";
          tx.razorpayPaymentId = paymentId;
          tx.paymentMethod = paymentEntity.method || "razorpay_webhook";
          tx.invoiceDetails.paidAt = new Date();
          await tx.save();

          const user = await users.findById(tx.userId);
          if (user) {
            const dates = calculateSubscriptionDates(tx.billingCycle);
            user.subscription = {
              plan: tx.subscriptionPlan,
              status: "ACTIVE",
              startDate: dates.startDate,
              expiryDate: dates.expiryDate,
              endDate: dates.expiryDate,
              billingCycle: tx.billingCycle,
              autoRenew: true,
              lastPaymentId: paymentId,
              currentSubscriptionId: tx._id.toString(),
              isActive: true,
            };
            await user.save();
            console.log(`[Webhook] Activated subscription for user ${user._id} via webhook`);
          }
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("[Webhook] Webhook error:", err);
    return res.status(500).json({ status: "error" });
  }
};

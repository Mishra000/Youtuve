import express from "express";
import {
  getAllPlans,
  getSubscriptionStatus,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  cancelSubscriptionOrder,
  toggleAutoRenew,
  scheduleDowngrade,
  getBillingHistory,
  getInvoiceDetails,
  handleRazorpayWebhook,
} from "../controllers/subscription.js";

const router = express.Router();

// Plan information
router.get("/plans", getAllPlans);

// User subscription status
router.get("/status", getSubscriptionStatus);

// Razorpay test payment flow
router.post("/create-order", createSubscriptionOrder);
router.post("/verify-payment", verifySubscriptionPayment);
router.post("/cancel-order", cancelSubscriptionOrder);

// Subscription management
router.post("/toggle-auto-renew", toggleAutoRenew);
router.post("/schedule-downgrade", scheduleDowngrade);

// Billing history & invoices
router.get("/billing-history", getBillingHistory);
router.get("/invoice/:transactionId", getInvoiceDetails);

// Webhook
router.post("/webhook", handleRazorpayWebhook);

export default router;

import mongoose from "mongoose";

const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  joinedon: { type: Date, default: Date.now },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  subscription: {
    plan: {
      type: String,
      enum: ["FREE", "BRONZE", "SILVER", "GOLD"],
      default: "FREE",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CANCELLED", "PENDING", "FAILED"],
      default: "ACTIVE",
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null }, // Backwards compatibility with download system
    expiryDate: { type: Date, default: null },
    nextRenewalDate: { type: Date, default: null },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY", "NONE"],
      default: "NONE",
    },
    autoRenew: { type: Boolean, default: false },
    razorpayCustomerId: { type: String, default: null },
    currentSubscriptionId: { type: String, default: null },
    scheduledDowngradePlan: { type: String, default: null },
    lastPaymentId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  dailyUsage: {
    dateKey: { type: String, default: "" },
    count: { type: Number, default: 0 },
  },
  preferredLanguage: { type: String, default: "en" },
  location: { type: String, default: "" },
  city: { type: String, default: "" },
  state: { type: String, default: "" },
  country: { type: String, default: "" },
  themePreference: { type: String, enum: ["light", "dark", "auto"], default: "auto" },
  lastLoginTheme: { type: String, enum: ["light", "dark"] },
});

export default mongoose.model("user", userschema);

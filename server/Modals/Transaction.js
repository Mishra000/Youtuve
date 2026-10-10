import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ["FREE", "BRONZE", "SILVER", "GOLD"],
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY"],
      default: "MONTHLY",
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    paymentStatus: {
      type: String,
      enum: ["CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED"],
      default: "CREATED",
      index: true,
    },
    paymentMethod: {
      type: String,
      default: "razorpay_test",
    },
    subscriptionStartDate: {
      type: Date,
      default: null,
    },
    subscriptionExpiryDate: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: "",
    },
    customerEmail: {
      type: String,
      default: "",
    },
    customerName: {
      type: String,
      default: "",
    },
    invoiceDetails: {
      invoiceDate: { type: Date, default: Date.now },
      planName: { type: String, default: "" },
      billingCycle: { type: String, default: "" },
      baseAmount: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Helper function to generate standardized invoice numbers
export function generateInvoiceNumber() {
  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7).replace("-", "");
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `INV-${yearMonth}-${randomSuffix}`;
}

export default mongoose.model("Transaction", transactionSchema);

import mongoose from "mongoose";

const downloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
      index: true,
    },
    videoTitle: {
      type: String,
      default: "",
    },
    downloadTimestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "authorized",
        "downloading",
        "completed",
        "failed",
        "interrupted",
        "denied",
      ],
      default: "pending",
      index: true,
    },
    fileSize: {
      type: String,
      default: "0",
    },
    subscriptionPlan: {
      type: String,
      enum: ["FREE", "BRONZE", "SILVER", "GOLD"],
      default: "FREE",
    },
    ipAddress: {
      type: String,
      default: "unknown",
    },
    deviceInformation: {
      type: String,
      default: "Desktop",
    },
    browser: {
      type: String,
      default: "Unknown Browser",
    },
    userAgent: {
      type: String,
      default: "",
    },
    failureReason: {
      type: String,
      default: "",
    },
    isDuplicateReused: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast duplicate check queries:
downloadSchema.index({
  userId: 1,
  videoId: 1,
  downloadTimestamp: -1,
  status: 1,
});

export default mongoose.model("Download", downloadSchema);

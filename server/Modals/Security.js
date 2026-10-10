/**
 * Security.js — Models for Login History, Trusted Devices, OTPs, and Security Events
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from "mongoose";

// ─── 1. Login Attempt Model ──────────────────────────────────────────────────
const loginAttemptSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    ipAddress:       { type: String, default: "Unknown" },
    browserName:     { type: String, default: "Unknown" },
    browserVersion:  { type: String, default: "Unknown" },
    operatingSystem: { type: String, default: "Unknown" },
    deviceType:      { type: String, default: "Unknown" },
    deviceModel:     { type: String, default: "Unknown" },
    city:            { type: String, default: "Unknown" },
    state:           { type: String, default: "Unknown" },
    country:         { type: String, default: "Unknown" },
    approxLatitude:  { type: Number, default: null },
    approxLongitude: { type: Number, default: null },
    loginAt:         { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ["SUCCESS", "OTP_REQUIRED", "OTP_VERIFIED", "OTP_FAILED", "FAILED", "BLOCKED"],
      default: "SUCCESS",
      index: true,
    },
    otpVerifiedAt:   { type: Date, default: null },
    failureReason:   { type: String, default: null },
  },
  { timestamps: true }
);

loginAttemptSchema.index({ userId: 1, loginAt: -1 });
loginAttemptSchema.index({ userId: 1, status: 1 });
export const LoginAttempt = mongoose.model("LoginAttempt", loginAttemptSchema);

// ─── 2. Trusted Device Model ─────────────────────────────────────────────────
const trustedDeviceSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    deviceIdentifier: {
      type: String,
      required: true,
      index: true,
    },
    deviceName:      { type: String, default: "Web Browser" },
    browserName:     { type: String, default: "Unknown" },
    browserVersion:  { type: String, default: "Unknown" },
    operatingSystem: { type: String, default: "Unknown" },
    deviceType:      { type: String, default: "Unknown" },
    deviceModel:     { type: String, default: "Unknown" },
    ipAddress:       { type: String, default: "Unknown" },
    city:            { type: String, default: "Unknown" },
    state:           { type: String, default: "Unknown" },
    country:         { type: String, default: "Unknown" },
    trustedAt:       { type: Date, default: Date.now },
    expiresAt:       { type: Date, required: true, index: true },
    lastUsedAt:      { type: Date, default: Date.now },
    isRevoked:       { type: Boolean, default: false, index: true },
    revokedAt:       { type: Date, default: null },
  },
  { timestamps: true }
);

trustedDeviceSchema.index({ userId: 1, deviceIdentifier: 1 });
trustedDeviceSchema.index({ userId: 1, expiresAt: 1, isRevoked: 1 });
export const TrustedDevice = mongoose.model("TrustedDevice", trustedDeviceSchema);

// ─── 3. Login OTP Model ───────────────────────────────────────────────────────
const loginOtpSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    email:          { type: String, required: true },
    otpHash:        { type: String, required: true }, // SHA-256 hash (never plain text)
    tempToken:      { type: String, required: true, index: true }, // Challenge token
    loginAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: "LoginAttempt" },
    attempts:       { type: Number, default: 0 },
    maxAttempts:    { type: Number, default: 5 },
    expiresAt:      { type: Date, required: true, index: { expires: "1h" } }, // Auto-clean after 1 hour
    isUsed:         { type: Boolean, default: false },
    deviceData:     { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

loginOtpSchema.index({ tempToken: 1, isUsed: 1 });
export const LoginOtp = mongoose.model("LoginOtp", loginOtpSchema);

// ─── 4. Security Event Model ──────────────────────────────────────────────────
const securityEventSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "SUCCESSFUL_LOGIN",
        "FAILED_LOGIN",
        "OTP_REQUIRED",
        "OTP_SENT",
        "OTP_SUCCESS",
        "OTP_FAILURE",
        "TRUSTED_DEVICE_CREATED",
        "TRUSTED_DEVICE_REVOKED",
        "FIRST_DEVICE_TRUSTED",
        "THEME_UPDATED",
      ],
      required: true,
    },
    description: { type: String, default: "" },
    ipAddress:   { type: String, default: "Unknown" },
    browser:     { type: String, default: "Unknown" },
    os:          { type: String, default: "Unknown" },
    location:    { type: String, default: "Unknown" },
    timestamp:   { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

securityEventSchema.index({ userId: 1, timestamp: -1 });
export const SecurityEvent = mongoose.model("SecurityEvent", securityEventSchema);

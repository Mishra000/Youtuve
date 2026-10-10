import express from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  verifyLoginOtp,
  resendLoginOtp,
  getLoginHistory,
  getTrustedDevices,
  revokeTrustedDevice,
  getSecurityEvents,
  updateprofile,
} from "../controllers/auth.js";

const routes = express.Router();

// Rate limiters for security endpoints
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // max 15 login attempts per minute per IP
  message: { message: "Too many login attempts. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 verification attempts per minute
  message: { message: "Too many verification attempts. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication endpoints
routes.post("/login", loginLimiter, login);
routes.post("/verify-login-otp", otpVerifyLimiter, verifyLoginOtp);
routes.post("/resend-login-otp", otpVerifyLimiter, resendLoginOtp);

// Security & Trusted Device endpoints
routes.get("/security/login-history", getLoginHistory);
routes.get("/security/trusted-devices", getTrustedDevices);
routes.post("/security/trusted-device/revoke", revokeTrustedDevice);
routes.get("/security/events", getSecurityEvents);

// Profile update (includes themePreference)
routes.patch("/update/:id", updateprofile);

export default routes;

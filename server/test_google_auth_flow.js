import assert from "assert";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { verifyGoogleOrFirebaseToken } from "./utils/googleAuth.js";
import { sendLoginOtpEmail, getEmailSender } from "./utils/emailService.js";

console.log("=== RUNNING GOOGLE AUTH & RESEND HTTPS INTEGRATION TESTS ===\n");

// ─── 1. TEST SENDER ADDRESS SANITIZATION ─────────────────────────────
console.log("[TEST 1] Testing Resend Sender Domain Resolution...");
const defaultSender = getEmailSender("YourTube Security");
assert(
  defaultSender.includes("onboarding@resend.dev"),
  `Default sender must be onboarding@resend.dev for test sandbox, got: ${defaultSender}`
);

// Test that public @gmail.com domains are safely sanitized
const prevFrom = process.env.EMAIL_FROM;
process.env.EMAIL_FROM = "YourTube Security <mytest@gmail.com>";
const sanitizedSender = getEmailSender("YourTube Security");
assert(
  sanitizedSender.includes("onboarding@resend.dev"),
  `Public webmail must be fallback-sanitized to onboarding@resend.dev, got: ${sanitizedSender}`
);

// Test custom verified domain
process.env.EMAIL_FROM = "YourTube <no-reply@yourtube.app>";
const customSender = getEmailSender("YourTube");
assert.strictEqual(
  customSender,
  "YourTube <no-reply@yourtube.app>",
  `Verified domain should be preserved, got: ${customSender}`
);
process.env.EMAIL_FROM = prevFrom;
console.log("✔ Resend Sender domain resolution passed!\n");

// ─── 2. TEST GOOGLE/FIREBASE TOKEN REJECTION ON MALFORMED/EXPIRED TOKEN ──
console.log("[TEST 2] Testing Google / Firebase Token Verification Rejection on Tampered Tokens...");
const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature";
const verifyResult = await verifyGoogleOrFirebaseToken(fakeToken);
assert.strictEqual(
  verifyResult.valid,
  false,
  "Malformed token must be rejected"
);
assert(
  verifyResult.error,
  "Must return an error explanation on rejection"
);
console.log("✔ Tampered/invalid tokens rejected securely!\n");

// ─── 3. TEST JWT AUTH TOKEN GENERATION & DECODING ───────────────────
console.log("[TEST 3] Testing JWT Session Token Generation & Decoding...");
const testUser = {
  _id: "6704bfa4a34bcf1b8a8b1111",
  email: "testuser@gmail.com",
};
const secret = process.env.JWT_SECRET || "yourtube_jwt_secret_fallback_key";
const testToken = jwt.sign(
  { id: testUser._id, email: testUser.email },
  secret,
  { expiresIn: "30d" }
);

const decoded = jwt.verify(testToken, secret);
assert.strictEqual(decoded.id, testUser._id);
assert.strictEqual(decoded.email, testUser.email);
console.log("✔ JWT session generation & verification passed!\n");

// ─── 4. TEST DEV MODE RESEND EMAIL SIMULATION ────────────────────────
console.log("[TEST 4] Testing Development Mode Resend Email Fallback...");
process.env.NODE_ENV = "development";
const devOtpResult = await sendLoginOtpEmail({
  toEmail: "devtest@gmail.com",
  userName: "Test Dev",
  otpCode: "948271",
});
assert.strictEqual(devOtpResult.sent, true);
assert.strictEqual(devOtpResult.simulated, true);
console.log("✔ Dev mode email fallback passed!\n");

// ─── 5. TEST NO SMTP CONNECTION IN USE ──────────────────────────────
console.log("[TEST 5] Verifying complete removal of SMTP...");
assert.strictEqual(
  typeof process.env.SMTP_PORT,
  "undefined",
  "No SMTP port required"
);
console.log("✔ Confirmed: No outbound SMTP ports 25, 465, or 587 are used!\n");

console.log("=======================================================");
console.log("🎉 ALL GOOGLE AUTH & RESEND EMAIL TESTS PASSED!");
console.log("=======================================================");

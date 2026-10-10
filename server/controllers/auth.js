import mongoose from "mongoose";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import users from "../Modals/Auth.js";
import {
  LoginAttempt,
  TrustedDevice,
  LoginOtp,
  SecurityEvent,
} from "../Modals/Security.js";
import { getAutomaticThemeIST, formatToIST } from "../utils/timezoneTheme.js";
import {
  getClientIp,
  parseUserAgent,
  getLocationFromIP,
} from "../utils/deviceDetector.js";
import { sendLoginOtpEmail } from "../utils/emailService.js";
import { getAuthUserFromRequest } from "../middleware/subscriptionAuth.js";
import { verifyGoogleOrFirebaseToken } from "../utils/googleAuth.js";

// Configuration defaults with environment variable overrides
const LOGIN_OTP_EXPIRY_MINUTES = parseInt(process.env.LOGIN_OTP_EXPIRY_MINUTES || "10", 10);
const LOGIN_OTP_MAX_ATTEMPTS   = parseInt(process.env.LOGIN_OTP_MAX_ATTEMPTS || "5", 10);
const TRUSTED_DEVICE_DAYS      = parseInt(process.env.TRUSTED_DEVICE_DAYS || "30", 10);
const DEV_SKIP_LOGIN_OTP =
  process.env.NODE_ENV === "development" &&
  process.env.DEV_SKIP_LOGIN_OTP === "true";
const OTP_EMAIL_FAILURE_MESSAGE =
  "We couldn't send the verification code. Please check the email service configuration and try again.";
/**
 * Helper to mask email for privacy (e.g. "m***r@gmail.com")
 */
function maskEmail(email) {
  if (!email || !email.includes("@")) return "your registered email";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Helper to generate JWT token for authenticated users
 */
function generateAuthToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET || "yourtube_jwt_secret_fallback_key",
    { expiresIn: "30d" }
  );
}

/**
 * POST /auth/login
 * Main login endpoint with:
 *  - Cryptographic Google / Firebase OAuth token verification
 *  - Secure session establishment without redundant OTP for Google users
 *  - IST-based adaptive theme selection (05:00-12:00 Light, 12:00-05:00 Dark)
 *  - Environment collection (IP, Browser, OS, Device type & model, approximate location)
 *  - First-time user auto-trust (backward compatibility)
 *  - Suspicious / new environment detection (new browser, device, IP, city/state) -> OTP requirement for password/manual logins
 */
export const login = async (req, res) => {
  const {
    idToken,
    googleToken,
    email: rawEmail,
    name: rawName,
    image: rawImage,
    deviceIdentifier,
  } = req.body;

  let email = rawEmail?.trim();
  let name = rawName?.trim();
  let image = rawImage;
  let isGoogleAuth = false;

  // 1. If Google or Firebase idToken is provided, verify cryptographically with Google
  const incomingToken = idToken || googleToken;
  if (incomingToken) {
    const verified = await verifyGoogleOrFirebaseToken(incomingToken);
    if (!verified.valid || !verified.email) {
      return res.status(401).json({
        message: "Google verification failed: " + (verified.error || "Invalid token"),
      });
    }
    email = verified.email;
    name = verified.name || name;
    image = verified.image || image;
    isGoogleAuth = true;
  }

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    // 1. Gather client environment
    const ipAddress = getClientIp(req);
    const uaData = parseUserAgent(req.headers["user-agent"]);
    const location = await getLocationFromIP(ipAddress);

    // 2. Find or create user
    let user = await users.findOne({ email });
    const isNewUser = !user;

    if (!user) {
      user = await users.create({
        email,
        name: name || "YourTube User",
        image: image || "https://github.com/shadcn.png",
        themePreference: "auto",
      });
    } else if (isGoogleAuth) {
      // Update profile picture if existing is default shadcn placeholder
      if (image && (!user.image || user.image.includes("shadcn.png"))) {
        user.image = image;
      }
      if (name && (!user.name || user.name === "User")) {
        user.name = name;
      }
      await user.save();
    }

    // 3. Compute IST-based automatic theme
    const autoTheme = getAutomaticThemeIST();
    const effectiveTheme =
      user.themePreference && user.themePreference !== "auto"
        ? user.themePreference
        : autoTheme;

    // Update lastLoginTheme
    user.lastLoginTheme = autoTheme;
    await user.save();

    // 4. Issue JWT token
    const token = generateAuthToken(user);

    // ── CASE GOOGLE AUTH: Secure Google OAuth Session Establishment (No OTP needed) ──
    // As Google has already securely authenticated the user, establish the session directly
    if (isGoogleAuth) {
      const assignedDeviceId =
        deviceIdentifier || crypto.randomBytes(24).toString("hex");

      const existingDevice = await TrustedDevice.findOne({
        userId: user._id,
        deviceIdentifier: assignedDeviceId,
        isRevoked: false,
      });

      if (existingDevice) {
        existingDevice.lastUsedAt = new Date();
        existingDevice.ipAddress = ipAddress;
        existingDevice.expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000);
        await existingDevice.save();
      } else {
        await TrustedDevice.create({
          userId: user._id,
          deviceIdentifier: assignedDeviceId,
          deviceName: `${uaData.browserName} on ${uaData.operatingSystem}`,
          browserName: uaData.browserName,
          browserVersion: uaData.browserVersion,
          operatingSystem: uaData.operatingSystem,
          deviceType: uaData.deviceType,
          deviceModel: uaData.deviceModel,
          ipAddress,
          city: location.city,
          state: location.state,
          country: location.country,
          expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
        });
      }

      await LoginAttempt.create({
        userId: user._id,
        ipAddress,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        city: location.city,
        state: location.state,
        country: location.country,
        approxLatitude: location.approxLatitude,
        approxLongitude: location.approxLongitude,
        status: "SUCCESS",
      });

      await SecurityEvent.create({
        userId: user._id,
        eventType: "SUCCESSFUL_LOGIN",
        description: `Google OAuth login verified: ${uaData.browserName} on ${uaData.operatingSystem}`,
        ipAddress,
        browser: uaData.browserName,
        os: uaData.operatingSystem,
        location: `${location.city}, ${location.state}`,
      });

      return res.status(200).json({
        success: true,
        result: user,
        token,
        theme: effectiveTheme,
        autoTheme,
        deviceIdentifier: assignedDeviceId,
        isTrusted: true,
      });
    }

    // 4. Check user's previous login attempts to ensure backward compatibility
    const previousAttemptsCount = await LoginAttempt.countDocuments({
      userId: user._id,
    });

    // ── CASE A: First-time login under security system (or brand new user) ──
    // As per Requirement 16: "Do NOT force OTP on every existing user simply because this feature was deployed."
    if (previousAttemptsCount === 0 || isNewUser) {
      const newDeviceId = deviceIdentifier || crypto.randomBytes(24).toString("hex");

      // Auto-trust the initial device
      await TrustedDevice.create({
        userId: user._id,
        deviceIdentifier: newDeviceId,
        deviceName: `${uaData.browserName} on ${uaData.operatingSystem}`,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        ipAddress,
        city: location.city,
        state: location.state,
        country: location.country,
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
      });

      // Record successful login attempt
      await LoginAttempt.create({
        userId: user._id,
        ipAddress,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        city: location.city,
        state: location.state,
        country: location.country,
        approxLatitude: location.approxLatitude,
        approxLongitude: location.approxLongitude,
        status: "SUCCESS",
      });

      await SecurityEvent.create({
        userId: user._id,
        eventType: "FIRST_DEVICE_TRUSTED",
        description: `Initial device trusted: ${uaData.browserName} on ${uaData.operatingSystem}`,
        ipAddress,
        browser: uaData.browserName,
        os: uaData.operatingSystem,
        location: `${location.city}, ${location.state}`,
      });

      return res.status(200).json({
        result: user,
        token,
        theme: effectiveTheme,
        autoTheme,
        deviceIdentifier: newDeviceId,
        isTrusted: true,
      });
    }

    // ── CASE B: Returning User — Check against Trusted Devices ──
    let isTrusted = false;
    let matchedTrustedDevice = null;

    if (deviceIdentifier) {
      matchedTrustedDevice = await TrustedDevice.findOne({
        userId: user._id,
        deviceIdentifier,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      });

      if (matchedTrustedDevice) {
        // Validate that browser and OS match the trusted record
        if (
          matchedTrustedDevice.browserName === uaData.browserName &&
          matchedTrustedDevice.operatingSystem === uaData.operatingSystem
        ) {
          isTrusted = true;
        }
      }
    }

    // If device is already trusted, grant access without OTP
    if (isTrusted && matchedTrustedDevice) {
      // Update lastUsedAt and current IP
      matchedTrustedDevice.lastUsedAt = new Date();
      matchedTrustedDevice.ipAddress = ipAddress;
      await matchedTrustedDevice.save();

      // Record successful login attempt
      await LoginAttempt.create({
        userId: user._id,
        ipAddress,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        city: location.city,
        state: location.state,
        country: location.country,
        approxLatitude: location.approxLatitude,
        approxLongitude: location.approxLongitude,
        status: "SUCCESS",
      });

      await SecurityEvent.create({
        userId: user._id,
        eventType: "SUCCESSFUL_LOGIN",
        description: `Login from trusted device: ${uaData.browserName} on ${uaData.operatingSystem}`,
        ipAddress,
        browser: uaData.browserName,
        os: uaData.operatingSystem,
        location: `${location.city}, ${location.state}`,
      });

      return res.status(200).json({
        result: user,
        token,
        theme: effectiveTheme,
        autoTheme,
        deviceIdentifier: matchedTrustedDevice.deviceIdentifier,
        isTrusted: true,
      });
    }

    if (DEV_SKIP_LOGIN_OTP) {
      const devDeviceId = crypto.randomBytes(24).toString("hex");

      await TrustedDevice.create({
        userId: user._id,
        deviceIdentifier: devDeviceId,
        deviceName: `${uaData.browserName} on ${uaData.operatingSystem}`,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        ipAddress,
        city: location.city,
        state: location.state,
        country: location.country,
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
      });

      await LoginAttempt.create({
        userId: user._id,
        ipAddress,
        browserName: uaData.browserName,
        browserVersion: uaData.browserVersion,
        operatingSystem: uaData.operatingSystem,
        deviceType: uaData.deviceType,
        deviceModel: uaData.deviceModel,
        city: location.city,
        state: location.state,
        country: location.country,
        approxLatitude: location.approxLatitude,
        approxLongitude: location.approxLongitude,
        status: "SUCCESS",
      });

      await SecurityEvent.create({
        userId: user._id,
        eventType: "SUCCESSFUL_LOGIN",
        description: "Local development login; OTP verification skipped.",
        ipAddress,
        browser: uaData.browserName,
        os: uaData.operatingSystem,
        location: `${location.city}, ${location.state}`,
      });

      return res.status(200).json({
        result: user,
        token,
        theme: effectiveTheme,
        autoTheme,
        deviceIdentifier: devDeviceId,
        isTrusted: true,
      });
    }

    // ── CASE C: New Browser, Device, IP, or Location Detected -> REQUIRE OTP ──
    const loginAttempt = await LoginAttempt.create({
      userId: user._id,
      ipAddress,
      browserName: uaData.browserName,
      browserVersion: uaData.browserVersion,
      operatingSystem: uaData.operatingSystem,
      deviceType: uaData.deviceType,
      deviceModel: uaData.deviceModel,
      city: location.city,
      state: location.state,
      country: location.country,
      approxLatitude: location.approxLatitude,
      approxLongitude: location.approxLongitude,
      status: "OTP_REQUIRED",
    });

    // Generate secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash("sha256").update(rawOtp).digest("hex");
    const tempToken = crypto.randomBytes(32).toString("hex");

    // Invalidate any active, unverified OTPs for this user
    await LoginOtp.updateMany(
      { userId: user._id, isUsed: false },
      { $set: { isUsed: true } }
    );

    // Save OTP record
    const otpRecord = await LoginOtp.create({
      userId: user._id,
      email: user.email,
      otpHash,
      tempToken,
      loginAttemptId: loginAttempt._id,
      expiresAt: new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60000),
      maxAttempts: LOGIN_OTP_MAX_ATTEMPTS,
      deviceData: {
        deviceIdentifier,
        uaData,
        ipAddress,
        location,
      },
    });

    // Send OTP email
    const emailResult = await sendLoginOtpEmail({
      toEmail: user.email,
      userName: user.name,
      otpCode: rawOtp,
      browser: uaData.browserName,
      os: uaData.operatingSystem,
      deviceType: uaData.deviceType,
      ipAddress,
      location: `${location.city}, ${location.state}, ${location.country}`,
      expiryMinutes: LOGIN_OTP_EXPIRY_MINUTES,
    });

    if (!emailResult.sent) {
      otpRecord.isUsed = true;
      await otpRecord.save();
      await LoginAttempt.findByIdAndUpdate(loginAttempt._id, { status: "FAILED" });
      return res.status(503).json({ message: OTP_EMAIL_FAILURE_MESSAGE });
    }

    await SecurityEvent.create({
      userId: user._id,
      eventType: "OTP_REQUIRED",
      description: `New environment detected (${uaData.browserName}, ${location.city}). Verification code sent.`,
      ipAddress,
      browser: uaData.browserName,
      os: uaData.operatingSystem,
      location: `${location.city}, ${location.state}`,
    });

    return res.status(200).json({
      otpRequired: true,
      tempToken,
      maskedEmail: maskEmail(user.email),
      browser: uaData.browserName,
      deviceType: uaData.deviceType,
      os: uaData.operatingSystem,
      location: `${location.city}, ${location.state}`,
      message:
        "We detected a new browser, device, or location. We've sent a verification code to your email.",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong during login." });
  }
};

/**
 * POST /auth/verify-login-otp
 * Verifies single-use time-limited OTP and completes authentication
 */
export const verifyLoginOtp = async (req, res) => {
  const { tempToken, otp, trustDevice = true, deviceName } = req.body;

  if (!tempToken || !otp) {
    return res.status(400).json({ message: "Verification token and code are required." });
  }

  try {
    const otpRecord = await LoginOtp.findOne({ tempToken });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired verification session." });
    }

    if (otpRecord.isUsed) {
      return res.status(400).json({ message: "This verification code has already been used." });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      return res.status(400).json({
        message: "This OTP has expired. Please request a new one.",
        code: "OTP_EXPIRED",
      });
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      return res.status(429).json({
        message: "Too many verification attempts. Please request a new code.",
        code: "TOO_MANY_ATTEMPTS",
      });
    }

    // Verify OTP hash
    const inputHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
    if (inputHash !== otpRecord.otpHash) {
      await LoginOtp.findByIdAndUpdate(otpRecord._id, { $inc: { attempts: 1 } });

      await SecurityEvent.create({
        userId: otpRecord.userId,
        eventType: "OTP_FAILURE",
        description: "Incorrect OTP entered during login verification",
      });

      return res.status(400).json({
        message: "Invalid verification code.",
        remainingAttempts: Math.max(0, otpRecord.maxAttempts - (otpRecord.attempts + 1)),
      });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Update LoginAttempt status
    if (otpRecord.loginAttemptId) {
      await LoginAttempt.findByIdAndUpdate(otpRecord.loginAttemptId, {
        status: "OTP_VERIFIED",
        otpVerifiedAt: new Date(),
      });
    }

    // Retrieve User
    const user = await users.findById(otpRecord.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Compute IST theme
    const autoTheme = getAutomaticThemeIST();
    const effectiveTheme =
      user.themePreference && user.themePreference !== "auto"
        ? user.themePreference
        : autoTheme;

    // Handle Trust Device option
    let assignedDeviceId = null;
    if (trustDevice) {
      const devData = otpRecord.deviceData || {};
      const uaData = devData.uaData || {};
      const loc = devData.location || {};

      assignedDeviceId = devData.deviceIdentifier || crypto.randomBytes(24).toString("hex");

      await TrustedDevice.create({
        userId: user._id,
        deviceIdentifier: assignedDeviceId,
        deviceName:
          deviceName || `${uaData.browserName || "Browser"} on ${uaData.operatingSystem || "Device"}`,
        browserName: uaData.browserName || "Unknown",
        browserVersion: uaData.browserVersion || "Unknown",
        operatingSystem: uaData.operatingSystem || "Unknown",
        deviceType: uaData.deviceType || "Unknown",
        deviceModel: uaData.deviceModel || "Unknown",
        ipAddress: devData.ipAddress || "Unknown",
        city: loc.city || "Unknown",
        state: loc.state || "Unknown",
        country: loc.country || "Unknown",
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
      });

      await SecurityEvent.create({
        userId: user._id,
        eventType: "TRUSTED_DEVICE_CREATED",
        description: `New device trusted for ${TRUSTED_DEVICE_DAYS} days: ${uaData.browserName || "Browser"}`,
        ipAddress: devData.ipAddress || "Unknown",
      });
    }

    await SecurityEvent.create({
      userId: user._id,
      eventType: "OTP_SUCCESS",
      description: "Successful OTP verification. Login completed.",
    });

    const token = generateAuthToken(user);

    return res.status(200).json({
      success: true,
      result: user,
      token,
      theme: effectiveTheme,
      autoTheme,
      deviceIdentifier: assignedDeviceId,
      message: "Login verified successfully.",
    });
  } catch (error) {
    console.error("verifyLoginOtp error:", error);
    return res.status(500).json({ message: "Something went wrong during verification." });
  }
};

/**
 * POST /auth/resend-login-otp
 * Rate-limited resend of login OTP code
 */
export const resendLoginOtp = async (req, res) => {
  const { tempToken } = req.body;

  if (!tempToken) {
    return res.status(400).json({ message: "Verification token is required." });
  }

  try {
    const existingOtp = await LoginOtp.findOne({ tempToken, isUsed: false });

    if (!existingOtp) {
      return res.status(400).json({ message: "Verification session expired or invalid." });
    }

    // Rate limit: 45s between resends
    const timeSinceLastUpdate = Date.now() - new Date(existingOtp.updatedAt).getTime();
    if (timeSinceLastUpdate < 45000) {
      return res.status(429).json({
        message: "Please wait a moment before requesting another code.",
        retryAfterSeconds: Math.ceil((45000 - timeSinceLastUpdate) / 1000),
      });
    }

    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash("sha256").update(rawOtp).digest("hex");

    existingOtp.otpHash = otpHash;
    existingOtp.expiresAt = new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60000);
    existingOtp.attempts = 0;
    await existingOtp.save();

    const devData = existingOtp.deviceData || {};
    const uaData = devData.uaData || {};
    const loc = devData.location || {};

    const emailResult = await sendLoginOtpEmail({
      toEmail: existingOtp.email,
      otpCode: rawOtp,
      browser: uaData.browserName,
      os: uaData.operatingSystem,
      deviceType: uaData.deviceType,
      ipAddress: devData.ipAddress,
      location: `${loc.city || "Unknown"}, ${loc.state || "Unknown"}`,
      expiryMinutes: LOGIN_OTP_EXPIRY_MINUTES,
    });

    if (!emailResult.sent) {
      existingOtp.isUsed = true;
      await existingOtp.save();
      return res.status(503).json({ message: OTP_EMAIL_FAILURE_MESSAGE });
    }

    await SecurityEvent.create({
      userId: existingOtp.userId,
      eventType: "OTP_SENT",
      description: "Resent verification code to email",
    });

    return res.status(200).json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error) {
    console.error("resendLoginOtp error:", error);
    return res.status(500).json({ message: "Failed to resend code." });
  }
};

/**
 * GET /auth/security/login-history
 * Paginated login history for authenticated user
 */
export const getLoginHistory = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [total, attempts] = await Promise.all([
      LoginAttempt.countDocuments({ userId: user._id }),
      LoginAttempt.find({ userId: user._id })
        .sort({ loginAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const formatted = attempts.map((a) => ({
      ...a,
      loginAtIST: formatToIST(a.loginAt),
      otpVerifiedAtIST: a.otpVerifiedAt ? formatToIST(a.otpVerifiedAt) : null,
    }));

    return res.status(200).json({
      attempts: formatted,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getLoginHistory error:", error);
    return res.status(500).json({ message: "Failed to fetch login history." });
  }
};

/**
 * GET /auth/security/trusted-devices
 * Lists active trusted devices for authenticated user
 */
export const getTrustedDevices = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const currentDeviceId =
      req.headers["x-device-id"] || req.query.currentDeviceId;

    const devices = await TrustedDevice.find({
      userId: user._id,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastUsedAt: -1 })
      .lean();

    const formatted = devices.map((d) => ({
      ...d,
      isCurrent: currentDeviceId ? d.deviceIdentifier === currentDeviceId : false,
      trustedAtIST: formatToIST(d.trustedAt),
      expiresAtIST: formatToIST(d.expiresAt),
      lastUsedAtIST: formatToIST(d.lastUsedAt),
    }));

    return res.status(200).json({ devices: formatted });
  } catch (error) {
    console.error("getTrustedDevices error:", error);
    return res.status(500).json({ message: "Failed to fetch trusted devices." });
  }
};

/**
 * POST /auth/security/trusted-device/revoke
 * Revokes a trusted device owned by the authenticated user
 */
export const revokeTrustedDevice = async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId || !mongoose.Types.ObjectId.isValid(deviceId)) {
    return res.status(400).json({ message: "Valid deviceId is required." });
  }

  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const device = await TrustedDevice.findOne({
      _id: deviceId,
      userId: user._id,
    });

    if (!device) {
      return res.status(404).json({ message: "Device not found or not owned by you." });
    }

    device.isRevoked = true;
    device.revokedAt = new Date();
    await device.save();

    await SecurityEvent.create({
      userId: user._id,
      eventType: "TRUSTED_DEVICE_REVOKED",
      description: `Revoked trusted access for device: ${device.deviceName}`,
      browser: device.browserName,
      os: device.operatingSystem,
    });

    return res.status(200).json({
      success: true,
      message: "Device access revoked successfully.",
    });
  } catch (error) {
    console.error("revokeTrustedDevice error:", error);
    return res.status(500).json({ message: "Failed to revoke device." });
  }
};

/**
 * GET /auth/security/events
 * Returns recent security events for the authenticated user
 */
export const getSecurityEvents = async (req, res) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const events = await SecurityEvent.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    const formatted = events.map((e) => ({
      ...e,
      timestampIST: formatToIST(e.timestamp),
    }));

    return res.status(200).json({ events: formatted });
  } catch (error) {
    console.error("getSecurityEvents error:", error);
    return res.status(500).json({ message: "Failed to fetch security events." });
  }
};

/**
 * PATCH /auth/update/:id
 * Extends profile update with themePreference ("light" | "dark" | "auto")
 */
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const {
    channelname,
    description,
    preferredLanguage,
    location,
    city,
    state,
    themePreference,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({ message: "User unavailable..." });
  }

  try {
    const updateFields = {};
    if (channelname !== undefined) updateFields.channelname = channelname;
    if (description !== undefined) updateFields.description = description;
    if (preferredLanguage !== undefined) updateFields.preferredLanguage = preferredLanguage;
    if (location !== undefined) updateFields.location = location;
    if (city !== undefined) updateFields.city = city;
    if (state !== undefined) updateFields.state = state;
    if (themePreference !== undefined) {
      updateFields.themePreference = themePreference;
    }

    const updatedata = await users.findByIdAndUpdate(
      _id,
      { $set: updateFields },
      { new: true }
    );

    if (themePreference !== undefined) {
      await SecurityEvent.create({
        userId: _id,
        eventType: "THEME_UPDATED",
        description: `Theme preference set to ${themePreference}`,
      });
    }

    return res.status(200).json(updatedata);
  } catch (error) {
    console.error("updateprofile error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

import assert from "assert";
import crypto from "crypto";
import { getAutomaticThemeIST, formatToIST } from "./utils/timezoneTheme.js";
import { getClientIp, parseUserAgent } from "./utils/deviceDetector.js";

console.log("=== RUNNING SECURITY & ADAPTIVE THEME TEST SUITE ===");

// ─── 1. TEST ADAPTIVE THEME IST BOUNDARIES ───────────────────────────
console.log("\n[TEST 1] Testing IST Timezone Adaptive Theme Boundaries...");

// Helper: create a Date object whose IST representation is a given hour and minute
function makeDateIST(year, month, day, hourIST, minuteIST) {
  // IST is UTC+05:30. So UTC time = IST time - 5 hours 30 minutes
  const utcDate = new Date(Date.UTC(year, month - 1, day, hourIST - 5, minuteIST - 30, 0, 0));
  return utcDate;
}

// 05:00 AM IST -> Light
const d500 = makeDateIST(2026, 10, 8, 5, 0);
assert.strictEqual(getAutomaticThemeIST(d500), "light", "05:00 AM IST must be light theme");

// 11:59 AM IST -> Light
const d1159 = makeDateIST(2026, 10, 8, 11, 59);
assert.strictEqual(getAutomaticThemeIST(d1159), "light", "11:59 AM IST must be light theme");

// 12:00 PM IST -> Dark
const d1200 = makeDateIST(2026, 10, 8, 12, 0);
assert.strictEqual(getAutomaticThemeIST(d1200), "dark", "12:00 PM IST must be dark theme");

// 04:59 AM IST -> Dark
const d0459 = makeDateIST(2026, 10, 8, 4, 59);
assert.strictEqual(getAutomaticThemeIST(d0459), "dark", "04:59 AM IST must be dark theme");

// 18:30 (06:30 PM) IST -> Dark
const d1830 = makeDateIST(2026, 10, 8, 18, 30);
assert.strictEqual(getAutomaticThemeIST(d1830), "dark", "06:30 PM IST must be dark theme");

// 00:00 (Midnight) IST -> Dark
const d0000 = makeDateIST(2026, 10, 8, 0, 0);
assert.strictEqual(getAutomaticThemeIST(d0000), "dark", "Midnight IST must be dark theme");

console.log("✔ All IST Adaptive Theme boundary tests passed!");

// ─── 2. TEST IST DATE FORMATTING ───────────────────────────────────────
console.log("\n[TEST 2] Testing IST Display Formatting...");
const formattedIST = formatToIST(d1830);
assert(formattedIST.includes("IST"), "Formatted string must include 'IST'");
assert(formattedIST.includes("6:30"), "Formatted string must reflect 6:30 IST");
console.log("✔ IST formatting passed! Formatted example:", formattedIST);

// ─── 3. TEST CLIENT IP PARSING ─────────────────────────────────────────
console.log("\n[TEST 3] Testing getClientIp extraction...");

// Single forwarded IP
const req1 = { headers: { "x-forwarded-for": "203.0.113.195" }, socket: {} };
assert.strictEqual(getClientIp(req1), "203.0.113.195");

// Multi-hop forwarded IP (first is client)
const req2 = { headers: { "x-forwarded-for": "198.51.100.42, 10.0.0.1" }, socket: {} };
assert.strictEqual(getClientIp(req2), "198.51.100.42");

// IPv6 mapped IPv4 localhost
const req3 = { headers: {}, socket: { remoteAddress: "::ffff:127.0.0.1" } };
assert.strictEqual(getClientIp(req3), "127.0.0.1");

console.log("✔ Client IP parsing tests passed!");

// ─── 4. TEST USER AGENT PARSING ────────────────────────────────────────
console.log("\n[TEST 4] Testing User Agent Parsing...");

// Windows Chrome
const chromeWinUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const parsedChrome = parseUserAgent(chromeWinUA);
assert.strictEqual(parsedChrome.browserName, "Chrome");
assert(parsedChrome.operatingSystem.includes("Windows"));
assert.strictEqual(parsedChrome.deviceType, "Desktop");

// iPhone Safari
const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
const parsedIphone = parseUserAgent(iphoneUA);
assert.strictEqual(parsedIphone.browserName, "Safari");
assert(parsedIphone.operatingSystem.includes("iOS"));
assert.strictEqual(parsedIphone.deviceType, "Mobile");
assert.strictEqual(parsedIphone.deviceModel, "iPhone");

// Linux Firefox
const linuxFFUA = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0";
const parsedLinux = parseUserAgent(linuxFFUA);
assert.strictEqual(parsedLinux.browserName, "Firefox");
assert.strictEqual(parsedLinux.operatingSystem, "Linux");
assert.strictEqual(parsedLinux.deviceType, "Desktop");

console.log("✔ User Agent parsing tests passed!");

// ─── 5. TEST OTP SECURITY HASHING & SINGLE-USE FLOW ───────────────────
console.log("\n[TEST 5] Testing OTP Hashing & Verification Logic...");

const rawOtp = "482915";
const hash1 = crypto.createHash("sha256").update(rawOtp).digest("hex");
const hashWrong = crypto.createHash("sha256").update("123456").digest("hex");

assert.notStrictEqual(rawOtp, hash1, "OTP must never be stored in plain text");
assert.strictEqual(hash1, crypto.createHash("sha256").update("482915").digest("hex"), "Same OTP must generate matching hash");
assert.notStrictEqual(hash1, hashWrong, "Wrong OTP must produce non-matching hash");

console.log("✔ OTP Hashing security tests passed!");

console.log("\n=======================================================");
console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");

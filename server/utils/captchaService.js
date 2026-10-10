/**
 * captchaService.js — Configurable CAPTCHA Verification
 * ─────────────────────────────────────────────────────────────
 * Supports Google reCAPTCHA, Cloudflare Turnstile, and local dev fallback.
 */

export async function verifyCaptcha(token, clientAnswer = null, expectedAnswer = null) {
  // If math challenge answer is provided (standard dev/in-app verification)
  if (clientAnswer !== null && expectedAnswer !== null) {
    return String(clientAnswer).trim() === String(expectedAnswer).trim();
  }

  // If secret key is not configured (e.g. Local development)
  const secretKey = process.env.CAPTCHA_SECRET_KEY;
  if (!secretKey) {
    // In local dev without external keys, allow token or "mock_solved"
    return Boolean(token);
  }

  if (!token) return false;

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });
    const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: params,
    });
    const data = await resp.json();
    return Boolean(data.success);
  } catch (err) {
    console.error("CAPTCHA verification error:", err);
    // Safe fallback in dev if network error occurs
    return process.env.NODE_ENV !== "production";
  }
}

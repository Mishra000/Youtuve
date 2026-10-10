/**
 * Utility to extract client audit info (IP, Browser, OS/Device) from Express request
 * without storing tokens, secrets, or cookies.
 */

export function extractClientAudit(req) {
  const userAgent = req.headers["user-agent"] || "";

  // IP Resolution (supports proxies/load-balancers like Render/Vercel)
  const forwarded = req.headers["x-forwarded-for"];
  let ipAddress = "127.0.0.1";
  if (forwarded) {
    ipAddress = String(forwarded).split(",")[0].trim();
  } else if (req.socket && req.socket.remoteAddress) {
    ipAddress = req.socket.remoteAddress;
  } else if (req.ip) {
    ipAddress = req.ip;
  }

  // Normalize IPv6 localhost
  if (ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1") {
    ipAddress = "127.0.0.1";
  }

  // Browser detection
  let browser = "Other";
  if (/Edg\//i.test(userAgent)) {
    browser = "Microsoft Edge";
  } else if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) {
    browser = "Opera";
  } else if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
    browser = "Safari";
  } else if (/Firefox\//i.test(userAgent)) {
    browser = "Firefox";
  } else if (/curl\//i.test(userAgent)) {
    browser = "cURL";
  } else if (/Postman/i.test(userAgent)) {
    browser = "Postman";
  }

  // Device / OS detection
  let deviceInformation = "Desktop";
  if (/Android/i.test(userAgent)) {
    deviceInformation = "Android Mobile";
  } else if (/iPhone/i.test(userAgent)) {
    deviceInformation = "iOS iPhone";
  } else if (/iPad/i.test(userAgent)) {
    deviceInformation = "iOS iPad";
  } else if (/Windows NT/i.test(userAgent)) {
    deviceInformation = "Windows PC";
  } else if (/Macintosh/i.test(userAgent)) {
    deviceInformation = "macOS";
  } else if (/Linux/i.test(userAgent)) {
    deviceInformation = "Linux PC";
  }

  return {
    ipAddress,
    userAgent,
    browser,
    deviceInformation,
  };
}

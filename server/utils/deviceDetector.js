/**
 * deviceDetector.js — Client Environment, Device, Browser & Geolocation Extractor
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures:
 *  - IP address (handles proxies, x-forwarded-for)
 *  - Browser name & version
 *  - Operating System
 *  - Device Type (Desktop, Mobile, Tablet, Unknown)
 *  - Device Model (where reliably available, else "Unknown")
 *  - Approximate Location (City, State, Country, Lat, Lon) via configurable IP Geolocation
 */

/**
 * Extracts public client IP address from express request
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  let ip =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.headers["cf-connecting-ip"] ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1";

  if (typeof ip === "string" && ip.includes(",")) {
    // x-forwarded-for can be a comma-separated list of IPs: client, proxy1, proxy2
    ip = ip.split(",")[0].trim();
  }

  // Normalize IPv6 localhost
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    ip = "127.0.0.1";
  }

  // Strip IPv6 prefix if mapped IPv4
  if (typeof ip === "string" && ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  return ip || "127.0.0.1";
}

/**
 * Parses user agent string to identify browser, version, OS, and device type
 * @param {string} [uaString=""]
 * @returns {{ browserName: string, browserVersion: string, operatingSystem: string, deviceType: "Desktop"|"Mobile"|"Tablet"|"Unknown", deviceModel: string }}
 */
export function parseUserAgent(uaString = "") {
  if (!uaString || typeof uaString !== "string") {
    return {
      browserName: "Unknown",
      browserVersion: "Unknown",
      operatingSystem: "Unknown",
      deviceType: "Unknown",
      deviceModel: "Unknown",
    };
  }

  const ua = uaString;

  // 1. Device Type
  let deviceType = "Desktop";
  let deviceModel = "Unknown";

  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook)/i.test(ua);
  const isMobile = /(mobi|ipod|phone|blackberry|opera mini|iemobile)/i.test(ua);

  if (isTablet) {
    deviceType = "Tablet";
  } else if (isMobile) {
    deviceType = "Mobile";
  } else {
    deviceType = "Desktop";
  }

  // Specific device models when available
  if (/iPhone/i.test(ua)) deviceModel = "iPhone";
  else if (/iPad/i.test(ua)) deviceModel = "iPad";
  else if (/Pixel\s*([0-9a-zA-Z]+)/i.test(ua)) {
    const match = ua.match(/Pixel\s*([0-9a-zA-Z]+)/i);
    deviceModel = match ? `Google Pixel ${match[1]}` : "Google Pixel";
  } else if (/SM-[A-Z0-9]+/i.test(ua)) {
    const match = ua.match(/(SM-[A-Z0-9]+)/i);
    deviceModel = match ? `Samsung ${match[1]}` : "Samsung Galaxy";
  }

  // 2. Operating System
  let operatingSystem = "Unknown";
  if (/Windows NT 10\.0/i.test(ua)) operatingSystem = "Windows 10/11";
  else if (/Windows NT 6\.3/i.test(ua)) operatingSystem = "Windows 8.1";
  else if (/Windows NT 6\.1/i.test(ua)) operatingSystem = "Windows 7";
  else if (/Windows/i.test(ua)) operatingSystem = "Windows";
  else if (/Android\s*([0-9.]+)/i.test(ua)) {
    const match = ua.match(/Android\s*([0-9.]+)/i);
    operatingSystem = match ? `Android ${match[1]}` : "Android";
  } else if (/iPhone OS\s*([0-9_]+)/i.test(ua)) {
    const match = ua.match(/iPhone OS\s*([0-9_]+)/i);
    operatingSystem = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  } else if (/Mac OS X\s*([0-9_.]+)/i.test(ua)) {
    const match = ua.match(/Mac OS X\s*([0-9_.]+)/i);
    operatingSystem = match ? `macOS ${match[1].replace(/_/g, ".")}` : "macOS";
  } else if (/CrOS/i.test(ua)) operatingSystem = "Chrome OS";
  else if (/Linux/i.test(ua)) operatingSystem = "Linux";

  // 3. Browser & Version
  let browserName = "Unknown";
  let browserVersion = "Unknown";

  if (/Edg\/([0-9.]+)/i.test(ua)) {
    browserName = "Edge";
    browserVersion = ua.match(/Edg\/([0-9.]+)/i)?.[1] || "Unknown";
  } else if (/OPR\/([0-9.]+)/i.test(ua) || /Opera/i.test(ua)) {
    browserName = "Opera";
    browserVersion = ua.match(/OPR\/([0-9.]+)/i)?.[1] || "Unknown";
  } else if (/SamsungBrowser\/([0-9.]+)/i.test(ua)) {
    browserName = "Samsung Internet";
    browserVersion = ua.match(/SamsungBrowser\/([0-9.]+)/i)?.[1] || "Unknown";
  } else if (/Chrome\/([0-9.]+)/i.test(ua)) {
    browserName = "Chrome";
    browserVersion = ua.match(/Chrome\/([0-9.]+)/i)?.[1] || "Unknown";
  } else if (/Firefox\/([0-9.]+)/i.test(ua)) {
    browserName = "Firefox";
    browserVersion = ua.match(/Firefox\/([0-9.]+)/i)?.[1] || "Unknown";
  } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
    browserName = "Safari";
    browserVersion = ua.match(/Version\/([0-9.]+)/i)?.[1] || "Unknown";
  }

  // Major version formatting if available (e.g. "124.0.6367.78" -> "124")
  const majorVersion = browserVersion.split(".")[0];

  return {
    browserName,
    browserVersion: majorVersion !== "Unknown" ? majorVersion : browserVersion,
    operatingSystem,
    deviceType,
    deviceModel,
  };
}

/**
 * Helper to check if an IP address is private/local
 */
function isPrivateIp(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "localhost") return true;
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip === "0.0.0.0"
  );
}

/**
 * Resolves approximate geographical location from public IP.
 * Configurable via GEOLOCATION_API_URL / GEOLOCATION_API_KEY.
 * Falls back to public ip-api or "Unknown" without crashing.
 * @param {string} ipAddress
 * @returns {Promise<{ city: string, state: string, country: string, approxLatitude?: number, approxLongitude?: number }>}
 */
export async function getLocationFromIP(ipAddress) {
  const fallback = {
    city: "Unknown",
    state: "Unknown",
    country: "Unknown",
    approxLatitude: null,
    approxLongitude: null,
  };

  if (!ipAddress || isPrivateIp(ipAddress)) {
    return {
      city: "Localhost",
      state: "Local Network",
      country: "Local",
      approxLatitude: null,
      approxLongitude: null,
    };
  }

  // 1. Configured custom Geolocation Provider
  if (process.env.GEOLOCATION_API_URL) {
    try {
      const url = `${process.env.GEOLOCATION_API_URL.replace(/\/$/, "")}/${ipAddress}`;
      const headers = {};
      if (process.env.GEOLOCATION_API_KEY) {
        headers["Authorization"] = `Bearer ${process.env.GEOLOCATION_API_KEY}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const resp = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        return {
          city: data.city || data.cityName || "Unknown",
          state: data.region || data.state || data.regionName || "Unknown",
          country: data.country || data.countryName || "Unknown",
          approxLatitude: data.lat || data.latitude || null,
          approxLongitude: data.lon || data.longitude || null,
        };
      }
    } catch (e) {
      console.warn("GEOLOCATION_API_URL lookup failed:", e.message);
    }
  }

  // 2. Free public IP-API fallback (with 2-second timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,country,regionName,city,lat,lon`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      if (data.status === "success") {
        return {
          city: data.city || "Unknown",
          state: data.regionName || "Unknown",
          country: data.country || "Unknown",
          approxLatitude: data.lat || null,
          approxLongitude: data.lon || null,
        };
      }
    }
  } catch (e) {
    // Non-blocking timeout or offline dev
  }

  return fallback;
}

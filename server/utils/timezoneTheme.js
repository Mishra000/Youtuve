/**
 * timezoneTheme.js — IST (Asia/Kolkata) Timezone & Adaptive Theme Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Requirement:
 *  - 05:00 AM — 12:00 PM IST  => LIGHT THEME
 *  - 12:00 PM — 05:00 AM IST  => DARK THEME
 *
 * Rules:
 *  - Uses Asia/Kolkata timezone strictly, NOT server or browser timezone.
 *  - Timestamps are stored in UTC in database and formatted to IST for display.
 */

/**
 * Calculates the automatic theme for a given date in IST (Asia/Kolkata)
 * @param {Date} [date=new Date()]
 * @returns {"light" | "dark"}
 */
export function getAutomaticThemeIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hourStr = parts.find((p) => p.type === "hour")?.value || "0";
  const minStr = parts.find((p) => p.type === "minute")?.value || "0";

  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  const totalMinutes = hour * 60 + minute;

  // 05:00 AM IST = 5 * 60 = 300 minutes
  // 12:00 PM IST = 12 * 60 = 720 minutes
  // Light: 05:00 <= time < 12:00 IST (300 <= totalMinutes < 720)
  // Dark:  12:00 <= time or time < 05:00 IST
  if (totalMinutes >= 300 && totalMinutes < 720) {
    return "light";
  }
  return "dark";
}

/**
 * Formats a Date object or timestamp into an IST display string
 * e.g. "7 Oct 2026, 6:30 PM IST"
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatToIST(date) {
  if (!date) return "Unknown";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(d) + " IST";
}

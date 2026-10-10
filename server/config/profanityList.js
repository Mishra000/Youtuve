/**
 * profanityList.js — Configurable Multilingual Profanity Filter
 * ─────────────────────────────────────────────────────────────
 * Supports English, Hindi/Hinglish, Punjabi, Spanish, French.
 * Easily extensible without changing core controller logic.
 */

export const MULTILINGUAL_PROFANITY = {
  en: [
    "badword1", "badword2", "abuse", "scam", "asshole", "bastard", "bitch",
    "blowjob", "bollocks", "bullshit", "cunt", "dick", "dickhead", "fag",
    "faggot", "fuck", "fucking", "motherfucker", "nigger", "nigga", "piss",
    "pussy", "shit", "slut", "twat", "whore", "retard"
  ],
  hi: [
    "chutiya", "chootiya", "bhosadike", "bhosdike", "bhenchod", "behenchod",
    "madarchod", "gandu", "gaandu", "harami", "kamina", "saala", "kuttiya",
    "randi", "bhadwa", "laude", "lode", "chodu", "bkl", "mc", "bc"
  ],
  pa: [
    "kanjar", "fudu", "fuddu", "kuttiya", "tatti", "choot", "lann", "kutti deya"
  ],
  es: [
    "puta", "puto", "mierda", "cabron", "cabrona", "pendejo", "pendeja", "maricon",
    "hijo de puta", "verga", "culiao", "coño"
  ],
  fr: [
    "merde", "putain", "connard", "salope", "encule", "batard", "pute", "chier"
  ],
};

// Flattened list for fast unified lookup
export const ALL_PROFANITY_WORDS = Object.values(MULTILINGUAL_PROFANITY).flat();

/**
 * Normalizes text to defeat basic leetspeak & obfuscation
 * e.g. "b!tch" -> "bitch", "f*ck" -> "fuck", "a$$" -> "ass"
 */
export function normalizeLeetspeak(text) {
  return text
    .toLowerCase()
    .replace(/f[\*_~^]+ck/g, "fuck")
    .replace(/sh[\*_~^]+t/g, "shit")
    .replace(/b[\*_~^]+tch/g, "bitch")
    .replace(/a[\*_~^]+hole/g, "asshole")
    .replace(/d[\*_~^]+ck/g, "dick")
    .replace(/c[\*_~^]+nt/g, "cunt")
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[!1|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[*_~^]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Checks if text contains abusive/prohibited words
 * @param {string} text
 * @returns {boolean}
 */
export function containsProfanity(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = normalizeLeetspeak(text);

  for (const word of ALL_PROFANITY_WORDS) {
    // Word boundary matching (also matches punctuated variations)
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\b|\\s|_)${escaped}(\\b|\\s|_|$)`, "i");
    if (regex.test(normalized)) {
      return true;
    }
  }

  return false;
}

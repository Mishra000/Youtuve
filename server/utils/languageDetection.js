/**
 * languageDetection.js — Multilingual Language Detector
 * ─────────────────────────────────────────────────────────────
 * Detects language from Unicode scripts and character frequencies.
 * Fast, 100% offline, zero-dependency, works with Unicode and fallback.
 */

export const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  pa: "Punjabi",
  es: "Spanish",
  fr: "French",
  de: "German",
  ar: "Arabic",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  pt: "Portuguese",
  ur: "Urdu",
};

/**
 * Detect language of a text
 * @param {string} text
 * @param {string} [userSpecifiedLang] Optional user override
 * @returns {{ languageCode: string, languageName: string }}
 */
export function detectLanguage(text, userSpecifiedLang = null) {
  if (userSpecifiedLang && LANGUAGE_NAMES[userSpecifiedLang.toLowerCase()]) {
    const code = userSpecifiedLang.toLowerCase();
    return { languageCode: code, languageName: LANGUAGE_NAMES[code] };
  }

  if (!text || typeof text !== "string" || !text.trim()) {
    return { languageCode: "en", languageName: "English" };
  }

  const str = text.trim();

  // 1. Script checks (Unicode character ranges)
  let devanagariCount = 0; // Hindi, Marathi, Sanskrit
  let gurmukhiCount = 0;   // Punjabi
  let arabicCount = 0;     // Arabic, Urdu
  let bengaliCount = 0;    // Bengali
  let tamilCount = 0;      // Tamil
  let teluguCount = 0;     // Telugu
  let cyrillicCount = 0;   // Russian, etc.
  let cjkCount = 0;        // Chinese
  let kanaCount = 0;       // Japanese
  let hangulCount = 0;     // Korean

  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp >= 0x0900 && cp <= 0x097F) devanagariCount++;
    else if (cp >= 0x0A00 && cp <= 0x0A7F) gurmukhiCount++;
    else if (cp >= 0x0600 && cp <= 0x06FF) arabicCount++;
    else if (cp >= 0x0980 && cp <= 0x09FF) bengaliCount++;
    else if (cp >= 0x0B80 && cp <= 0x0BFF) tamilCount++;
    else if (cp >= 0x0C00 && cp <= 0x0C7F) teluguCount++;
    else if (cp >= 0x0400 && cp <= 0x04FF) cyrillicCount++;
    else if (cp >= 0x4E00 && cp <= 0x9FFF) cjkCount++;
    else if (cp >= 0x3040 && cp <= 0x30FF) kanaCount++;
    else if (cp >= 0xAC00 && cp <= 0xD7AF) hangulCount++;
  }

  if (gurmukhiCount > 2) return { languageCode: "pa", languageName: "Punjabi" };
  if (devanagariCount > 2) return { languageCode: "hi", languageName: "Hindi" };
  if (arabicCount > 2) return { languageCode: "ar", languageName: "Arabic" };
  if (bengaliCount > 2) return { languageCode: "bn", languageName: "Bengali" };
  if (tamilCount > 2) return { languageCode: "ta", languageName: "Tamil" };
  if (teluguCount > 2) return { languageCode: "te", languageName: "Telugu" };
  if (cyrillicCount > 2) return { languageCode: "ru", languageName: "Russian" };
  if (hangulCount > 1) return { languageCode: "ko", languageName: "Korean" };
  if (kanaCount > 1) return { languageCode: "ja", languageName: "Japanese" };
  if (cjkCount > 1) return { languageCode: "zh", languageName: "Chinese" };

  // 2. Latin script word heuristics
  const lower = str.toLowerCase();
  const words = lower.split(/\s+/);

  const esWords = new Set(["el", "la", "los", "las", "un", "una", "es", "que", "por", "para", "con", "muy", "gracias", "hola", "bueno", "estoy"]);
  const frWords = new Set(["le", "la", "les", "un", "une", "des", "est", "que", "pour", "avec", "dans", "merci", "bonjour", "très", "nous"]);
  const deWords = new Set(["der", "die", "das", "und", "ist", "in", "den", "von", "zu", "mit", "danke", "hallo", "gut", "nicht", "ein", "eine"]);

  let esScore = 0, frScore = 0, deScore = 0;
  for (const w of words) {
    if (esWords.has(w)) esScore++;
    if (frWords.has(w)) frScore++;
    if (deWords.has(w)) deScore++;
  }

  if (esScore >= 2 && esScore > frScore && esScore > deScore) {
    return { languageCode: "es", languageName: "Spanish" };
  }
  if (frScore >= 2 && frScore > esScore && frScore > deScore) {
    return { languageCode: "fr", languageName: "French" };
  }
  if (deScore >= 2 && deScore > esScore && deScore > frScore) {
    return { languageCode: "de", languageName: "German" };
  }

  // Default to English
  return { languageCode: "en", languageName: "English" };
}

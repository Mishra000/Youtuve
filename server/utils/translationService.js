/**
 * translationService.js — Multilingual Translation Abstraction & Caching
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean translation-service abstraction. Supports:
 *  1. Custom provider via TRANSLATION_API_URL / TRANSLATION_API_KEY
 *  2. Self-hosted LibreTranslate via LIBRE_TRANSLATE_URL / LIBRE_TRANSLATE_API_KEY
 *  3. Google Translate Web API (free public endpoint fallback)
 *  4. MyMemory Translation API fallback (free ~5k-50k words/day)
 *
 * Caches results in MongoDB CommentTranslation and comment.translations map.
 */

import Comment, { CommentTranslation } from "../Modals/comment.js";

/**
 * Perform translation of text into target language
 * @param {string} text The text to translate
 * @param {string} targetLang The ISO language code (e.g., "en", "hi", "pa", "es", "fr", "de")
 * @returns {Promise<string|null>} The translated text or null if all services fail
 */
export async function executeTranslation(text, targetLang = "en") {
  if (!text || !text.trim()) return null;
  const cleanText = text.trim();

  // 1. Configured custom Translation API
  if (process.env.TRANSLATION_API_URL) {
    try {
      const resp = await fetch(process.env.TRANSLATION_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.TRANSLATION_API_KEY ? { Authorization: `Bearer ${process.env.TRANSLATION_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          q: cleanText,
          source: "auto",
          target: targetLang,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const translated = data.translatedText || data.translation || data.text;
        if (translated) return translated;
      }
    } catch (err) {
      console.warn("TRANSLATION_API_URL attempt failed:", err.message);
    }
  }

  // 2. LibreTranslate
  if (process.env.LIBRE_TRANSLATE_URL) {
    try {
      const resp = await fetch(`${process.env.LIBRE_TRANSLATE_URL.replace(/\/$/, "")}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: cleanText,
          source: "auto",
          target: targetLang,
          api_key: process.env.LIBRE_TRANSLATE_API_KEY || "",
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.translatedText) return data.translatedText;
      }
    } catch (err) {
      console.warn("LibreTranslate attempt failed:", err.message);
    }
  }

  // 3. Google Translate Web API (free client=gtx endpoint)
  try {
    const encoded = encodeURIComponent(cleanText);
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encoded}`;
    const resp = await fetch(gUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const fullTranslation = data[0].map((item) => item[0]).filter(Boolean).join("");
        if (fullTranslation && fullTranslation.trim()) {
          return fullTranslation.trim();
        }
      }
    }
  } catch (err) {
    console.warn("Google Translate fallback failed:", err.message);
  }

  // 4. MyMemory API fallback
  try {
    const key = process.env.MYMEMORY_KEY ? `&key=${process.env.MYMEMORY_KEY}` : "";
    const encoded = encodeURIComponent(cleanText.slice(0, 500));
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=auto|${encodeURIComponent(targetLang)}${key}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (err) {
    console.warn("MyMemory fallback failed:", err.message);
  }

  // If all attempts failed
  return null;
}

/**
 * Get cached or new translation for a comment
 * @param {string} commentId
 * @param {string} targetLang
 * @returns {Promise<{ translated: string, cached: boolean } | null>}
 */
export async function getOrTranslateComment(commentId, targetLang = "en") {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.deleted) {
    return null;
  }

  const normalizedTarget = (targetLang || "en").toLowerCase();

  // If target language is same as original language, return original without API call
  if (comment.originalLanguage && comment.originalLanguage.toLowerCase() === normalizedTarget) {
    return {
      translated: comment.originalText || comment.commentbody,
      cached: true,
      sameAsOriginal: true,
    };
  }

  // 1. Check database translation cache collection
  const cachedDoc = await CommentTranslation.findOne({ commentId, targetLang: normalizedTarget });
  if (cachedDoc) {
    return { translated: cachedDoc.translated, cached: true };
  }

  // 2. Check embedded translations map
  if (comment.translations && comment.translations.get && comment.translations.get(normalizedTarget)) {
    return { translated: comment.translations.get(normalizedTarget), cached: true };
  }

  // 3. Perform translation
  const textToTranslate = comment.originalText || comment.commentbody;
  const translated = await executeTranslation(textToTranslate, normalizedTarget);
  if (!translated) {
    return null;
  }

  // 4. Store in Cache collection
  await CommentTranslation.findOneAndUpdate(
    { commentId, targetLang: normalizedTarget },
    { translated },
    { upsert: true, new: true }
  );

  // 5. Update embedded translations map on comment
  try {
    await Comment.findByIdAndUpdate(commentId, {
      $set: { [`translations.${normalizedTarget}`]: translated },
    });
  } catch (e) {
    console.warn("Could not update embedded translation map:", e.message);
  }

  return { translated, cached: false };
}

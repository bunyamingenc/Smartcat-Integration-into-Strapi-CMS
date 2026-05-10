// transform.js
// Converts between Strapi content format and Smartcat flat payload format

// Re-export XLIFF helpers so callers can keep a single import surface
// (e.g. `import { toXliff, fromXliff } from "./transform.js"`).
export { toXliff, fromXliff } from "./xliff.js";

/**
 * Convert extracted Strapi fields into a flat Smartcat-ready payload.
 * Input:  { "article-804.title": "...", "article-804.body": "..." }
 * Output: same — already flat, this is a pass-through with validation
 * @param {object} flatPayload - output of strapiClient.extractTranslatableFields()
 * @returns {object}
 */
export function toSmartcatPayload(flatPayload) {
  if (!flatPayload || Object.keys(flatPayload).length === 0) {
    throw new Error("[transform] Cannot send empty payload to Smartcat");
  }
  return flatPayload;
}

/**
 * Convert a downloaded Smartcat translation back into Strapi field format.
 * Input:  { "article-804.title": "Hoş Geldiniz", "article-804.body": "<h1>...</h1>" }
 * Output: { contentId: "article-804", fields: { title: "Hoş Geldiniz", body: "..." } }
 *
 * @param {object} translatedPayload - flat JSON downloaded from Smartcat
 * @returns {{ contentId: string, fields: object }}
 */
export function fromSmartcatPayload(translatedPayload) {
  const result = {};

  for (const [key, value] of Object.entries(translatedPayload)) {
    const dotIndex = key.indexOf(".");
    if (dotIndex === -1) {
      console.warn(`[transform] Skipping key with no contentId prefix: "${key}"`);
      continue;
    }

    const contentId = key.substring(0, dotIndex);
    const fieldName = key.substring(dotIndex + 1);

    if (!result[contentId]) {
      result[contentId] = { contentId, fields: {} };
    }

    result[contentId].fields[fieldName] = value;
  }

  const entries = Object.values(result);

  if (entries.length === 0) {
    throw new Error("[transform] No valid fields found in translated payload");
  }

  // For single-document payloads, return the single entry directly
  if (entries.length === 1) return entries[0];

  // For multi-document payloads, return the full map
  return result;
}

/**
 * Protect {{variable}} placeholders from being altered during transformation.
 * Logs a warning if any placeholder appears to have been broken.
 * @param {object} original    - original source fields
 * @param {object} translated  - translated fields
 */
export function validatePlaceholders(original, translated) {
  const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}/g;
  const warnings = [];

  for (const [field, sourceValue] of Object.entries(original)) {
    const sourcePlaceholders = (sourceValue.match(PLACEHOLDER_REGEX) || []).sort();
    const translatedValue = translated[field] ?? "";
    const translatedPlaceholders = (translatedValue.match(PLACEHOLDER_REGEX) || []).sort();

    const missing = sourcePlaceholders.filter((p) => !translatedPlaceholders.includes(p));
    if (missing.length > 0) {
      warnings.push(`Field "${field}" is missing placeholders: ${missing.join(", ")}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("[transform] Placeholder validation warnings:");
    warnings.forEach((w) => console.warn(`  !  ${w}`));
  } else {
    console.log("[transform] Placeholder validation passed");
  }

  return warnings;
}

// xliff.js — XLIFF 1.2 serializer/parser, zero dependencies
// Converts flat { "article-804.title": "...", ... } payloads to/from XLIFF 1.2.
// Compatible with Smartcat, MemoQ, Trados, OmegaT, Phrase.

// XML entity encoding for source/target text
function encode(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decode(str) {
  return String(str)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Convert a flat key→value payload into XLIFF 1.2.
 * @param {object} flatPayload - { "article-X.title": "Hello", ... }
 * @param {object} options
 * @param {string} options.sourceLang   - source locale code (e.g. "en")
 * @param {string} options.targetLang   - target locale code (e.g. "tr")
 * @param {object} [options.translations] - optional flat translated payload
 * @returns {string} XLIFF 1.2 XML
 */
export function toXliff(flatPayload, { sourceLang = "en", targetLang = "tr", translations = null } = {}) {
  if (!flatPayload || Object.keys(flatPayload).length === 0) {
    throw new Error("[xliff] Cannot build XLIFF from an empty payload");
  }

  // Pick the first key to derive an "original" filename for the <file> tag
  const firstKey  = Object.keys(flatPayload)[0];
  const contentId = firstKey.split(".")[0] || "content";

  const units = Object.entries(flatPayload).map(([key, sourceText]) => {
    const targetText = translations?.[key];
    const targetTag  = targetText !== undefined && targetText !== null
      ? `<target>${encode(targetText)}</target>`
      : `<target></target>`;
    return [
      `    <trans-unit id="${encode(key)}" datatype="html">`,
      `      <source>${encode(sourceText)}</source>`,
      `      ${targetTag}`,
      `    </trans-unit>`,
    ].join("\n");
  }).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">`,
    `  <file source-language="${encode(sourceLang)}" target-language="${encode(targetLang)}" datatype="html" original="${encode(contentId)}.json">`,
    `    <body>`,
    units,
    `    </body>`,
    `  </file>`,
    `</xliff>`,
  ].join("\n");
}

/**
 * Parse XLIFF 1.2 XML into a flat translated payload.
 * Falls back to <source> if <target> is empty (handy for partial translations).
 * @param {string} xml - XLIFF 1.2 XML string
 * @returns {object} { "article-X.title": "translated text", ... }
 */
export function fromXliff(xml) {
  if (!xml || typeof xml !== "string") {
    throw new Error("[xliff] Cannot parse empty input");
  }
  if (!xml.includes("<xliff")) {
    throw new Error("[xliff] Input does not look like XLIFF (no <xliff> tag found)");
  }

  const result = {};
  const unitRegex = /<trans-unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let match;

  while ((match = unitRegex.exec(xml)) !== null) {
    const id    = decode(match[1]);
    const inner = match[2];

    const targetMatch = inner.match(/<target[^>]*>([\s\S]*?)<\/target>/);
    const sourceMatch = inner.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    let value = "";
    if (targetMatch && targetMatch[1].trim()) {
      value = decode(targetMatch[1]);
    } else if (sourceMatch) {
      // Partial translation fallback — keep source so Strapi gets something
      value = decode(sourceMatch[1]);
    }

    if (id) result[id] = value;
  }

  if (Object.keys(result).length === 0) {
    throw new Error("[xliff] No <trans-unit> entries found in XLIFF");
  }

  return result;
}

// ─── XLIFF 2.0 ──────────────────────────────────────────────────────────────

/**
 * Convert a flat key→value payload into XLIFF 2.0.
 * Structurally different from 1.2: <unit><segment><source>/<target></segment></unit>
 * instead of <trans-unit>, and srcLang/trgLang live on the root <xliff> element.
 * @param {object} flatPayload
 * @param {object} options - same shape as toXliff()
 * @returns {string} XLIFF 2.0 XML
 */
export function toXliff2(flatPayload, { sourceLang = "en", targetLang = "tr", translations = null } = {}) {
  if (!flatPayload || Object.keys(flatPayload).length === 0) {
    throw new Error("[xliff] Cannot build XLIFF from an empty payload");
  }

  const firstKey  = Object.keys(flatPayload)[0];
  const contentId = firstKey.split(".")[0] || "content";

  const units = Object.entries(flatPayload).map(([key, sourceText]) => {
    const targetText = translations?.[key];
    const targetTag  = targetText !== undefined && targetText !== null
      ? `<target>${encode(targetText)}</target>`
      : `<target></target>`;
    return [
      `    <unit id="${encode(key)}">`,
      `      <segment>`,
      `        <source>${encode(sourceText)}</source>`,
      `        ${targetTag}`,
      `      </segment>`,
      `    </unit>`,
    ].join("\n");
  }).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<xliff version="2.0" srcLang="${encode(sourceLang)}" trgLang="${encode(targetLang)}" xmlns="urn:oasis:names:tc:xliff:document:2.0">`,
    `  <file id="${encode(contentId)}">`,
    units,
    `  </file>`,
    `</xliff>`,
  ].join("\n");
}

/**
 * Parse XLIFF 2.0 XML into a flat translated payload.
 * Falls back to <source> if <target> is empty.
 * @param {string} xml
 * @returns {object}
 */
export function fromXliff2(xml) {
  if (!xml || typeof xml !== "string") {
    throw new Error("[xliff] Cannot parse empty input");
  }
  if (!xml.includes("<xliff")) {
    throw new Error("[xliff] Input does not look like XLIFF (no <xliff> tag found)");
  }

  const result = {};
  const unitRegex = /<unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/unit>/g;
  let match;

  while ((match = unitRegex.exec(xml)) !== null) {
    const id    = decode(match[1]);
    const inner = match[2];

    const targetMatch = inner.match(/<target[^>]*>([\s\S]*?)<\/target>/);
    const sourceMatch = inner.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    let value = "";
    if (targetMatch && targetMatch[1].trim()) {
      value = decode(targetMatch[1]);
    } else if (sourceMatch) {
      value = decode(sourceMatch[1]);
    }

    if (id) result[id] = value;
  }

  if (Object.keys(result).length === 0) {
    throw new Error("[xliff] No <unit> entries found in XLIFF 2.0 document");
  }

  return result;
}

/**
 * Detects XLIFF version from raw XML and parses with the correct parser.
 * Used by the upload endpoint so the person doesn't have to specify which
 * version they're uploading — 1.2 and 2.0 both work transparently.
 * @param {string} xml
 * @returns {object} flat translated payload
 */
export function fromXliffAny(xml) {
  if (!xml || typeof xml !== "string") {
    throw new Error("[xliff] Cannot parse empty input");
  }

  const versionMatch = xml.match(/<xliff[^>]*\bversion="([^"]+)"/);
  const version = versionMatch?.[1] || "";

  if (version.startsWith("2.")) return fromXliff2(xml);
  if (version.startsWith("1.")) return fromXliff(xml);

  // No version attribute found — guess from structure
  if (xml.includes("<unit ") || xml.includes("<unit>")) return fromXliff2(xml);
  if (xml.includes("<trans-unit")) return fromXliff(xml);

  throw new Error("[xliff] Could not determine XLIFF version — no recognizable <unit> or <trans-unit> elements found");
}

// qaCheck.js — validates translated content against source
// Zero dependencies. Returns structured issues per field.

// ─── Placeholder detection ─────────────────────────────────────────────────────
// Supports {{variable}} and {variable} and printf-style %s / %1$s

function extractPlaceholders(text) {
  if (!text) return [];
  const patterns = [
    /\{\{\s*[\w.]+\s*\}\}/g,   // {{userName}}
    /\{\s*[\w.]+\s*\}/g,        // {userName}
    /%\d*\$?[sd]/g,             // %s, %d, %1$s
  ];
  const found = [];
  for (const re of patterns) {
    const matches = text.match(re);
    if (matches) found.push(...matches);
  }
  return found;
}

function checkPlaceholders(source, translated) {
  const srcPh = extractPlaceholders(source);
  const trPh  = extractPlaceholders(translated);

  if (srcPh.length === 0) return null; // nothing to check

  const srcSet = srcPh.slice().sort();
  const trSet  = trPh.slice().sort();

  const missing = srcSet.filter((p) => !trSet.includes(p));
  const extra   = trSet.filter((p) => !srcSet.includes(p));

  if (missing.length === 0 && extra.length === 0) return null;

  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
  if (extra.length)   parts.push(`unexpected: ${extra.join(", ")}`);

  return {
    level:   "error",
    type:    "placeholder",
    message: `Placeholder mismatch — ${parts.join("; ")}`,
  };
}

// ─── HTML tag balance ───────────────────────────────────────────────────────────

function extractTags(text) {
  if (!text) return [];
  const matches = text.match(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g);
  return matches || [];
}

function tagName(tag) {
  const m = tag.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  return m ? m[1].toLowerCase() : null;
}

function checkHtmlTags(source, translated) {
  const srcTags = extractTags(source);
  if (srcTags.length === 0) return null; // no HTML to check

  const trTags = extractTags(translated);

  const countByName = (tags) => {
    const counts = {};
    for (const t of tags) {
      const name = tagName(t);
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  };

  const srcCounts = countByName(srcTags);
  const trCounts  = countByName(trTags);

  const mismatches = [];
  for (const [name, count] of Object.entries(srcCounts)) {
    if ((trCounts[name] || 0) !== count) {
      mismatches.push(`<${name}> expected ${count}, found ${trCounts[name] || 0}`);
    }
  }

  if (mismatches.length === 0) return null;

  return {
    level:   "warning",
    type:    "html",
    message: `HTML tag mismatch — ${mismatches.join("; ")}`,
  };
}

// ─── Empty / untranslated check ─────────────────────────────────────────────────

function checkEmpty(source, translated) {
  const srcTrim = (source || "").trim();
  const trTrim  = (translated || "").trim();

  if (srcTrim.length === 0) return null; // nothing to translate
  if (trTrim.length === 0) {
    return {
      level:   "error",
      type:    "empty",
      message: "Translation is empty",
    };
  }
  return null;
}

// ─── Length anomaly ──────────────────────────────────────────────────────────────

function checkLength(source, translated) {
  const srcLen = (source || "").trim().length;
  const trLen  = (translated || "").trim().length;

  if (srcLen < 10) return null; // too short to judge meaningfully

  const ratio = trLen / srcLen;

  if (ratio > 2.5) {
    return {
      level:   "warning",
      type:    "length",
      message: `Translation is ${Math.round(ratio * 100)}% of source length — possible over-translation`,
    };
  }
  if (ratio < 0.3) {
    return {
      level:   "warning",
      type:    "length",
      message: `Translation is only ${Math.round(ratio * 100)}% of source length — possible truncation`,
    };
  }
  return null;
}

// ─── Run all checks on one field ────────────────────────────────────────────────

function checkField(source, translated) {
  const issues = [];

  const emptyIssue = checkEmpty(source, translated);
  if (emptyIssue) {
    // If empty, no point running other checks
    issues.push(emptyIssue);
    return issues;
  }

  const checks = [checkPlaceholders, checkHtmlTags, checkLength];
  for (const check of checks) {
    const issue = check(source, translated);
    if (issue) issues.push(issue);
  }

  return issues;
}

// ─── Run QA across all fields for one locale ────────────────────────────────────
// sourceFields / translatedFields: { title: "...", shortDescription: "...", body: "..." }

export function runQA(sourceFields, translatedFields) {
  const fieldResults = {};
  let errorCount   = 0;
  let warningCount = 0;

  for (const [field, sourceText] of Object.entries(sourceFields || {})) {
    const translatedText = translatedFields?.[field] ?? "";
    const issues = checkField(sourceText, translatedText);

    if (issues.length > 0) {
      fieldResults[field] = issues;
      for (const issue of issues) {
        if (issue.level === "error") errorCount++;
        if (issue.level === "warning") warningCount++;
      }
    }
  }

  return {
    fields:       fieldResults,
    errorCount,
    warningCount,
    passed:       errorCount === 0 && warningCount === 0,
    checkedAt:    new Date().toISOString(),
  };
}

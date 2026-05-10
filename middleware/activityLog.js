// activityLog.js — append-only activity logger
// Each line in activity.jsonl is a JSON object

import fs   from "fs";
import path from "path";

const LOG_FILE = path.resolve("activity.jsonl");

const ACTION_ICONS = {
  register:           "📋",
  remove:             "🗑",
  send:               "→",
  pull:               "↓",
  diff:               "⟷",
  "init-locales":     "🌐",
  "add-strapi-locales": "➕",
  "xliff-download":   "📥",
  "xliff-upload":     "📤",
  "locale-sync":      "🔄",
};

/**
 * Append one activity entry to the log file.
 * @param {string} action    - e.g. "send", "pull", "register"
 * @param {object} details   - { articleTitle, key, lang, result, ... }
 */
export function logActivity(action, details = {}) {
  const entry = {
    id:        Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    action,
    icon:      ACTION_ICONS[action] || "•",
    ...details,
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch (e) {
    console.error("[activityLog] Failed to write:", e.message);
  }
}

/**
 * Read paginated activity log (reverse-chronological).
 * @param {number} page   - 1-based page number
 * @param {number} limit  - entries per page
 * @returns {{ entries, total, page, totalPages }}
 */
export function readActivity(page = 1, limit = 25) {
  if (!fs.existsSync(LOG_FILE)) {
    return { entries: [], total: 0, page, totalPages: 0 };
  }

  const raw  = fs.readFileSync(LOG_FILE, "utf-8").trim();
  if (!raw) return { entries: [], total: 0, page, totalPages: 0 };

  const lines = raw.split("\n").filter(Boolean);
  const all   = [];

  for (const line of lines) {
    try { all.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }

  // Reverse so newest is first
  all.reverse();

  const total      = all.length;
  const totalPages = Math.ceil(total / limit);
  const start      = (page - 1) * limit;
  const entries    = all.slice(start, start + limit);

  return { entries, total, page, totalPages };
}

/**
 * Clear the activity log.
 */
export function clearActivity() {
  fs.writeFileSync(LOG_FILE, "", "utf-8");
}

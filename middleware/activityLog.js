// activityLog.js — SQLite-backed activity logger.
// Same public API as the old file-based version (logActivity, readActivity,
// clearActivity), so nothing calling these functions elsewhere needs to change.

import { db } from "./db.js";

const ACTION_ICONS = {
  register:             "📋",
  remove:               "🗑",
  send:                 "→",
  pull:                 "↓",
  diff:                 "⟷",
  "init-locales":       "🌐",
  "add-strapi-locales": "➕",
  "xliff-download":     "📥",
  "xliff-upload":       "📤",
  "locale-sync":        "🔄",
};

const insertActivity = db.prepare("INSERT INTO activity (id, timestamp, data) VALUES (?, ?, ?)");
const countActivity  = db.prepare("SELECT COUNT(*) AS count FROM activity");
const pageActivity   = db.prepare("SELECT data FROM activity ORDER BY timestamp DESC LIMIT ? OFFSET ?");
const deleteAllActivity = db.prepare("DELETE FROM activity");

/**
 * Append one activity entry.
 * @param {string} action  - e.g. "send", "pull", "register"
 * @param {object} details - { articleTitle, key, lang, results, ... }
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
    insertActivity.run(entry.id, entry.timestamp, JSON.stringify(entry));
  } catch (e) {
    console.error("[activityLog] Failed to write:", e.message);
  }
}

/**
 * Read paginated activity log (reverse-chronological).
 * @param {number} page
 * @param {number} limit
 * @returns {{ entries, total, page, totalPages }}
 */
export function readActivity(page = 1, limit = 25) {
  const total      = countActivity.get().count;
  const totalPages = Math.ceil(total / limit);
  const offset     = (page - 1) * limit;

  const rows = pageActivity.all(limit, offset);
  const entries = rows
    .map((r) => { try { return JSON.parse(r.data); } catch { return null; } })
    .filter(Boolean);

  return { entries, total, page, totalPages };
}

/**
 * Clear the entire activity log.
 */
export function clearActivity() {
  deleteAllActivity.run();
}

// db.js — SQLite-backed storage for the article registry.
// Replaces registry.json with a real database, same data shape.
// When deploying to Railway with PostgreSQL, only this file needs to change —
// server.js and activityLog.js just import loadRegistry/saveRegistry and don't
// care what's underneath.

import Database from "better-sqlite3";
import path from "path";

const DB_FILE = path.resolve("data.sqlite");

export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL"); // better concurrent read/write behavior

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    key  TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id        TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    data      TEXT NOT NULL
  );
`);

// ─── Registry ──────────────────────────────────────────────────────────────

/**
 * Loads the full registry, keyed by article key — same shape as the old
 * registry.json file, so server.js code that does reg[key] etc. is unaffected.
 */
export function loadRegistry() {
  const rows = db.prepare("SELECT key, data FROM articles").all();
  const reg = {};
  for (const row of rows) {
    try { reg[row.key] = JSON.parse(row.data); }
    catch { console.warn(`[db] Skipping corrupt row for key "${row.key}"`); }
  }
  return reg;
}

/**
 * Saves the full registry object. Mirrors the old fs.writeFileSync(registry.json)
 * behavior — the caller mutates the object (including deletions) then calls this
 * with the whole thing. We replace all rows in one transaction.
 */
const deleteAllArticles = db.prepare("DELETE FROM articles");
const insertArticle     = db.prepare("INSERT INTO articles (key, data) VALUES (?, ?)");

export function saveRegistry(reg) {
  const tx = db.transaction((regObj) => {
    deleteAllArticles.run();
    for (const [key, value] of Object.entries(regObj)) {
      insertArticle.run(key, JSON.stringify(value));
    }
  });
  tx(reg);
}

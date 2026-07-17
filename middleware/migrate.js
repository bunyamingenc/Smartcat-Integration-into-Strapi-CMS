// migrate.js — one-time import of registry.json + activity.jsonl into SQLite.
// Run this ONCE after pulling the SQLite-backed version, so your existing
// registered articles and activity history aren't lost.
//
// Usage: node migrate.js

import fs from "fs";
import path from "path";
import { db, loadRegistry, saveRegistry } from "./db.js";

const REG_FILE = path.resolve("registry.json");
const LOG_FILE = path.resolve("activity.jsonl");

console.log("\n📦 LocaleSync — migrating file-based data into SQLite\n");

// ─── Migrate registry.json ────────────────────────────────────────────────────

if (fs.existsSync(REG_FILE)) {
  try {
    const raw = fs.readFileSync(REG_FILE, "utf-8");
    const oldRegistry = JSON.parse(raw);
    const count = Object.keys(oldRegistry).length;

    if (count === 0) {
      console.log("registry.json exists but is empty — nothing to migrate.");
    } else {
      const existing = loadRegistry();
      const existingCount = Object.keys(existing).length;
      if (existingCount > 0) {
        console.log(`⚠ Database already has ${existingCount} article(s). Merging — file data will overwrite matching keys.`);
      }
      const merged = { ...existing, ...oldRegistry };
      saveRegistry(merged);
      console.log(`✓ Migrated ${count} article(s) from registry.json`);
    }
  } catch (e) {
    console.error(`✗ Failed to migrate registry.json: ${e.message}`);
  }
} else {
  console.log("No registry.json found — skipping (nothing to migrate).");
}

// ─── Migrate activity.jsonl ────────────────────────────────────────────────────

if (fs.existsSync(LOG_FILE)) {
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf-8").trim();
    if (!raw) {
      console.log("activity.jsonl exists but is empty — nothing to migrate.");
    } else {
      const lines = raw.split("\n").filter(Boolean);
      const insert = db.prepare("INSERT OR IGNORE INTO activity (id, timestamp, data) VALUES (?, ?, ?)");
      let migrated = 0;

      const tx = db.transaction((entries) => {
        for (const line of entries) {
          try {
            const entry = JSON.parse(line);
            const id = entry.id || (entry.timestamp + "-" + Math.random().toString(36).slice(2, 6));
            insert.run(id, entry.timestamp, JSON.stringify(entry));
            migrated++;
          } catch { /* skip malformed line */ }
        }
      });
      tx(lines);

      console.log(`✓ Migrated ${migrated} activity log entr${migrated === 1 ? "y" : "ies"} from activity.jsonl`);
    }
  } catch (e) {
    console.error(`✗ Failed to migrate activity.jsonl: ${e.message}`);
  }
} else {
  console.log("No activity.jsonl found — skipping (nothing to migrate).");
}

console.log("\n✅ Migration complete. Your data now lives in data.sqlite.");
console.log("   You can safely delete registry.json and activity.jsonl once you've verified everything looks correct in the app.\n");

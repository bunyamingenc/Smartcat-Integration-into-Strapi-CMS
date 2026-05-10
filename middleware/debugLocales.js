// debugLocales.js — checks which locales exist for a registered article
// Usage: node debugLocales.js <registry-key>
// Example: node debugLocales.js "vgncz2hfuvu5g3rs2r0z54u5::3fbf14fc-a8d3-4a32-8b7f-40bea4b1662d"
//
// Tip: Find your registry keys by running: node -e "import('./jobTracker.js').then(m => console.log(Object.keys(JSON.parse(require('fs').readFileSync('registry.json','utf8')))))"
// Or just open registry.json and copy a key from there.

import fs   from "fs";
import path from "path";
import axios from "axios";

// ─── Load registry ────────────────────────────────────────────────────────────

const REG_FILE = path.resolve("registry.json");
if (!fs.existsSync(REG_FILE)) {
  console.error("registry.json not found. Run the app and register an article first.");
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REG_FILE, "utf-8"));
const keys     = Object.keys(registry);

if (keys.length === 0) {
  console.error("No registered articles found in registry.json.");
  process.exit(1);
}

// ─── Pick article ─────────────────────────────────────────────────────────────

let entry;
const arg = process.argv[2];

if (arg) {
  entry = registry[arg];
  if (!entry) {
    console.error(`Key not found: "${arg}"`);
    console.log("Available keys:");
    keys.forEach((k) => console.log("  " + k));
    process.exit(1);
  }
} else if (keys.length === 1) {
  entry = registry[keys[0]];
} else {
  console.log("Multiple registered articles found. Pass a key as argument:");
  keys.forEach((k) => console.log(`  node debugLocales.js "${k}"  → ${registry[k].title}`));
  process.exit(0);
}

console.log(`\nArticle : ${entry.title}`);
console.log(`Strapi  : ${entry.strapiDocumentId}`);
console.log(`Smartcat: ${entry.smartcatProjectId}\n`);

// ─── Prompt for credentials if not in env ────────────────────────────────────

const strapiUrl   = process.env.STRAPI_URL   || "http://127.0.0.1:1337";
const strapiToken = process.env.STRAPI_API_TOKEN;
const strapiType  = process.env.STRAPI_CONTENT_TYPE || "test-articles";
const strapiLocale= process.env.STRAPI_SOURCE_LOCALE || "en";

if (!strapiToken) {
  console.error("Set STRAPI_API_TOKEN env var to run this script.");
  console.log("Example:");
  console.log('  $env:STRAPI_API_TOKEN="your-token"; node debugLocales.js');
  process.exit(1);
}

const strapi = axios.create({
  baseURL: strapiUrl,
  headers: { Authorization: `Bearer ${strapiToken}` },
});

// ─── Get global locales ───────────────────────────────────────────────────────

const localesR   = await strapi.get("/api/i18n/locales");
const allLocales = localesR.data || [];
console.log(`Global Strapi locales (${allLocales.length}):`);
allLocales.forEach((l) => console.log(`  - ${l.code} (${l.name})`));
console.log("");

// ─── Check each locale ────────────────────────────────────────────────────────

console.log("Checking each locale for this article:\n");
for (const loc of allLocales) {
  try {
    const r     = await strapi.get(`/api/${strapiType}/${entry.strapiDocumentId}?locale=${loc.code}`);
    const data  = r.data?.data;
    const attrs = data?.attributes ?? data;
    const returnedLocale = attrs?.locale || data?.locale || "(no locale field)";
    const title          = attrs?.title  || "(no title)";
    const match = returnedLocale.toLowerCase().split("-")[0] === loc.code.toLowerCase().split("-")[0];
    console.log(`  [${loc.code}] → ${match ? "✓ EXISTS" : "✗ fallback"} locale="${returnedLocale}" title="${title}"`);
  } catch (e) {
    const status = e.response?.status;
    console.log(`  [${loc.code}] → ${status === 404 ? "✗ NOT FOUND (404)" : `ERROR ${status}`}`);
  }
}

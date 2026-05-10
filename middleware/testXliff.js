// testXliff.js
// Round-trip sanity check for the XLIFF helpers — no network calls.
// Run:  node testXliff.js

import assert from "node:assert/strict";
import { toXliff, fromXliff } from "./xliff.js";

const source = {
  "article-804.title":            "Welcome, {{userName}}!",
  "article-804.shortDescription": "A short blurb with <em>HTML</em> & ampersand.",
  "article-804.body":             "<h1>Hello</h1><p>Visit us at \"localhost\".</p>",
};

// ── 1. Source-only export (the "send for translation" case) ───────────────
const sendXliff = toXliff(source, { sourceLanguage: "en", targetLanguage: "tr" });
console.log("─── XLIFF preview ───\n" + sendXliff);

const parsedSend = fromXliff(sendXliff, { prefer: "source" });
assert.deepEqual(parsedSend.payload, source, "source-only round-trip mismatch");
assert.equal(parsedSend.sourceLanguage, "en");
assert.equal(parsedSend.targetLanguage, "tr");
assert.equal(parsedSend.units, 3);
console.log("✓ source-only round-trip OK");

// ── 2. With translations (the "pull translated XLIFF" case) ───────────────
const translations = {
  "article-804.title":            "Hoş geldin, {{userName}}!",
  "article-804.shortDescription": "<em>HTML</em> & özel karakter içeren kısa açıklama.",
  "article-804.body":             "<h1>Merhaba</h1><p>\"localhost\" adresinde bizi ziyaret et.</p>",
};
const fullXliff   = toXliff(source, { sourceLanguage: "en", targetLanguage: "tr", translations });
const parsedFull  = fromXliff(fullXliff, { prefer: "target" });
assert.deepEqual(parsedFull.payload, translations, "target round-trip mismatch");
console.log("✓ translated round-trip OK");

// ── 3. Partial translation falls back to source ───────────────────────────
const partial = { "article-804.title": "Hoş geldin, {{userName}}!" }; // body missing
const partialXliff = toXliff(source, { sourceLanguage: "en", targetLanguage: "tr", translations: partial });
const parsedPartial = fromXliff(partialXliff, { prefer: "target" });
assert.equal(parsedPartial.payload["article-804.title"], partial["article-804.title"]);
assert.equal(
  parsedPartial.payload["article-804.body"],
  source["article-804.body"],
  "partial-translation fallback to source failed",
);
console.log("✓ partial translation falls back to source");

// ── 4. Empty payload rejected ─────────────────────────────────────────────
assert.throws(() => toXliff({}), /empty payload/i);
assert.throws(() => fromXliff(""), /non-empty/i);
console.log("✓ empty inputs rejected");

console.log("\nAll XLIFF round-trip checks passed ✓");

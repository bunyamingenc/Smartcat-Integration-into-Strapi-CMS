// testXliff2.js — round-trip sanity test for XLIFF 2.0 + auto-detection
import { toXliff, toXliff2, fromXliff2, fromXliffAny } from "./xliff.js";

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else           { console.log(`  ✗ ${label}`); failed++; }
}

console.log("\n1. XLIFF 2.0 — source-only export");
{
  const payload = { "article-123.title": "Hello & Welcome", "article-123.body": "Click <b>here</b> {{userName}}" };
  const xml = toXliff2(payload, { sourceLang: "en", targetLang: "tr" });
  check("contains version 2.0", xml.includes('version="2.0"'));
  check("contains <unit> tags", xml.includes("<unit "));
  check("contains srcLang/trgLang", xml.includes('srcLang="en"') && xml.includes('trgLang="tr"'));
  check("escapes ampersand", xml.includes("Hello &amp; Welcome"));
  check("preserves HTML in encoded form", xml.includes("&lt;b&gt;here&lt;/b&gt;"));
}

console.log("\n2. XLIFF 2.0 — full round-trip with translations");
{
  const payload = { "article-123.title": "Hello", "article-123.body": "Welcome {{userName}}" };
  const translations = { "article-123.title": "Merhaba", "article-123.body": "Hoş geldin {{userName}}" };
  const xml = toXliff2(payload, { sourceLang: "en", targetLang: "tr", translations });
  const parsed = fromXliff2(xml);
  check("title round-trips correctly", parsed["article-123.title"] === "Merhaba");
  check("body preserves placeholder", parsed["article-123.body"] === "Hoş geldin {{userName}}");
}

console.log("\n3. XLIFF 2.0 — partial translation falls back to source");
{
  const payload = { "article-123.title": "Hello", "article-123.body": "World" };
  const translations = { "article-123.title": "Merhaba" }; // body left untranslated
  const xml = toXliff2(payload, { sourceLang: "en", targetLang: "tr", translations });
  const parsed = fromXliff2(xml);
  check("translated field is correct", parsed["article-123.title"] === "Merhaba");
  check("untranslated field falls back to source", parsed["article-123.body"] === "World");
}

console.log("\n4. Auto-detection — fromXliffAny picks the right parser");
{
  const payload = { "article-1.title": "Test" };
  const translations = { "article-1.title": "Prueba" };

  const xml12 = toXliff(payload,  { sourceLang: "en", targetLang: "es", translations });
  const xml20 = toXliff2(payload, { sourceLang: "en", targetLang: "es", translations });

  const parsed12 = fromXliffAny(xml12);
  const parsed20 = fromXliffAny(xml20);

  check("detects and parses 1.2 correctly", parsed12["article-1.title"] === "Prueba");
  check("detects and parses 2.0 correctly", parsed20["article-1.title"] === "Prueba");
}

console.log("\n5. Empty input is rejected");
{
  try {
    fromXliff2("");
    check("rejects empty input", false);
  } catch (e) {
    check("rejects empty input", true);
  }

  try {
    fromXliffAny("<not-xliff>garbage</not-xliff>");
    check("rejects non-XLIFF garbage", false);
  } catch (e) {
    check("rejects non-XLIFF garbage", true);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

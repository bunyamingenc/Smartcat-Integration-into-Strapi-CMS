// sync.js — Strapi ↔ Smartcat pipeline
// Strategy: UPDATE existing Smartcat documents (already created manually)
// then poll and export when translations are complete.
// Usage: node sync.js

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { fetchArticle, extractTranslatableFields, updateArticleLocale } from "./strapiClient.js";
import { testAuth } from "./smartcatClient.js";
import { fromSmartcatPayload, validatePlaceholders } from "./transform.js";
import { createJob, updateJob, printJobSummary } from "./jobTracker.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const STRAPI_DOCUMENT_ID = process.env.STRAPI_DOCUMENT_ID;
const CONTENT_ID         = "article-" + STRAPI_DOCUMENT_ID?.slice(0, 8);
const SOURCE_LOCALE      = process.env.STRAPI_SOURCE_LOCALE || "en";
const TARGET_LOCALES     = [
  process.env.STRAPI_TARGET_LOCALE_1,
  process.env.STRAPI_TARGET_LOCALE_2,
].filter(Boolean);

const SMARTCAT_SERVER  = process.env.SMARTCAT_SERVER;
const SMARTCAT_ACCOUNT = process.env.SMARTCAT_ACCOUNT_ID;
const SMARTCAT_KEY     = process.env.SMARTCAT_API_KEY;
const PROJECT_ID       = process.env.SMARTCAT_PROJECT_ID;

const AUTH_HEADER = "Basic " + Buffer.from(`${SMARTCAT_ACCOUNT}:${SMARTCAT_KEY}`).toString("base64");

// These are the existing document IDs from your Smartcat project
// Format: documentBaseId_languageId
const SMARTCAT_DOC_IDS = {
  "tr":    "ebb63755af27cb3750b05090_1055",
  "es":    "ebb63755af27cb3750b05090_1034",
  "es-ES": "ebb63755af27cb3750b05090_1034",
};

const POLL_INTERVAL_MS = 15000;
const MAX_POLLS        = 40;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log   = (step, msg) => console.log(`[${step}] ${msg}`);

const smartcat = axios.create({
  baseURL: `${SMARTCAT_SERVER}/api/integration`,
  headers: { Authorization: AUTH_HEADER },
});

// ─── Step 1: Fetch from Strapi ────────────────────────────────────────────────

async function fetchFromStrapi() {
  log("1/5", "Fetching article from Strapi...");
  if (!STRAPI_DOCUMENT_ID) throw new Error("STRAPI_DOCUMENT_ID is not set in .env");

  const article = await fetchArticle(STRAPI_DOCUMENT_ID, SOURCE_LOCALE);
  const payload = extractTranslatableFields(CONTENT_ID, article);

  const fieldCount = Object.keys(payload).length;
  if (fieldCount === 0) throw new Error("No translatable fields found in Strapi article.");

  log("1/5", `Extracted ${fieldCount} fields: ${Object.keys(payload).join(", ")}`);
  return payload;
}

// ─── Step 2: Update existing Smartcat documents ───────────────────────────────

async function updateSmartcatDocuments(payload) {
  log("2/5", "Updating existing Smartcat documents with fresh Strapi content...");

  const fileContent = JSON.stringify(payload, null, 2);
  const boundary    = "--------------------SmartCATe8bf0f27d7";
  const CRLF        = "\r\n";
  const seen        = new Set();

  for (const [lang, docId] of Object.entries(SMARTCAT_DOC_IDS)) {
    if (seen.has(docId)) continue;
    seen.add(docId);

    log("2/5", `  Updating [${lang}] docId=${docId}...`);

    const rawBody = Buffer.concat([
      Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="${CONTENT_ID}.json"${CRLF}` +
        `Content-Type: application/octet-stream${CRLF}${CRLF}`,
        "utf8"
      ),
      Buffer.from(fileContent, "utf8"),
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8"),
    ]);

    try {
      await smartcat.put(
        `/v1/document/update?documentId=${docId}`,
        rawBody,
        {
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": rawBody.length,
          },
        }
      );
      log("2/5", `  ✓ Updated [${lang}]`);
    } catch (err) {
      const status = err.response?.status;
      const body   = JSON.stringify(err.response?.data);
      log("2/5", `  ⚠ Failed to update [${lang}] (${status}): ${body}`);
    }
  }

  createJob(CONTENT_ID, STRAPI_DOCUMENT_ID);
  updateJob(CONTENT_ID, { smartcatDocumentIds: SMARTCAT_DOC_IDS, status: "uploaded" });
  log("2/5", "Documents updated and job recorded ✓");
}

// ─── Step 3: Poll until translations complete ─────────────────────────────────

async function pollUntilComplete() {
  log("3/5", `Polling Smartcat every ${POLL_INTERVAL_MS / 1000}s...`);
  updateJob(CONTENT_ID, { status: "translating" });

  // Unique doc IDs to check
  const docIds = [...new Set(Object.values(SMARTCAT_DOC_IDS))];

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    let allDone = true;

    for (const docId of docIds) {
      try {
        const response = await smartcat.get(`/v1/document?documentId=${docId}`);
        const doc      = response.data;
        const status   = (doc.status || "").toLowerCase();
        const progress = doc.progress ?? "?";
        log("3/5", `Attempt ${attempt}: [${doc.targetLanguage}] status=${status} progress=${progress}%`);
        if (status !== "completed" && progress !== 100) allDone = false;
      } catch (err) {
        log("3/5", `  Error checking ${docId}: ${err.message}`);
        allDone = false;
      }
    }

    if (allDone) {
      log("3/5", "All translations complete ✓");
      updateJob(CONTENT_ID, { status: "ready" });
      return true;
    }

    if (attempt < MAX_POLLS) {
      log("3/5", `Waiting ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  log("3/5", "⚠  Timed out. Re-run node sync.js after translations are finished in Smartcat.");
  updateJob(CONTENT_ID, { status: "timeout" });
  return false;
}

// ─── Step 4: Export and download ──────────────────────────────────────────────

async function downloadTranslations() {
  log("4/5", "Exporting translations from Smartcat...");
  const results = {};

  // Map locale → docId, deduplicated
  const toExport = { "tr": SMARTCAT_DOC_IDS["tr"], "es": SMARTCAT_DOC_IDS["es-ES"] };

  for (const [lang, docId] of Object.entries(toExport)) {
    log("4/5", `Requesting export for [${lang}] docId=${docId}...`);

    try {
      const exportResp = await smartcat.post(`/v1/document/export?documentIds=${docId}`);
      const taskId     = exportResp.data?.id ?? exportResp.data;
      log("4/5", `  Export task: ${taskId}`);

      let translated = null;
      for (let i = 0; i < 15; i++) {
        await sleep(3000);
        try {
          const dlResp = await smartcat.get(`/v1/document/export/${taskId}`, {
            responseType: "text",
            headers: { Accept: "application/octet-stream" },
          });
          if (dlResp.status === 200 && dlResp.data) {
            translated = JSON.parse(dlResp.data);
            break;
          }
        } catch (e) {
          if (e.response?.status === 204) {
            log("4/5", `  Not ready yet (${i + 1}/15)...`);
          } else {
            log("4/5", `  Download attempt ${i + 1}: ${e.message}`);
          }
        }
      }

      if (!translated) {
        log("4/5", `  ⚠  Could not download [${lang}] — skipping`);
        continue;
      }

      const parsed = fromSmartcatPayload(translated);
      results[lang] = parsed.fields;
      log("4/5", `  ✓ Downloaded [${lang}]: ${Object.keys(parsed.fields).join(", ")}`);
    } catch (err) {
      log("4/5", `  ⚠  Export error for [${lang}]: ${err.message}`);
    }
  }

  return results;
}

// ─── Step 5: Write back to Strapi ────────────────────────────────────────────

async function writeToStrapi(translatedResults, sourceFields) {
  log("5/5", "Writing translations back to Strapi...");

  for (const [lang, fields] of Object.entries(translatedResults)) {
    validatePlaceholders(sourceFields, fields);
    await updateArticleLocale(STRAPI_DOCUMENT_ID, lang, fields);
    log("5/5", `✓ Updated Strapi locale [${lang}]`);
  }

  updateJob(CONTENT_ID, { status: "synced" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Translation Sync Pipeline ===\n");
  console.log(`Content ID  : ${CONTENT_ID}`);
  console.log(`Document ID : ${STRAPI_DOCUMENT_ID}`);
  console.log(`Source      : ${SOURCE_LOCALE}`);
  console.log(`Targets     : ${TARGET_LOCALES.join(", ")}`);
  console.log(`Smartcat TR : ${SMARTCAT_DOC_IDS.tr}`);
  console.log(`Smartcat ES : ${SMARTCAT_DOC_IDS["es-ES"]}`);
  console.log("");

  await testAuth();

  const sourcePayload = await fetchFromStrapi();
  await updateSmartcatDocuments(sourcePayload);

  const complete = await pollUntilComplete();

  if (!complete) {
    console.log("\n⚠  Pipeline paused — go to Smartcat and complete the translations.");
    console.log("   Then re-run: node sync.js\n");
    printJobSummary();
    process.exit(0);
  }

  const sourceFields = {};
  for (const [key, value] of Object.entries(sourcePayload)) {
    sourceFields[key.substring(key.indexOf(".") + 1)] = value;
  }

  const translatedResults = await downloadTranslations();
  await writeToStrapi(translatedResults, sourceFields);

  console.log("\n=== Pipeline Complete ===\n");
  printJobSummary();
}

main().catch((err) => {
  console.error("\n✗ Pipeline failed:", err.message);
  process.exit(1);
});
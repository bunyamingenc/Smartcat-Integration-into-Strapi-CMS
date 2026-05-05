// server.js — LocaleSync API
// Articles are explicitly registered with a Strapi documentId + Smartcat projectId pair.
// jobs.json is the registry. Strapi and Smartcat are data sources, not navigation.
// Usage: node server.js

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";

const app      = express();
const PORT     = 3000;
const REG_FILE = path.resolve("registry.json"); // registered article pairs

app.use(cors());
app.use(express.json());

// ─── Registry (replaces jobs.json for article tracking) ───────────────────────

function loadRegistry() {
  if (!fs.existsSync(REG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(REG_FILE, "utf-8")); } catch { return {}; }
}

function saveRegistry(reg) {
  fs.writeFileSync(REG_FILE, JSON.stringify(reg, null, 2), "utf-8");
}

// ─── Credentials ──────────────────────────────────────────────────────────────

function getCreds(req) {
  const strapiUrl   = req.headers["x-strapi-url"];
  const strapiToken = req.headers["x-strapi-token"];
  const strapiType  = req.headers["x-strapi-type"]   || "test-articles";
  const strapiLocale= req.headers["x-strapi-locale"]  || "en";
  const scServer    = req.headers["x-sc-server"];
  const scAccount   = req.headers["x-sc-account"];
  const scKey       = req.headers["x-sc-key"];
  if (!strapiUrl || !strapiToken || !scServer || !scAccount || !scKey) return null;
  const scAuth = "Basic " + Buffer.from(`${scAccount}:${scKey}`).toString("base64");
  return {
    strapiType, strapiLocale, scAuth, scServer,
    strapi:   axios.create({ baseURL: strapiUrl,                     headers: { Authorization: `Bearer ${strapiToken}` } }),
    smartcat: (projectId) => axios.create({ baseURL: `${scServer}/api/integration`, headers: { Authorization: scAuth } }),
    sc:       axios.create({ baseURL: `${scServer}/api/integration`, headers: { Authorization: scAuth } }),
  };
}

function noCreds(res) { return res.status(401).json({ error: "Missing credentials in Settings." }); }

function makeBody(contentId, fileContent) {
  const boundary = "--------------------SmartCATe8bf0f27d7";
  const CRLF = "\r\n";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${contentId}.json"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`, "utf8"),
    Buffer.from(fileContent, "utf8"),
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8"),
  ]);
  return { boundary, body };
}

// ─── GET /api/health ──────────────────────────────────────────────────────────

app.get("/api/health", async (req, res) => {
  const c = getCreds(req);
  if (!c) return res.json({ status: "unconfigured" });
  try {
    await c.sc.get("/v1/account");
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// ─── GET /api/projects ────────────────────────────────────────────────────────

app.get("/api/projects", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  try {
    const r = await c.sc.get("/v1/project/list");
    res.json({ data: (r.data || []).map((p) => ({ id: p.id, name: p.name, status: p.status, languages: p.targetLanguages || [] })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/registry ───────────────────────────────────────────────────────
// Returns all registered article entries enriched with live data from Strapi + Smartcat

app.get("/api/registry", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();

  const entries = await Promise.all(
    Object.values(reg).map(async (entry) => {
      const result = { ...entry };

      // Fetch article title from Strapi
      try {
        const r    = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
        const data = r.data?.data ?? r.data;
        const attrs = data?.attributes ?? data;
        result.title            = attrs?.title ?? "(untitled)";
        result.shortDescription = attrs?.shortDescription ?? null;
        result.publishedAt      = attrs?.publishedAt ?? null;
      } catch (e) {
        result.title = entry.title || "(could not fetch)";
        result.fetchError = e.response?.status === 404 ? "Article not found in Strapi" : e.message;
      }

      // Fetch translation status from Smartcat for each locale
      if (entry.smartcatDocumentIds && Object.keys(entry.smartcatDocumentIds).length > 0) {
        const localeStatuses = {};
        for (const [lang, docId] of Object.entries(entry.smartcatDocumentIds)) {
          if (!docId) { localeStatuses[lang] = { status: "error", progress: 0 }; continue; }
          try {
            const dr = await c.sc.get(`/v1/document?documentId=${docId}`);
            const doc = dr.data;
            const stage    = doc.workflowStages?.[0];
            const progress = doc.status?.toLowerCase() === "completed"
              ? 100
              : Math.round(stage?.progress ?? 0);
            const status   = doc.status?.toLowerCase() === "completed"
              ? "completed"
              : (stage?.status ?? doc.status ?? "unknown");

            localeStatuses[lang] = {
              status,
              progress,
              language: doc.targetLanguage,
            };
          } catch { localeStatuses[lang] = { status: "unknown", progress: 0 }; }
        }
        result.localeStatuses = localeStatuses;
      } else {
        result.localeStatuses = {};
      }

      // Fetch project name if not stored
      if (entry.smartcatProjectId && !entry.projectName) {
        try {
          const pr = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
          result.projectName    = pr.data?.name;
          result.targetLanguages = pr.data?.targetLanguages || [];
        } catch { result.projectName = entry.smartcatProjectId; }
      }

      return result;
    })
  );

  res.json({ data: entries });
});

// ─── POST /api/registry ───────────────────────────────────────────────────────
// Register a new article: { strapiDocumentId, smartcatProjectId, label? }

app.post("/api/registry", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const { strapiDocumentId, smartcatProjectId, label } = req.body;

  if (!strapiDocumentId || !smartcatProjectId) {
    return res.status(400).json({ error: "Both strapiDocumentId and smartcatProjectId are required." });
  }

  const reg = loadRegistry();
  const key = `${strapiDocumentId}::${smartcatProjectId}`;

  if (reg[key]) return res.status(409).json({ error: "This article + project pair is already registered." });

  // Validate both sides exist
  let title         = label || strapiDocumentId;
  let projectName   = smartcatProjectId;
  let targetLanguages = [];

  try {
    const r    = await c.strapi.get(`/api/${c.strapiType}/${strapiDocumentId}?locale=${c.strapiLocale}`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;
    title = attrs?.title || title;
  } catch (e) {
    return res.status(400).json({ error: `Could not find article in Strapi: ${e.response?.status === 404 ? "Not found" : e.message}` });
  }

  try {
    const pr = await c.sc.get(`/v1/project/${smartcatProjectId}`);
    projectName    = pr.data?.name || smartcatProjectId;
    targetLanguages = pr.data?.targetLanguages || [];
  } catch (e) {
    return res.status(400).json({ error: `Could not find project in Smartcat: ${e.response?.status === 404 ? "Not found" : e.message}` });
  }

  reg[key] = {
    key,
    strapiDocumentId,
    smartcatProjectId,
    projectName,
    targetLanguages,
    title,
    status:              "registered",
    smartcatDocumentIds: {},
    registeredAt:        new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
  };

  saveRegistry(reg);
  res.json({ data: reg[key] });
});

// ─── DELETE /api/registry/:key ────────────────────────────────────────────────
// Remove an article registration (does not delete from Strapi or Smartcat)

app.delete("/api/registry/:key", (req, res) => {
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  if (!reg[key]) return res.status(404).json({ error: "Entry not found" });
  delete reg[key];
  saveRegistry(reg);
  res.json({ deleted: true, key });
});

// ─── POST /api/registry/:key/send ────────────────────────────────────────────
// Push article content to Smartcat

app.post("/api/registry/:key/send", async (req, res) => {
  const c   = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  const contentId = "article-" + entry.strapiDocumentId.slice(0, 8);

  try {
    // Fetch article from Strapi
    const r    = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;

    const payload = {};
    for (const field of ["title", "shortDescription", "body"]) {
      const val = attrs[field];
      if (val && typeof val === "string" && val.trim()) payload[`${contentId}.${field}`] = val;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No translatable fields found. Fill in title, shortDescription, and body in Strapi." });
    }

    // Get Smartcat project documents
    console.log("[send] scServer:", c.scServer, "| scAuth:", c.scAuth?.slice(0, 20) + "...");
    console.log("[send] projectId:", entry.smartcatProjectId);
    const projectR  = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
    const documents = projectR.data?.documents || [];
    if (documents.length === 0) {
      return res.status(400).json({ error: "No documents in Smartcat project. Upload a template JSON file first." });
    }

    const fileContent        = JSON.stringify(payload, null, 2);
    const { boundary, body } = makeBody(contentId, fileContent);
    const docMap             = {};
    const updateResults      = {};
    const seen               = new Set();

    for (const doc of documents) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const lang = (doc.targetLanguage || "").toLowerCase().split("-")[0];
      try {
        await c.sc.put(`/v1/document/update?documentId=${doc.id}`, body, {
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
        });
        docMap[lang]        = doc.id;
        updateResults[lang] = "updated";
      } catch (e) {
        updateResults[lang] = `failed: ${e.response?.status}`;
      }
    }

    // Update registry
    reg[key].smartcatDocumentIds = docMap;
    reg[key].targetLanguages     = projectR.data?.targetLanguages || entry.targetLanguages;
    reg[key].status              = "uploaded";
    reg[key].updatedAt           = new Date().toISOString();
    saveRegistry(reg);

    res.json({ key, fieldsExtracted: Object.keys(payload), docMap, updateResults, status: "uploaded" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/registry/:key/pull ────────────────────────────────────────────
// Pull translated content from Smartcat → write back to Strapi

app.post("/api/registry/:key/pull", async (req, res) => {
  const c   = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });
  if (!entry.smartcatDocumentIds || Object.keys(entry.smartcatDocumentIds).length === 0) {
    return res.status(400).json({ error: "No Smartcat documents linked. Send to Smartcat first." });
  }

  const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = {};

  for (const [lang, docId] of Object.entries(entry.smartcatDocumentIds)) {
    if (!docId) { results[lang] = { status: "failed", reason: "no document ID" }; continue; }
    try {
      const exportR = await c.sc.post(`/v1/document/export?documentIds=${docId}`);
      const taskId  = exportR.data?.id ?? exportR.data;
      let translated = null;
      for (let i = 0; i < 15; i++) {
        await sleep(3000);
        try {
          const dlR = await c.sc.get(`/v1/document/export/${taskId}`, { responseType: "text", headers: { Accept: "application/octet-stream" } });
          if (dlR.status === 200 && dlR.data) { translated = JSON.parse(dlR.data); break; }
        } catch (e) { if (e.response?.status !== 204) break; }
      }
      if (!translated) { results[lang] = { status: "failed", reason: "export timed out" }; continue; }

      const fields = {};
      for (const [k, v] of Object.entries(translated)) fields[k.substring(k.indexOf(".") + 1)] = v;

      await c.strapi.put(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${lang}`, { data: fields });
      results[lang] = { status: "synced", fields: Object.keys(fields) };
    } catch (e) {
      results[lang] = { status: "failed", reason: e.message };
    }
  }

  const allSynced = Object.values(results).every((r) => r.status === "synced");
  reg[key].status    = allSynced ? "synced" : "partial";
  reg[key].updatedAt = new Date().toISOString();
  saveRegistry(reg);

  res.json({ key, results });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌐 LocaleSync API → http://localhost:${PORT}\n`);
});

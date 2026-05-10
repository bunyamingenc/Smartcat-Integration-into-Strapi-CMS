// server.js — LocaleSync API
// JSON send/pull + diff preview + XLIFF download/upload
// Usage: node server.js

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors    from "cors";
import axios   from "axios";
import fs      from "fs";
import path    from "path";
import { toXliff, fromXliff } from "./xliff.js";
import { logActivity, readActivity, clearActivity } from "./activityLog.js";

const app      = express();
const PORT     = 3000;
const REG_FILE = path.resolve("registry.json");

app.use(cors());
app.use(express.json({ limit: "5mb" }));
// Raw text body (for XLIFF uploads)
app.use(express.text({ type: ["application/xliff+xml", "application/xml", "text/xml", "text/plain"], limit: "5mb" }));

// ─── Registry ────────────────────────────────────────────────────────────────

function loadRegistry() {
  if (!fs.existsSync(REG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(REG_FILE, "utf-8")); } catch { return {}; }
}
function saveRegistry(reg) { fs.writeFileSync(REG_FILE, JSON.stringify(reg, null, 2), "utf-8"); }

// ─── Credentials ─────────────────────────────────────────────────────────────

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
    strapi: axios.create({ baseURL: strapiUrl,                     headers: { Authorization: `Bearer ${strapiToken}` } }),
    sc:     axios.create({ baseURL: `${scServer}/api/integration`, headers: { Authorization: scAuth } }),
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

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", async (req, res) => {
  const c = getCreds(req);
  if (!c) return res.json({ status: "unconfigured" });
  try {
    await c.sc.get("/v1/account");
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ status: "error", message: e.message }); }
});

// ─── Projects ─────────────────────────────────────────────────────────────────

app.get("/api/projects", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  try {
    const r = await c.sc.get("/v1/project/list");
    res.json({ data: (r.data || []).map((p) => ({ id: p.id, name: p.name, status: p.status, languages: p.targetLanguages || [] })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Registry list ────────────────────────────────────────────────────────────

app.get("/api/registry", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();

  const entries = await Promise.all(
    Object.values(reg).map(async (entry) => {
      const result = { ...entry };

      // ── Fetch article content from Strapi ──────────────────────────────────
      try {
        const r = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
        const data  = r.data?.data ?? r.data;
        const attrs = data?.attributes ?? data;
        result.title            = attrs?.title ?? "(untitled)";
        result.shortDescription = attrs?.shortDescription ?? null;
        result.publishedAt      = attrs?.publishedAt ?? null;
      } catch (e) {
        result.title      = entry.title || "(could not fetch)";
        result.fetchError = e.response?.status === 404 ? "Article not found in Strapi" : e.message;
      }

      // ── Fetch Strapi locales for THIS article ──────────────────────────────
      const strapiArticleLocales = new Set();
      strapiArticleLocales.add(c.strapiLocale.toLowerCase().split("-")[0]); // source always exists
      try {
        const localesR   = await c.strapi.get("/api/i18n/locales");
        const allGlobal  = (localesR.data || []).map((l) => l.code);
        for (const code of allGlobal) {
          try {
            const r    = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${code}`);
            const data = r.data?.data;
            const attrs = data?.attributes ?? data;
            const returned = (attrs?.locale || data?.locale || "").toLowerCase().split("-")[0];
            if (returned === code.toLowerCase().split("-")[0]) {
              strapiArticleLocales.add(returned);
            }
          } catch { /* 404 = not in this locale */ }
        }
      } catch { /* i18n locales endpoint failed */ }

      // ── Fetch Smartcat project: target languages + documents ───────────────
      let scTargetLangs = [];
      let scDocMap      = entry.smartcatDocumentIds || {}; // existing stored doc IDs
      let projectName   = entry.projectName;

      try {
        const pr   = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
        projectName    = pr.data?.name || entry.smartcatProjectId;
        scTargetLangs  = (pr.data?.targetLanguages || []).map((l) => l.toLowerCase().split("-")[0]);

        // Refresh document IDs from live project data
        const freshDocMap = {};
        for (const doc of pr.data?.documents || []) {
          const lang = (doc.targetLanguage || "").toLowerCase().split("-")[0];
          if (lang) freshDocMap[lang] = doc.id;
        }
        // Merge: prefer fresh data, keep stored for anything not returned
        scDocMap = { ...scDocMap, ...freshDocMap };
      } catch { /* Smartcat unreachable */ }

      result.projectName = projectName;

      // ── Build unified locale list ──────────────────────────────────────────
      // Source = source locale (always first)
      // Then union of: Strapi article locales + Smartcat target languages
      const sourceLang   = c.strapiLocale.toLowerCase().split("-")[0];
      const allLangCodes = new Set([
        ...Array.from(strapiArticleLocales).filter((l) => l !== sourceLang),
        ...scTargetLangs,
      ]);

      // For each language, determine its membership
      const unifiedLocales = Array.from(allLangCodes).map((lang) => {
        const inStrapi   = strapiArticleLocales.has(lang);
        const inSmartcat = scTargetLangs.includes(lang);
        const hasDoc     = !!scDocMap[lang];
        return {
          code:      lang,
          inStrapi,
          inSmartcat,
          hasDoc,
          source:    inStrapi && inSmartcat ? "both"
                   : inStrapi              ? "strapi-only"
                   : hasDoc                ? "smartcat-with-doc"
                   :                         "smartcat-no-doc",
        };
      });

      result.unifiedLocales  = unifiedLocales;
      result.targetLanguages = scTargetLangs; // keep for backwards compat

      // ── Fetch translation status for locales that have Smartcat docs ───────
      const localeStatuses = {};
      for (const loc of unifiedLocales) {
        const docId = scDocMap[loc.code];
        if (!docId) {
          localeStatuses[loc.code] = { status: "no-doc", progress: 0 };
          continue;
        }
        try {
          const dr    = await c.sc.get(`/v1/document?documentId=${docId}`);
          const doc   = dr.data;
          const stage = doc.workflowStages?.[0];
          const progress = doc.status?.toLowerCase() === "completed"
            ? 100 : Math.round(stage?.progress ?? 0);
          const status = doc.status?.toLowerCase() === "completed"
            ? "completed"
            : (stage?.status ?? doc.status ?? "unknown");
          localeStatuses[loc.code] = { status, progress, language: doc.targetLanguage };
        } catch {
          localeStatuses[loc.code] = { status: "unknown", progress: 0 };
        }
      }

      result.localeStatuses      = localeStatuses;
      result.smartcatDocumentIds = scDocMap; // persist fresh doc map

      return result;
    })
  );

  res.json({ data: entries });
});

// ─── Register article ────────────────────────────────────────────────────────

app.post("/api/registry", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const { strapiDocumentId, smartcatProjectId, label } = req.body;
  if (!strapiDocumentId || !smartcatProjectId) return res.status(400).json({ error: "Both fields required." });

  const reg = loadRegistry();
  const key = `${strapiDocumentId}::${smartcatProjectId}`;
  if (reg[key]) return res.status(409).json({ error: "This article + project pair is already registered." });

  let title = label || strapiDocumentId;
  let projectName = smartcatProjectId;
  let targetLanguages = [];

  try {
    const r = await c.strapi.get(`/api/${c.strapiType}/${strapiDocumentId}?locale=${c.strapiLocale}`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;
    title = attrs?.title || title;
  } catch (e) {
    return res.status(400).json({ error: `Strapi: ${e.response?.status === 404 ? "Not found" : e.message}` });
  }
  try {
    const pr = await c.sc.get(`/v1/project/${smartcatProjectId}`);
    projectName = pr.data?.name || smartcatProjectId;
    targetLanguages = pr.data?.targetLanguages || [];
  } catch (e) {
    return res.status(400).json({ error: `Smartcat: ${e.response?.status === 404 ? "Not found" : e.message}` });
  }

  reg[key] = {
    key, strapiDocumentId, smartcatProjectId, projectName, targetLanguages,
    title, status: "registered", smartcatDocumentIds: {},
    registeredAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  saveRegistry(reg);
  logActivity("register", { articleTitle: title, key, strapiDocumentId, smartcatProjectId, projectName });
  res.json({ data: reg[key] });
});

// ─── Remove ──────────────────────────────────────────────────────────────────

app.delete("/api/registry/:key", (req, res) => {
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  if (!reg[key]) return res.status(404).json({ error: "Entry not found" });
  const removed = reg[key];
  delete reg[key];
  saveRegistry(reg);
  logActivity("remove", { articleTitle: removed.title, key });
  res.json({ deleted: true, key });
});

// ─── Diff ────────────────────────────────────────────────────────────────────

app.get("/api/registry/:key/diff", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  try {
    const r = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;
    const current = {};
    for (const field of ["title", "shortDescription", "body"]) {
      const val = attrs[field];
      if (val && typeof val === "string") current[field] = val;
    }

    const snapshot = entry.lastSentSnapshot || {};
    const changes  = [];
    for (const field of ["title", "shortDescription", "body"]) {
      const oldVal = snapshot[field] ?? "";
      const newVal = current[field]  ?? "";
      if (oldVal !== newVal) {
        changes.push({
          field, oldValue: oldVal, newValue: newVal,
          isNew: !oldVal, isRemoved: !newVal,
        });
      }
    }

    res.json({
      hasSnapshot:  Object.keys(snapshot).length > 0,
      hasChanges:   changes.length > 0,
      changes,
      currentFields: Object.keys(current),
      lastSentAt:   entry.lastSentAt || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Send (JSON to Smartcat) ─────────────────────────────────────────────────

app.post("/api/registry/:key/send", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  const contentId = "article-" + entry.strapiDocumentId.slice(0, 8);

  try {
    const r = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;

    const payload = {};
    for (const field of ["title", "shortDescription", "body"]) {
      const val = attrs[field];
      if (val && typeof val === "string" && val.trim()) payload[`${contentId}.${field}`] = val;
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No translatable fields found." });
    }

    const projectR  = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
    const documents = projectR.data?.documents || [];
    if (documents.length === 0) return res.status(400).json({ error: "No documents in Smartcat project." });

    const fileContent = JSON.stringify(payload, null, 2);
    const { boundary, body } = makeBody(contentId, fileContent);
    const docMap = {};
    const updateResults = {};
    const seen = new Set();

    for (const doc of documents) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const lang = (doc.targetLanguage || "").toLowerCase().split("-")[0];
      try {
        await c.sc.put(`/v1/document/update?documentId=${doc.id}`, body, {
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
        });
        docMap[lang] = doc.id;
        updateResults[lang] = "updated";
      } catch (e) { updateResults[lang] = `failed: ${e.response?.status}`; }
    }

    const snapshot = {};
    for (const [k, v] of Object.entries(payload)) snapshot[k.substring(k.indexOf(".") + 1)] = v;

    reg[key].smartcatDocumentIds = docMap;
    reg[key].targetLanguages = projectR.data?.targetLanguages || entry.targetLanguages;
    reg[key].status = "uploaded";
    reg[key].updatedAt = new Date().toISOString();
    reg[key].lastSentSnapshot = snapshot;
    reg[key].lastSentAt = new Date().toISOString();
    saveRegistry(reg);

    logActivity("send", {
      articleTitle: attrs.title,
      key,
      projectName:  entry.projectName,
      fieldsExtracted: Object.keys(payload),
      updateResults,
    });
    res.json({ key, fieldsExtracted: Object.keys(payload), docMap, updateResults, status: "uploaded" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Pull (Smartcat to Strapi) ───────────────────────────────────────────────

app.post("/api/registry/:key/pull", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });
  if (!entry.smartcatDocumentIds || Object.keys(entry.smartcatDocumentIds).length === 0) {
    return res.status(400).json({ error: "No Smartcat documents linked. Send first." });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = {};

  for (const [lang, docId] of Object.entries(entry.smartcatDocumentIds)) {
    if (!docId) { results[lang] = { status: "failed", reason: "no document ID" }; continue; }
    try {
      const exportR = await c.sc.post(`/v1/document/export?documentIds=${docId}`);
      const taskId = exportR.data?.id ?? exportR.data;
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
    } catch (e) { results[lang] = { status: "failed", reason: e.message }; }
  }

  const allSynced = Object.values(results).every((r) => r.status === "synced");
  reg[key].status = allSynced ? "synced" : "partial";
  reg[key].updatedAt = new Date().toISOString();
  saveRegistry(reg);
  logActivity("pull", { articleTitle: entry.title, key, results, allSynced });
  res.json({ key, results });
});

// ─── XLIFF download ──────────────────────────────────────────────────────────
// GET /api/registry/:key/xliff?lang=tr  →  application/xliff+xml

app.get("/api/registry/:key/xliff", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  const targetLang = (req.query.lang || "").toString().toLowerCase().split("-")[0];
  if (!targetLang) return res.status(400).json({ error: "Missing ?lang=" });

  const contentId = "article-" + entry.strapiDocumentId.slice(0, 8);

  try {
    const r = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
    const data = r.data?.data ?? r.data;
    const attrs = data?.attributes ?? data;

    const payload = {};
    for (const field of ["title", "shortDescription", "body"]) {
      const val = attrs[field];
      if (val && typeof val === "string" && val.trim()) payload[`${contentId}.${field}`] = val;
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No translatable fields found." });
    }

    // Optionally include existing translation as <target>
    let translations = null;
    try {
      const tr = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${targetLang}&populate=*`);
      const tdata = tr.data?.data ?? tr.data;
      const tattrs = tdata?.attributes ?? tdata;
      translations = {};
      for (const field of ["title", "shortDescription", "body"]) {
        if (tattrs[field]) translations[`${contentId}.${field}`] = tattrs[field];
      }
    } catch { /* no existing translation, ignore */ }

    const xml = toXliff(payload, { sourceLang: c.strapiLocale, targetLang, translations });

    const filename = `${contentId}.${targetLang}.xlf`;
    res.setHeader("Content-Type", "application/xliff+xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    logActivity("xliff-download", { articleTitle: entry.title, key, lang: targetLang, filename });
    res.send(xml);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── XLIFF upload ────────────────────────────────────────────────────────────
// POST /api/registry/:key/xliff?lang=tr  body: raw XLIFF XML

app.post("/api/registry/:key/xliff", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  const targetLang = (req.query.lang || "").toString().toLowerCase().split("-")[0];
  if (!targetLang) return res.status(400).json({ error: "Missing ?lang=" });

  const xml = typeof req.body === "string" ? req.body : "";
  if (!xml.trim()) return res.status(400).json({ error: "Empty XLIFF body" });

  try {
    const flat = fromXliff(xml);

    // Strip contentId prefix → field map
    const fields = {};
    for (const [k, v] of Object.entries(flat)) {
      const dot = k.indexOf(".");
      if (dot === -1) continue;
      fields[k.substring(dot + 1)] = v;
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "XLIFF parsed but no usable fields found." });
    }

    await c.strapi.put(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${targetLang}`, { data: fields });

    reg[key].updatedAt = new Date().toISOString();
    saveRegistry(reg);

    logActivity("xliff-upload", { articleTitle: entry.title, key, lang: targetLang, fields: Object.keys(fields) });
    res.json({ key, lang: targetLang, fields: Object.keys(fields), status: "synced" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Locale parity check ──────────────────────────────────────────────────────
// GET /api/registry/:key/locales → reports Strapi vs Smartcat locale alignment

app.get("/api/registry/:key/locales", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  try {
    // List Strapi global locales
    let allGlobalLocales = [];
    try {
      const r2 = await c.strapi.get("/api/i18n/locales");
      allGlobalLocales = (r2.data || []).map((l) => l.code);
    } catch { allGlobalLocales = [c.strapiLocale]; }

    // For each global locale, check whether THIS article exists in it
    const strapiLocales = [];
    for (const code of allGlobalLocales) {
      try {
        const r    = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${code}`);
        const data = r.data?.data;
        const attrs = data?.attributes ?? data;
        // Strapi v5 returns the document in the requested locale if it exists,
        // or 404 if it doesn't. Check the locale field to confirm.
        const returnedLocale = (attrs?.locale || data?.locale || "").toLowerCase().split("-")[0];
        const requestedCode  = code.toLowerCase().split("-")[0];
        if (returnedLocale === requestedCode) {
          strapiLocales.push(code);
        }
      } catch (e) {
        // 404 = article doesn't exist in this locale — expected, skip it
        if (e.response?.status !== 404) {
          console.warn(`[locales] Unexpected error for locale ${code}:`, e.message);
        }
      }
    }

    // Make sure source locale is always included
    if (!strapiLocales.includes(c.strapiLocale)) strapiLocales.unshift(c.strapiLocale);

    // Smartcat target languages
    const projectR   = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
    const scLangs    = (projectR.data?.targetLanguages || []).map((l) => l.toLowerCase().split("-")[0]);
    const sourceLang = (projectR.data?.sourceLanguage || c.strapiLocale).toLowerCase().split("-")[0];

    const strapiNorm   = strapiLocales.map((l) => l.toLowerCase().split("-")[0]);
    const smartcatLocales = [sourceLang, ...scLangs];
    const smartcatNorm    = smartcatLocales.map((l) => l.toLowerCase().split("-")[0]);

    const common       = strapiNorm.filter((l) => smartcatNorm.includes(l));
    const strapiOnly   = strapiNorm.filter((l) => !smartcatNorm.includes(l));
    const smartcatOnly = smartcatNorm.filter((l) => !strapiNorm.includes(l));

    res.json({
      strapi:           strapiLocales,
      smartcat:         smartcatLocales,
      sourceLocale:     c.strapiLocale,
      strapiGlobal:     allGlobalLocales,
      common,
      strapiOnly,
      smartcatOnly,
      smartcatOnly,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Initialize missing Strapi locales ───────────────────────────────────────
// POST /api/registry/:key/init-locales
// For every Strapi global locale, if this article doesn't have it yet,
// copy source-locale content into a new locale entry.

app.post("/api/registry/:key/init-locales", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  try {
    // Fetch source content
    const sourceR = await c.strapi.get(
      `/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`
    );
    const sourceData  = sourceR.data?.data ?? sourceR.data;
    const sourceAttrs = sourceData?.attributes ?? sourceData;
    const sourceFields = {};
    for (const field of ["title", "shortDescription", "body"]) {
      if (sourceAttrs[field]) sourceFields[field] = sourceAttrs[field];
    }
    if (Object.keys(sourceFields).length === 0) {
      return res.status(400).json({ error: "Source article has no content to copy." });
    }

    // List all Strapi global locales
    const localesR = await c.strapi.get("/api/i18n/locales");
    const allLocales = (localesR.data || []).map((l) => l.code);

    // Determine target locales (everything except source)
    const targets = (req.body?.locales && Array.isArray(req.body.locales) && req.body.locales.length > 0)
      ? req.body.locales
      : allLocales.filter((l) => l !== c.strapiLocale);

    const results = {};
    for (const lang of targets) {
      try {
        // Check if locale already exists for this article
        let exists = false;
        try {
          const check = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${lang}`);
          exists = !!(check.data?.data || check.data?.id);
        } catch { exists = false; }

        if (exists && !req.body?.overwrite) {
          results[lang] = { status: "skipped", reason: "locale already exists" };
          continue;
        }

        // Create or update
        await c.strapi.put(
          `/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${lang}`,
          { data: sourceFields }
        );
        results[lang] = { status: "initialized", fields: Object.keys(sourceFields) };
      } catch (e) {
        results[lang] = { status: "failed", reason: e.response?.data?.error?.message || e.message };
      }
    }

    logActivity("init-locales", { articleTitle: entry.title, key, results });
    res.json({ key, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Add Smartcat-only locales into Strapi ───────────────────────────────────
// POST /api/registry/:key/add-strapi-locales
// For each Smartcat target language not yet in Strapi, create the locale entry
// (also creates the global Strapi locale if needed)

app.post("/api/registry/:key/add-strapi-locales", async (req, res) => {
  const c = getCreds(req);
  if (!c) return noCreds(res);
  const reg = loadRegistry();
  const key = decodeURIComponent(req.params.key);
  const entry = reg[key];
  if (!entry) return res.status(404).json({ error: "Registry entry not found" });

  try {
    // Smartcat target languages
    const projectR = await c.sc.get(`/v1/project/${entry.smartcatProjectId}`);
    const scLangs  = (projectR.data?.targetLanguages || [])
      .map((l) => l.toLowerCase().split("-")[0]);

    // Strapi global locales
    const localesR     = await c.strapi.get("/api/i18n/locales");
    const strapiLocales = (localesR.data || []).map((l) => l.code.toLowerCase().split("-")[0]);

    // Source content to seed new locales
    const sourceR = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${c.strapiLocale}&populate=*`);
    const sourceData  = sourceR.data?.data ?? sourceR.data;
    const sourceAttrs = sourceData?.attributes ?? sourceData;
    const sourceFields = {};
    for (const field of ["title", "shortDescription", "body"]) {
      if (sourceAttrs[field]) sourceFields[field] = sourceAttrs[field];
    }

    const results = {};
    const missingGlobal = []; // locales that need to be added manually in Strapi admin

    for (const lang of scLangs) {
      const langNorm    = lang.toLowerCase().split("-")[0];
      const globalExists = strapiLocales.some((l) => l.toLowerCase().split("-")[0] === langNorm);

      // Strapi v5 does NOT allow creating global locales via REST API.
      // They must be added manually: Settings → Internationalization → Add new locale
      if (!globalExists) {
        missingGlobal.push(langNorm);
        results[lang] = {
          status: "needs-manual-setup",
          reason: `Locale "${langNorm}" must be added manually in Strapi Admin → Settings → Internationalization first.`,
        };
        continue;
      }

      // Global locale exists — check if this article has an entry in it
      let articleExists = false;
      try {
        const check = await c.strapi.get(`/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${langNorm}`);
        const checkData  = check.data?.data;
        const checkAttrs = checkData?.attributes ?? checkData;
        const returnedLocale = (checkAttrs?.locale || checkData?.locale || "").toLowerCase().split("-")[0];
        articleExists = returnedLocale === langNorm;
      } catch { articleExists = false; }

      if (articleExists) {
        results[lang] = { status: "exists", reason: "Article entry already exists in this locale" };
        continue;
      }

      // Create the article entry by copying source content
      try {
        await c.strapi.put(
          `/api/${c.strapiType}/${entry.strapiDocumentId}?locale=${langNorm}`,
          { data: sourceFields }
        );
        results[lang] = { status: "initialized", fields: Object.keys(sourceFields) };
      } catch (e) {
        const errMsg = e.response?.data?.error?.message || JSON.stringify(e.response?.data) || e.message;
        results[lang] = { status: "failed", reason: errMsg };
      }
    }

    res.json({
      key,
      results,
      missingGlobal,
      manualStepsRequired: missingGlobal.length > 0,
      instruction: missingGlobal.length > 0
        ? `Go to Strapi Admin → Settings → Internationalization → Add new locale for: ${missingGlobal.join(", ")}. Then click this button again.`
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Activity log ─────────────────────────────────────────────────────────────

app.get("/api/activity", (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 25);
  res.json(readActivity(page, limit));
});

app.delete("/api/activity", (req, res) => {
  clearActivity();
  res.json({ cleared: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌐 LocaleSync API → http://localhost:${PORT}\n`);
});

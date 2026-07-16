// src/api/client.js
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000/api";

function getHeaders() {
  const s = JSON.parse(localStorage.getItem("localesync_settings") || "{}");
  return {
    "Content-Type":    "application/json",
    "x-strapi-url":    s.strapiUrl    || "",
    "x-strapi-token":  s.strapiToken  || "",
    "x-strapi-type":   s.strapiType   || "test-articles",
    "x-strapi-locale": s.strapiLocale || "en",
    "x-sc-server":     s.scServer     || "",
    "x-sc-account":    s.scAccount    || "",
    "x-sc-key":        s.scKey        || "",
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ─── Standard endpoints ───────────────────────────────────────────────────────

export const getHealth          = ()      => request("/health");
export const getProjects        = ()      => request("/projects").then((r) => r.data);

export const getRegistry        = ()      => request("/registry").then((r) => r.data);
export const addToRegistry      = (body)  => request("/registry", { method: "POST", body: JSON.stringify(body) });
export const removeFromRegistry = (key)   => request(`/registry/${encodeURIComponent(key)}`, { method: "DELETE" });

export const sendEntry          = (key)   => request(`/registry/${encodeURIComponent(key)}/send`, { method: "POST" });
export const pullEntry          = (key)   => request(`/registry/${encodeURIComponent(key)}/pull`, { method: "POST" });

// ─── Locale parity / initialization ───────────────────────────────────────────

export const getLocales         = (key)   => request(`/registry/${encodeURIComponent(key)}/locales`);
export const initLocales        = (key, body = {}) => request(`/registry/${encodeURIComponent(key)}/init-locales`, { method: "POST", body: JSON.stringify(body) });
export const addStrapiLocales   = (key)   => request(`/registry/${encodeURIComponent(key)}/add-strapi-locales`, { method: "POST" });

// ─── Activity log ─────────────────────────────────────────────────────────────

export const getActivity   = (page = 1, limit = 25) => request(`/activity?page=${page}&limit=${limit}`);
export const clearActivity = ()                      => request("/activity", { method: "DELETE" });

// ─── XLIFF download ───────────────────────────────────────────────────────────

export async function downloadXliff(key, lang) {
  const res = await fetch(`${BASE}/registry/${encodeURIComponent(key)}/xliff?lang=${encodeURIComponent(lang)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Download failed");
  }

  // Try to use server-supplied filename
  const disp     = res.headers.get("Content-Disposition") || "";
  const match    = disp.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `translation.${lang}.xlf`;

  const xml  = await res.text();
  const blob = new Blob([xml], { type: "application/xliff+xml" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename };
}

// ─── XLIFF upload ─────────────────────────────────────────────────────────────

export async function uploadXliff(key, lang, xmlText) {
  const headers = getHeaders();
  headers["Content-Type"] = "application/xliff+xml";

  const res = await fetch(`${BASE}/registry/${encodeURIComponent(key)}/xliff?lang=${encodeURIComponent(lang)}`, {
    method:  "POST",
    headers,
    body:    xmlText,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export function getSettings()          { return JSON.parse(localStorage.getItem("localesync_settings") || "{}"); }
export function saveSettings(s)        { localStorage.setItem("localesync_settings", JSON.stringify(s)); }
export function hasSettings() {
  const s = getSettings();
  return !!(s.strapiUrl && s.strapiToken && s.scServer && s.scAccount && s.scKey);
}
export function getSavedProjects()     { return getSettings().scProjects || []; }
export function getActiveProjectId()   { const s = getSettings(); return s.activeProjectId || s.scProjects?.[0]?.id || ""; }
export function setActiveProject(id)   { const s = getSettings(); s.activeProjectId = id; saveSettings(s); }

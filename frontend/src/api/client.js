// src/api/client.js
const BASE = "http://localhost:3000/api";

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

// Health + projects
export const getHealth   = ()      => request("/health");
export const getProjects = ()      => request("/projects").then((r) => r.data);

// Registry (article + project pairs)
export const getRegistry     = ()    => request("/registry").then((r) => r.data);
export const addToRegistry   = (body) => request("/registry", { method: "POST", body: JSON.stringify(body) });
export const removeFromRegistry = (key) => request(`/registry/${encodeURIComponent(key)}`, { method: "DELETE" });

// Per-entry actions
export const sendEntry  = (key) => request(`/registry/${encodeURIComponent(key)}/send`, { method: "POST" });
export const pullEntry  = (key) => request(`/registry/${encodeURIComponent(key)}/pull`, { method: "POST" });

// Settings
export function getSettings()          { return JSON.parse(localStorage.getItem("localesync_settings") || "{}"); }
export function saveSettings(s)        { localStorage.setItem("localesync_settings", JSON.stringify(s)); }
export function hasSettings() {
  const s = getSettings();
  return !!(s.strapiUrl && s.strapiToken && s.scServer && s.scAccount && s.scKey);
}

// Projects list in settings
export function getSavedProjects()     { return getSettings().scProjects || []; }
export function getActiveProjectId()   { const s = getSettings(); return s.activeProjectId || s.scProjects?.[0]?.id || ""; }
export function setActiveProject(id)   {
  const s = getSettings(); s.activeProjectId = id; saveSettings(s);
}

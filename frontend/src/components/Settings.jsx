// src/components/Settings.jsx
import { useState } from "react";
import { getSettings, saveSettings } from "../api/client";
import { useToast } from "./Toast";

const FIELDS = [
  {
    section: "Strapi",
    fields: [
      { key: "strapiUrl",    label: "Strapi URL",    placeholder: "http://localhost:1337",  type: "text"     },
      { key: "strapiToken",  label: "API Token",     placeholder: "your-strapi-api-token",  type: "password" },
      { key: "strapiType",   label: "Content Type",  placeholder: "test-articles",          type: "text"     },
      { key: "strapiLocale", label: "Source Locale", placeholder: "en",                     type: "text"     },
    ],
  },
  {
    section: "Smartcat",
    fields: [
      { key: "scServer",  label: "Server URL",  placeholder: "https://smartcat.ai",      type: "text"     },
      { key: "scAccount", label: "Account ID",  placeholder: "your-account-id",          type: "text"     },
      { key: "scKey",     label: "API Key",     placeholder: "your-api-key",             type: "password" },
    ],
  },
];

const SAVED_PROJECTS_SECTION = true;

export default function Settings({ onSaved }) {
  const [form, setForm]               = useState(() => getSettings());
  const [show, setShow]               = useState({});
  const [newProject, setNewProject]   = useState({ id: "", name: "" });
  const { add: toast }                = useToast();

  const projects = form.scProjects || [];

  function handleChange(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  function handleAddProject() {
    if (!newProject.id.trim()) { toast("Project ID is required", "error"); return; }
    if (projects.find((p) => p.id === newProject.id.trim())) { toast("Already added", "warning"); return; }
    const updated = [...projects, { id: newProject.id.trim(), name: newProject.name.trim() || newProject.id.trim() }];
    setForm((f) => ({ ...f, scProjects: updated, activeProjectId: f.activeProjectId || updated[0].id }));
    setNewProject({ id: "", name: "" });
    toast("Project added ✓", "success");
  }

  function handleRemoveProject(id) {
    const updated = projects.filter((p) => p.id !== id);
    setForm((f) => ({ ...f, scProjects: updated, activeProjectId: f.activeProjectId === id ? (updated[0]?.id ?? "") : f.activeProjectId }));
  }

  function handleSave() {
    saveSettings(form);
    toast("Settings saved ✓", "success");
    onSaved?.();
  }

  function handleClear() {
    if (!confirm("Clear all saved settings?")) return;
    localStorage.removeItem("localesync_settings");
    setForm({});
    toast("Settings cleared", "info");
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Settings</h2>
          <p className="section-sub">Credentials stored locally in your browser.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClear}>Clear all</button>
          <button className="btn btn-primary" onClick={handleSave}>Save settings</button>
        </div>
      </div>

      <div className="settings-grid">
        {FIELDS.map(({ section, fields }) => (
          <div key={section} className="settings-card">
            <h3 className="settings-section-title">{section}</h3>
            <div className="settings-fields">
              {fields.map(({ key, label, placeholder, type }) => (
                <div key={key} className="settings-field">
                  <label className="settings-label">{label}</label>
                  <div className="settings-input-wrap">
                    <input
                      className="settings-input"
                      type={type === "password" && !show[key] ? "password" : "text"}
                      value={form[key] || ""}
                      placeholder={placeholder}
                      onChange={(e) => handleChange(key, e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {type === "password" && (
                      <button className="settings-eye" onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))} tabIndex={-1}>
                        {show[key] ? "🙈" : "👁"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Saved projects for the header quick-switch */}
      <div className="settings-card settings-card-full" style={{ marginBottom: "1.25rem" }}>
        <h3 className="settings-section-title">Saved Projects (for quick-switch)</h3>
        <p className="settings-card-desc" style={{ marginBottom: "1rem" }}>
          Save project IDs with labels for the header quick-switch. Smartcat project IDs are also entered per-article when you click "+ Add Article".
        </p>
        {projects.length > 0 && (
          <div className="project-list">
            {projects.map((p) => (
              <div key={p.id} className={`project-row ${form.activeProjectId === p.id ? "project-active" : ""}`}>
                <div className="project-row-info">
                  <span className="project-name">{p.name}</span>
                  <span className="project-id-label">{p.id}</span>
                </div>
                <div className="project-row-actions">
                  {form.activeProjectId === p.id
                    ? <span className="project-active-badge">● Default</span>
                    : <button className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, activeProjectId: p.id }))}>Set default</button>
                  }
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={() => handleRemoveProject(p.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="project-add-row">
          <input className="settings-input" placeholder="Project ID" value={newProject.id} onChange={(e) => setNewProject((p) => ({ ...p, id: e.target.value }))} spellCheck={false} style={{ flex: 2 }} />
          <input className="settings-input" placeholder="Label (e.g. Blog)" value={newProject.name} onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))} spellCheck={false} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={handleAddProject}>+ Add</button>
        </div>
      </div>

      {/* XLIFF download preference */}
      <div className="settings-card settings-card-full" style={{ marginBottom: "1.25rem" }}>
        <h3 className="settings-section-title">XLIFF</h3>
        <p className="settings-card-desc" style={{ marginBottom: "1rem" }}>
          Which XLIFF version to use when you click the <strong>↓</strong> download button in an article.
          Uploads (<strong>↑</strong>) auto-detect the version, so this only affects downloads.
        </p>
        <div className="xliff-version-toggle">
          <button
            className={`xliff-version-btn ${(form.xliffVersion || "1.2") === "1.2" ? "active" : ""}`}
            onClick={() => setForm((f) => ({ ...f, xliffVersion: "1.2" }))}
          >
            XLIFF 1.2
            <span className="xliff-version-hint">MemoQ, Trados, OmegaT, Phrase</span>
          </button>
          <button
            className={`xliff-version-btn ${form.xliffVersion === "2.0" ? "active" : ""}`}
            onClick={() => setForm((f) => ({ ...f, xliffVersion: "2.0" }))}
          >
            XLIFF 2.0
            <span className="xliff-version-hint">Newer tools, cleaner structure</span>
          </button>
        </div>
      </div>

      <div className="settings-note">
        <span className="settings-note-icon">🔒</span>
        Credentials stored in localStorage and sent as request headers to the local API server only.
      </div>
    </section>
  );
}

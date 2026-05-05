// src/components/ArticleModal.jsx
// Opens when user clicks an article card or clicks "+ Add Article"
import { useState } from "react";
import StatusBadge from "./StatusBadge";
import { sendEntry, pullEntry, removeFromRegistry, addToRegistry, getActiveProjectId } from "../api/client";
import { useToast } from "./Toast";

// ─── Add Article Modal ────────────────────────────────────────────────────────

export function AddArticleModal({ onClose, onAdded }) {
  const [form, setForm]     = useState({ strapiDocumentId: "", smartcatProjectId: getActiveProjectId() || "" });
  const [loading, setLoading] = useState(false);
  const { add: toast }      = useToast();

  async function handleAdd() {
    if (!form.strapiDocumentId.trim() || !form.smartcatProjectId.trim()) {
      toast("Both fields are required", "error"); return;
    }
    setLoading(true);
    try {
      await addToRegistry(form);
      toast("Article registered ✓", "success");
      onAdded();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Register Article</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <p className="modal-desc">
          Link a Strapi article to a Smartcat project. Find the Strapi document ID in the URL when editing an article.
          Find the Smartcat project ID in the project URL.
        </p>

        <div className="modal-fields">
          <div className="settings-field">
            <label className="settings-label">Strapi Document ID</label>
            <input
              className="settings-input"
              placeholder="e.g. es4at21li5dwtoqpe56g6om9"
              value={form.strapiDocumentId}
              onChange={(e) => setForm((f) => ({ ...f, strapiDocumentId: e.target.value.trim() }))}
              spellCheck={false}
              autoFocus
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">Smartcat Project ID</label>
            <input
              className="settings-input"
              placeholder="e.g. 23bb1442-4ae7-4c62-ace2-061d0ac2e48f"
              value={form.smartcatProjectId}
              onChange={(e) => setForm((f) => ({ ...f, smartcatProjectId: e.target.value.trim() }))}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="modal-hint">
          <span>💡</span>
          <span>The app will validate both IDs against Strapi and Smartcat before saving.</span>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? "Validating…" : "Register article"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Article Detail Modal ─────────────────────────────────────────────────────

export function ArticleDetailModal({ entry, onClose, onRefresh }) {
  const [sending,  setSending]  = useState(false);
  const [pulling,  setPulling]  = useState(false);
  const [removing, setRemoving] = useState(false);
  const { add: toast }          = useToast();

  const localeEntries = Object.entries(entry.localeStatuses || {});
  const overallPct    = localeEntries.length > 0
    ? Math.round(localeEntries.reduce((s, [, v]) => s + (v.progress ?? 0), 0) / localeEntries.length)
    : 0;

  async function handleSend() {
    setSending(true);
    try {
      const result = await sendEntry(entry.key);
      const summary = Object.entries(result.updateResults || {})
        .map(([l, s]) => `${l}: ${s}`).join(", ");
      toast(`Sent to Smartcat ✓ (${summary})`, "success");
      onRefresh();
    } catch (e) { toast(e.message, "error"); }
    finally { setSending(false); }
  }

  async function handlePull() {
    const confirmed = confirm(overallPct < 100
      ? `Translations are ${overallPct}% complete. Pull partial translations anyway?`
      : "Pull all completed translations into Strapi?");
    if (!confirmed) return;

    setPulling(true);
    try {
      const result = await pullEntry(entry.key);
      const allOk  = Object.values(result.results).every((r) => r.status === "synced");
      toast(allOk ? "All translations synced ✓" : "Some translations failed — check status", allOk ? "success" : "warning");
      onRefresh();
    } catch (e) { toast(e.message, "error"); }
    finally { setPulling(false); }
  }

  async function handleRemove() {
    if (!confirm(`Remove "${entry.title}" from LocaleSync?\n\nThis does not delete the article in Strapi or Smartcat.`)) return;
    setRemoving(true);
    try {
      await removeFromRegistry(entry.key);
      toast(`"${entry.title}" removed`, "info");
      onRefresh();
      onClose();
    } catch (e) { toast(e.message, "error"); }
    finally { setRemoving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{entry.title}</h2>
            <p className="modal-subtitle">{entry.projectName || entry.smartcatProjectId}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* IDs */}
        <div className="modal-ids">
          <span className="modal-id-item"><span className="modal-id-label">Strapi</span>{entry.strapiDocumentId}</span>
          <span className="modal-id-item"><span className="modal-id-label">Smartcat</span>{entry.smartcatProjectId.slice(0, 18)}…</span>
        </div>

        {/* Locale status table */}
        <div className="locale-table">
          <div className="locale-table-header">
            <span>Language</span>
            <span>Progress</span>
            <span>Status</span>
          </div>

          {/* Source locale */}
          <div className="locale-table-row source-row">
            <span className="locale-lang">
              <span className="locale-flag">EN</span>
              <span className="locale-name">Source (English)</span>
            </span>
            <span>—</span>
            <StatusBadge status={entry.status} />
          </div>

          {/* Target locales */}
          {(entry.targetLanguages || []).map((lang) => {
            const code    = lang.toLowerCase().split("-")[0];
            const s       = entry.localeStatuses?.[code] || {};
            const pct     = s.status?.toLowerCase() === "completed" ? 100 : (s.progress ?? 0);
            const done    = pct === 100;
            return (
              <div key={lang} className="locale-table-row">
                <span className="locale-lang">
                  <span className="locale-flag">{code.toUpperCase()}</span>
                  <span className="locale-name">{lang}</span>
                </span>
                <span className="locale-progress-wrap">
                  <div className={`progress-bar-track ${done ? "progress-complete" : ""}`} style={{ width: "120px" }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="progress-pct-sm">{pct}%</span>
                </span>
                <StatusBadge status={s.status?.toLowerCase() || "not_started"} />
              </div>
            );
          })}

          {entry.targetLanguages?.length === 0 && (
            <div className="locale-table-empty">No target languages found in Smartcat project.</div>
          )}
        </div>

        {entry.fetchError && (
          <p className="error-msg" style={{ marginBottom: "1rem" }}>⚠ {entry.fetchError}</p>
        )}

        {/* Actions */}
        <div className="modal-actions modal-actions-spread">
          <button
            className="btn btn-ghost btn-danger"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-ghost" onClick={handlePull} disabled={pulling || !entry.smartcatDocumentIds || Object.keys(entry.smartcatDocumentIds).length === 0}>
              {pulling ? "Pulling…" : "↓ Pull to Strapi"}
            </button>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send to Smartcat →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

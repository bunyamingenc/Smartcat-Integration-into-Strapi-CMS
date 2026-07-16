// src/components/ArticleModal.jsx
import { useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import DiffModal   from "./DiffModal";
import LocaleSyncModal from "./LocaleSyncModal";
import QAReportModal from "./QAReportModal";
import {
  sendEntry, pullEntry, removeFromRegistry, addToRegistry,
  getActiveProjectId, downloadXliff, uploadXliff,
} from "../api/client";
import { useToast } from "./Toast";

// ─── Add Article Modal ────────────────────────────────────────────────────────

export function AddArticleModal({ onClose, onAdded }) {
  const [form, setForm]       = useState({ strapiDocumentId: "", smartcatProjectId: getActiveProjectId() || "" });
  const [loading, setLoading] = useState(false);
  const { add: toast }        = useToast();

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
    } catch (e) { toast(e.message, "error"); }
    finally     { setLoading(false); }
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
  const [sending,  setSending]   = useState(false);
  const [pulling,  setPulling]   = useState(false);
  const [removing, setRemoving]  = useState(false);
  const [showDiff, setShowDiff]  = useState(false);
  const [showLocaleSync, setShowLocaleSync] = useState(false);
  const [qaReport, setQaReport]  = useState(null); // set after pull, opens QA modal
  const [busyLang, setBusyLang]  = useState({});  // { tr: "downloading" | "uploading" }
  const fileInputs               = useRef({});    // hidden file inputs per lang
  const { add: toast }           = useToast();

  async function performSend() {
    setShowDiff(false);
    setSending(true);
    try {
      const result  = await sendEntry(entry.key);
      const summary = Object.entries(result.updateResults || {})
        .map(([l, s]) => `${l}: ${s}`).join(", ");
      toast(`Sent to Smartcat ✓ (${summary})`, "success");
      onRefresh();
    } catch (e) { toast(e.message, "error"); }
    finally { setSending(false); }
  }

  async function handlePull() {
    const localeEntries = Object.entries(entry.localeStatuses || {});
    const overall = localeEntries.length > 0
      ? Math.round(localeEntries.reduce((s, [, v]) => s + (v.progress ?? 0), 0) / localeEntries.length)
      : 0;
    const confirmed = confirm(overall < 100
      ? `Translations are ${overall}% complete. Pull partial translations anyway?`
      : "Pull all completed translations into Strapi?");
    if (!confirmed) return;

    setPulling(true);
    try {
      const result = await pullEntry(entry.key);
      const allOk  = Object.values(result.results).every((r) => r.status === "synced");
      toast(allOk ? "All translations synced ✓" : "Some translations failed — check status", allOk ? "success" : "warning");
      onRefresh();

      // Show QA report if we have one, regardless of sync success
      if (result.qaReport) {
        setQaReport(result.qaReport);
      }
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

  // ─── XLIFF actions ──────────────────────────────────────────────────────────

  async function handleDownloadXliff(lang) {
    setBusyLang((b) => ({ ...b, [lang]: "downloading" }));
    try {
      const { filename } = await downloadXliff(entry.key, lang);
      toast(`Downloaded ${filename}`, "success");
    } catch (e) { toast(`Download failed: ${e.message}`, "error"); }
    finally { setBusyLang((b) => { const n = { ...b }; delete n[lang]; return n; }); }
  }

  function handleUploadClick(lang) {
    const input = fileInputs.current[lang];
    if (input) input.click();
  }

  async function handleFileChosen(lang, event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so the same file can be chosen again
    if (!file) return;

    setBusyLang((b) => ({ ...b, [lang]: "uploading" }));
    try {
      const xmlText = await file.text();
      await uploadXliff(entry.key, lang, xmlText);
      toast(`Uploaded ${file.name} → ${lang.toUpperCase()} ✓`, "success");
      onRefresh();
    } catch (e) { toast(`Upload failed: ${e.message}`, "error"); }
    finally { setBusyLang((b) => { const n = { ...b }; delete n[lang]; return n; }); }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{entry.title}</h2>
              <p className="modal-subtitle">{entry.projectName || entry.smartcatProjectId}</p>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <div className="modal-ids">
            <span className="modal-id-item"><span className="modal-id-label">Strapi</span>{entry.strapiDocumentId}</span>
            <span className="modal-id-item"><span className="modal-id-label">Smartcat</span>{entry.smartcatProjectId.slice(0, 18)}…</span>
          </div>

          <div className="locale-table">
            <div className="locale-table-header">
              <span>Language</span>
              <span>Progress</span>
              <span>Status</span>
              <span>XLIFF</span>
            </div>

            <div className="locale-table-row source-row">
              <span className="locale-lang">
                <span className="locale-flag">EN</span>
                <span className="locale-name">Source (English)</span>
              </span>
              <span>—</span>
              <StatusBadge status={entry.status} />
              <span></span>
            </div>

            {(entry.unifiedLocales || (entry.targetLanguages || []).map((l) => ({
              code: l.toLowerCase().split("-")[0],
              inStrapi: true, inSmartcat: true, hasDoc: true, source: "both",
            }))).map((loc) => {
              const code = loc.code;
              const s    = entry.localeStatuses?.[code] || {};
              const pct  = s.status === "completed" ? 100 : (s.progress ?? 0);
              const done = pct === 100;
              const busy = busyLang[code];

              // Source indicator
              const sourceTag = loc.source === "strapi-only"
                ? <span className="locale-source-tag strapi-only" title="In Strapi only — not a Smartcat target">Strapi only</span>
                : loc.source === "smartcat-no-doc"
                ? <span className="locale-source-tag no-doc" title="Smartcat target language but no document uploaded yet">No doc</span>
                : null;

              return (
                <div key={code} className={`locale-table-row ${loc.source === "strapi-only" ? "row-strapi-only" : ""} ${loc.source === "smartcat-no-doc" ? "row-no-doc" : ""}`}>
                  <span className="locale-lang">
                    <span className="locale-flag">{code.toUpperCase()}</span>
                    <span className="locale-name">{code}</span>
                    {sourceTag}
                  </span>
                  <span className="locale-progress-wrap">
                    {loc.hasDoc ? (
                      <>
                        <div className={`progress-bar-track ${done ? "progress-complete" : ""}`} style={{ width: "120px" }}>
                          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="progress-pct-sm">{pct}%</span>
                      </>
                    ) : (
                      <span className="locale-no-doc-hint">—</span>
                    )}
                  </span>
                  <StatusBadge status={loc.hasDoc ? (s.status?.toLowerCase() || "not_started") : "no-doc"} />
                  <span className="xliff-actions">
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => handleDownloadXliff(code)}
                      disabled={!!busy}
                      title={`Download .xlf for ${code}`}
                    >
                      {busy === "downloading" ? "…" : "↓"}
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => handleUploadClick(code)}
                      disabled={!!busy}
                      title={`Upload translated .xlf for ${code}`}
                    >
                      {busy === "uploading" ? "…" : "↑"}
                    </button>
                    <input
                      ref={(el) => { fileInputs.current[code] = el; }}
                      type="file"
                      accept=".xlf,.xliff,application/xliff+xml,application/xml,text/xml"
                      style={{ display: "none" }}
                      onChange={(e) => handleFileChosen(code, e)}
                    />
                  </span>
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

          <div className="modal-actions modal-actions-spread">
            <button className="btn btn-ghost btn-danger" onClick={handleRemove} disabled={removing}>
              {removing ? "Removing…" : "Remove"}
            </button>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {entry.lastQaReport && (
                <button
                  className={`btn btn-ghost ${entry.lastQaReport.totalErrors > 0 ? "btn-qa-error" : entry.lastQaReport.totalWarnings > 0 ? "btn-qa-warning" : ""}`}
                  onClick={() => setQaReport(entry.lastQaReport)}
                  title="View last QA report"
                >
                  {entry.lastQaReport.totalErrors > 0
                    ? `⚠ QA: ${entry.lastQaReport.totalErrors} error${entry.lastQaReport.totalErrors !== 1 ? "s" : ""}`
                    : entry.lastQaReport.totalWarnings > 0
                    ? `⚠ QA: ${entry.lastQaReport.totalWarnings} warning${entry.lastQaReport.totalWarnings !== 1 ? "s" : ""}`
                    : "✓ QA passed"}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setShowLocaleSync(true)}>
                ⚙ Locale Sync
              </button>
              <button
                className="btn btn-ghost"
                onClick={handlePull}
                disabled={pulling || !entry.smartcatDocumentIds || Object.keys(entry.smartcatDocumentIds).length === 0}
              >
                {pulling ? "Pulling…" : "↓ Pull"}
              </button>
              <button className="btn btn-primary" onClick={() => setShowDiff(true)} disabled={sending}>
                {sending ? "Sending…" : "Review & Send →"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDiff && (
        <DiffModal
          entry={entry}
          onClose={() => setShowDiff(false)}
          onConfirm={performSend}
        />
      )}

      {showLocaleSync && (
        <LocaleSyncModal
          entry={entry}
          onClose={() => setShowLocaleSync(false)}
          onRefresh={onRefresh}
        />
      )}

      {qaReport && (
        <QAReportModal
          report={qaReport}
          articleTitle={entry.title}
          onClose={() => setQaReport(null)}
        />
      )}
    </>
  );
}

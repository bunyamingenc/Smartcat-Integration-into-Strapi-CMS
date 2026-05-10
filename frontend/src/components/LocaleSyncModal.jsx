// src/components/LocaleSyncModal.jsx
// Shows Strapi vs Smartcat locale alignment + actions to fix mismatches
import { useEffect, useState } from "react";
import { getLocales, initLocales, addStrapiLocales } from "../api/client";
import { useToast } from "./Toast";

export default function LocaleSyncModal({ entry, onClose, onRefresh }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [busyAction, setBusy] = useState(null); // "init" | "add"
  const { add: toast }        = useToast();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getLocales(entry.key));
    } catch (e) { setError(e.message); }
    finally    { setLoading(false); }
  }

  useEffect(() => { load(); }, [entry.key]);

  async function handleInitMissing() {
    if (!confirm(
      "This will copy your source content into every Strapi locale that doesn't exist yet for this article.\n\nContinue?"
    )) return;

    setBusy("init");
    try {
      const result = await initLocales(entry.key);
      const created = Object.entries(result.results).filter(([, r]) => r.status === "initialized").map(([l]) => l);
      const skipped = Object.entries(result.results).filter(([, r]) => r.status === "skipped").map(([l]) => l);
      const failed  = Object.entries(result.results).filter(([, r]) => r.status === "failed").map(([l]) => l);

      const summary = [];
      if (created.length) summary.push(`${created.length} initialized (${created.join(", ")})`);
      if (skipped.length) summary.push(`${skipped.length} already existed`);
      if (failed.length)  summary.push(`${failed.length} failed`);
      toast(summary.join(" · ") || "No changes", failed.length ? "warning" : "success");
      await load();
      onRefresh?.();
    } catch (e) { toast(e.message, "error"); }
    finally    { setBusy(null); }
  }

  async function handleAddStrapiLocales() {
    if (!confirm(
      "This will create article entries in Strapi for any Smartcat target languages that already exist as global locales.\n\nNote: If a language hasn't been added to Strapi globally yet, you'll need to do that manually first.\n\nContinue?"
    )) return;

    setBusy("add");
    try {
      const result = await addStrapiLocales(entry.key);
      const initialized     = Object.entries(result.results).filter(([, r]) => r.status === "initialized");
      const exists          = Object.entries(result.results).filter(([, r]) => r.status === "exists");
      const needsManual     = Object.entries(result.results).filter(([, r]) => r.status === "needs-manual-setup");
      const failed          = Object.entries(result.results).filter(([, r]) => r.status === "failed");

      if (needsManual.length > 0) {
        const langs = needsManual.map(([l]) => l.toUpperCase()).join(", ");
        toast(
          `${initialized.length} initialized. Manual step needed for: ${langs} — add them in Strapi Admin → Settings → Internationalization first`,
          "warning",
          8000
        );
      } else if (initialized.length > 0) {
        toast(`${initialized.length} locale(s) initialized in Strapi ✓`, "success");
      } else if (exists.length > 0) {
        toast("All locales already exist in Strapi", "info");
      }

      if (failed.length > 0) {
        toast(`${failed.length} failed — check server logs`, "error");
      }

      await load();
      onRefresh?.();
    } catch (e) { toast(e.message, "error"); }
    finally    { setBusy(null); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Locale Sync</h2>
            <p className="modal-subtitle">{entry.title}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading && (
          <div className="state-container" style={{ padding: "2rem" }}>
            <div className="spinner" />
            <p className="state-label">Checking locale alignment…</p>
          </div>
        )}

        {error && <p className="error-msg">⚠ {error}</p>}

        {data && (
          <>
            <div className="locale-sync-summary">
              <div className="locale-sync-stat">
                <span className="locale-sync-stat-value">{data.common.length}</span>
                <span className="locale-sync-stat-label">in sync</span>
              </div>
              <div className="locale-sync-stat">
                <span className="locale-sync-stat-value">{data.strapiOnly.length}</span>
                <span className="locale-sync-stat-label">Strapi only</span>
              </div>
              <div className="locale-sync-stat">
                <span className="locale-sync-stat-value">{data.smartcatOnly.length}</span>
                <span className="locale-sync-stat-label">Smartcat only</span>
              </div>
            </div>

            <div className="locale-sync-grid">
              {/* In sync */}
              {data.common.length > 0 && (
                <div className="locale-sync-section">
                  <h3 className="locale-sync-section-title good">✓ In both Strapi & Smartcat</h3>
                  <div className="locale-chip-row">
                    {data.common.map((l) => (
                      <span key={l} className="locale-chip locale-chip-good">{l.toUpperCase()}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strapi only */}
              {data.strapiOnly.length > 0 && (
                <div className="locale-sync-section">
                  <h3 className="locale-sync-section-title warn">⚠ Strapi only — Smartcat doesn't have these</h3>
                  <div className="locale-chip-row">
                    {data.strapiOnly.map((l) => (
                      <span key={l} className="locale-chip locale-chip-warn">{l.toUpperCase()}</span>
                    ))}
                  </div>
                  <p className="locale-sync-hint">
                    Smartcat doesn't allow adding target languages to an existing project.
                    To translate these, create a new Smartcat project with the missing languages and register it as a separate article entry.
                  </p>
                </div>
              )}

              {/* Smartcat only */}
              {data.smartcatOnly.length > 0 && (
                <div className="locale-sync-section">
                  <h3 className="locale-sync-section-title info">ℹ Smartcat only — Strapi is missing these</h3>
                  <div className="locale-chip-row">
                    {data.smartcatOnly.map((l) => (
                      <span key={l} className="locale-chip locale-chip-info">{l.toUpperCase()}</span>
                    ))}
                  </div>
                  <div className="locale-sync-manual-note">
                    <span className="locale-sync-manual-icon">⚠</span>
                    <div>
                      <p className="locale-sync-manual-title">Manual step required first</p>
                      <p className="locale-sync-hint">
                        Strapi v5 doesn't allow creating global locales via API. Go to{" "}
                        <strong>Strapi Admin → Settings → Internationalization → Add new locale</strong>{" "}
                        and add: <strong>{data.smartcatOnly.map((l) => l.toUpperCase()).join(", ")}</strong>.
                        Then click the button below — it will automatically create the article entries.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddStrapiLocales}
                    disabled={busyAction === "add"}
                    style={{ marginTop: "0.25rem" }}
                  >
                    {busyAction === "add" ? "Adding to Strapi…" : "+ Add article entries for existing locales"}
                  </button>
                </div>
              )}
            </div>

            {/* Init missing locales — always available */}
            <div className="locale-sync-init-section">
              <h3 className="locale-sync-section-title">Initialize empty locales</h3>
              <p className="locale-sync-hint">
                Copy source content ({data.sourceLocale.toUpperCase()}) into every Strapi locale that exists
                but is empty for this article. Translators will then have a baseline to edit instead of
                creating new entries from scratch.
              </p>
              <button
                className="btn btn-ghost"
                onClick={handleInitMissing}
                disabled={busyAction === "init"}
              >
                {busyAction === "init" ? "Initializing…" : "Initialize empty locales"}
              </button>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

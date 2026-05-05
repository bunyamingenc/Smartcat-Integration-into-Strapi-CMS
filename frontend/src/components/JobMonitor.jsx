// src/components/JobMonitor.jsx
import { useState, useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge";
import { getStatus, pullTranslations } from "../api/client";
import { useToast } from "./Toast";

export default function JobMonitor({ article, onPulled, onBack }) {
  const [statuses, setStatuses]     = useState(null);
  const [pulling, setPulling]       = useState(false);
  const [pullResult, setPullResult] = useState(null);
  const [error, setError]           = useState(null);
  const intervalRef                 = useRef(null);
  const { add: toast }              = useToast();

  const documentId = article?.documentId;

  async function fetchStatus() {
    if (!documentId) return;
    try {
      const data = await getStatus(documentId);
      setStatuses(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 8000);
    return () => clearInterval(intervalRef.current);
  }, [documentId]);

  async function handlePull() {
    const allComplete = statuses?.smartcatStatuses &&
      Object.values(statuses.smartcatStatuses).every(
        (s) => s.status?.toLowerCase() === "completed" || s.progress === 100
      );

    if (!allComplete) {
      const confirmed = confirm(
        "Some translations are not yet complete. Pulling now will import partial translations into Strapi. Continue?"
      );
      if (!confirmed) return;
    }

    setPulling(true);
    setError(null);
    setPullResult(null);

    try {
      const result = await pullTranslations(documentId);
      setPullResult(result);

      const anyFailed = Object.values(result.results).some((r) => r.status === "failed");
      if (anyFailed) {
        toast("Some translations failed to sync — check the results below", "warning");
      } else {
        toast("All translations pulled into Strapi ✓", "success");
      }

      onPulled?.();
      clearInterval(intervalRef.current);
    } catch (e) {
      setError(e.message);
      toast(e.message, "error");
    } finally {
      setPulling(false);
    }
  }

  const smartcatEntries = statuses?.smartcatStatuses
    ? Object.entries(statuses.smartcatStatuses)
    : [];

  const overallProgress = smartcatEntries.length > 0
    ? Math.round(
        smartcatEntries.reduce((sum, [, s]) => sum + (s.status?.toLowerCase() === "completed" ? 100 : (s.progress ?? 0)), 0)
        / smartcatEntries.length
      )
    : 0;

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h2 className="section-title" style={{ marginTop: "0.5rem" }}>Job Monitor</h2>
          {article && <p className="section-sub">{article.title}</p>}
        </div>
        <button className="btn btn-ghost" onClick={fetchStatus}>↻ Refresh</button>
      </div>

      {!article && (
        <div className="state-container">
          <p className="state-label">No article selected. Send one from the Articles view first.</p>
          <button className="btn btn-ghost" onClick={onBack}>← Go to Articles</button>
        </div>
      )}

      {article && !statuses && !error && (
        <div className="state-container">
          <div className="spinner" />
          <p className="state-label">Fetching translation status…</p>
        </div>
      )}

      {error && <p className="error-msg">⚠ {error}</p>}

      {statuses && (
        <div className="monitor-grid">
          <div className="monitor-card">
            <div className="monitor-card-header">
              <h3 className="monitor-card-title">Translation Status</h3>
              <span className="monitor-overall">{overallProgress}% overall</span>
            </div>

            <div className="status-list">
              {smartcatEntries.map(([lang, s]) => {
                const pct = s.status?.toLowerCase() === "completed" ? 100 : (s.progress ?? 0);
                const done = pct === 100;
                return (
                  <div key={lang} className="status-row">
                    <span className="status-lang">{lang.toUpperCase()}</span>
                    <div className={`progress-bar-track ${done ? "progress-complete" : ""}`}>
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="progress-pct">{pct}%</span>
                    <StatusBadge status={s.status?.toLowerCase()} />
                  </div>
                );
              })}
            </div>

            <div className="monitor-footer">
              <div className="monitor-job-status">
                Pipeline: <StatusBadge status={statuses.jobStatus} />
              </div>
              <p className="monitor-hint">
                {overallProgress === 100
                  ? "All translations complete — ready to pull into Strapi."
                  : `${overallProgress}% translated — you can pull partial translations at any time.`}
              </p>
            </div>
          </div>

          <div className="monitor-card">
            <h3 className="monitor-card-title">Pull to Strapi</h3>
            <p className="monitor-desc">
              Download completed translations from Smartcat and update the CMS locale versions.
              You can pull at any completion percentage — partial translations are marked clearly.
            </p>

            {pullResult && (
              <div className="pull-result">
                {Object.entries(pullResult.results).map(([lang, r]) => (
                  <div key={lang} className={`pull-row ${r.status}`}>
                    <span className="pull-lang">{lang.toUpperCase()}</span>
                    <span>
                      {r.status === "synced"
                        ? `✓ Synced — ${r.fields?.join(", ")}`
                        : `✗ Failed — ${r.reason}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {overallProgress < 100 && overallProgress > 0 && !pullResult && (
              <div className="partial-warning">
                ⚠ Translations are {overallProgress}% complete. Pulling now will import partial content.
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handlePull}
              disabled={pulling || overallProgress === 0}
              title={overallProgress === 0 ? "Send article to Smartcat first" : ""}
            >
              {pulling ? "Pulling translations…" : "Pull translations into Strapi ↓"}
            </button>

            {overallProgress === 0 && (
              <p className="monitor-hint-sm">Send the article to Smartcat first from the Articles view</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

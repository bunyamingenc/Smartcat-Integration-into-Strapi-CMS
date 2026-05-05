// src/components/ArticlesPage.jsx
import { useState } from "react";
import StatusBadge from "./StatusBadge";
import { AddArticleModal, ArticleDetailModal } from "./ArticleModal";

export default function ArticlesPage({ entries, loading, onRefresh }) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [selected,   setSelected]   = useState(null);

  // Compute overall progress for a card
  function overallPct(entry) {
    const vals = Object.values(entry.localeStatuses || {});
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + (v.progress ?? 0), 0) / vals.length);
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Articles</h2>
          <p className="section-sub">
            {loading ? "Loading…" : `${entries.length} registered article${entries.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Article</button>
        </div>
      </div>

      {loading && (
        <div className="state-container">
          <div className="spinner" />
          <p className="state-label">Loading registered articles…</p>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="state-container">
          <p className="state-label">No articles registered yet.</p>
          <p className="state-hint">Click "+ Add Article" to link a Strapi article to a Smartcat project.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Article</button>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="article-grid">
          {entries.map((entry) => {
            const pct     = overallPct(entry);
            const locales = Object.entries(entry.localeStatuses || {});

            return (
              <div
                key={entry.key}
                className="article-card article-card-clickable"
                onClick={() => setSelected(entry)}
              >
                <div className="article-card-top">
                  <StatusBadge status={entry.status} />
                  <span className="article-project-tag" title={entry.smartcatProjectId}>
                    {entry.projectName || entry.smartcatProjectId?.slice(0, 10) + "…"}
                  </span>
                </div>

                <h3 className="article-title">{entry.title}</h3>

                {entry.shortDescription && (
                  <p className="article-desc">{entry.shortDescription}</p>
                )}

                {/* Per-locale mini status */}
                {entry.targetLanguages?.length > 0 && (
                  <div className="locale-mini-grid">
                    {(entry.targetLanguages || []).map((lang) => {
                      const code = lang.toLowerCase().split("-")[0];
                      const s    = entry.localeStatuses?.[code];
                      const p    = s?.status?.toLowerCase() === "completed" ? 100 : (s?.progress ?? 0);
                      return (
                        <div key={lang} className="locale-mini-item">
                          <span className="locale-mini-code">{code.toUpperCase()}</span>
                          <div className={`progress-bar-track-sm ${p === 100 ? "progress-complete" : ""}`}>
                            <div className="progress-bar-fill" style={{ width: `${p}%` }} />
                          </div>
                          <span className="locale-mini-pct">{p}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="article-meta">
                  <span className="article-id" title={entry.strapiDocumentId}>
                    {entry.strapiDocumentId.slice(0, 14)}…
                  </span>
                  {pct !== null && (
                    <span className="article-overall-pct">{pct}% overall</span>
                  )}
                </div>

                {entry.updatedAt && (
                  <p className="article-synced">
                    Updated: {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                )}

                <p className="article-card-cta">Click to manage →</p>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddArticleModal
          onClose={() => setShowAdd(false)}
          onAdded={onRefresh}
        />
      )}

      {selected && (
        <ArticleDetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { onRefresh(); setSelected(null); }}
        />
      )}
    </section>
  );
}

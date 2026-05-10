// src/components/ArticlesPage.jsx
import { useState, useCallback } from "react";
import StatusBadge from "./StatusBadge";
import { AddArticleModal, ArticleDetailModal } from "./ArticleModal";
import LocaleMatrix from "./LocaleMatrix";
import { sendEntry, pullEntry } from "../api/client";
import { useToast } from "./Toast";

export default function ArticlesPage({ entries, loading, onRefresh }) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [checked,    setChecked]    = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState(null);
  const [viewMode,   setViewMode]   = useState("cards"); // "cards" | "matrix"
  const { add: toast } = useToast();

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const allKeys     = entries.map((e) => e.key);
  const allChecked  = allKeys.length > 0 && allKeys.every((k) => checked.has(k));
  const someChecked = checked.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) {
      setChecked(new Set());
    } else {
      setChecked(new Set(allKeys));
    }
  }

  function toggleOne(key, e) {
    e.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  const runBulk = useCallback(async (action) => {
    const keys     = [...checked];
    const total    = keys.length;
    const errors   = [];

    setBulkStatus({ action, done: 0, total, errors: [] });

    for (let i = 0; i < keys.length; i++) {
      const key   = keys[i];
      const entry = entries.find((e) => e.key === key);
      try {
        if (action === "send") await sendEntry(key);
        if (action === "pull") await pullEntry(key);
      } catch (e) {
        errors.push({ key, title: entry?.title || key, error: e.message });
      }
      setBulkStatus({ action, done: i + 1, total, errors: [...errors] });
    }

    // Summary toast
    const succeeded = total - errors.length;
    const label     = action === "send" ? "sent to Smartcat" : "pulled to Strapi";
    if (errors.length === 0) {
      toast(`${succeeded} article${succeeded !== 1 ? "s" : ""} ${label} ✓`, "success");
    } else {
      toast(`${succeeded} ${label} · ${errors.length} failed`, "warning");
    }

    setBulkStatus(null);
    setChecked(new Set());
    onRefresh();
  }, [checked, entries, onRefresh, toast]);

  // ─── Card click — don't open modal if clicking checkbox ────────────────────

  function handleCardClick(entry) {
    setSelected(entry);
  }

  // ─── Overall progress per card ──────────────────────────────────────────────

  function overallPct(entry) {
    const vals = Object.values(entry.localeStatuses || {});
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + (v.progress ?? 0), 0) / vals.length);
  }

  const isBusy = bulkStatus !== null;

  return (
    <section className="section">
      {/* ── Header ── */}
      <div className="section-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {entries.length > 0 && (
            <input
              type="checkbox"
              className="bulk-checkbox bulk-checkbox-all"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked; }}
              onChange={toggleAll}
              title={allChecked ? "Deselect all" : "Select all"}
              disabled={isBusy}
            />
          )}
          <div>
            <h2 className="section-title">Articles</h2>
            <p className="section-sub">
              {loading
                ? "Loading…"
                : checked.size > 0
                  ? `${checked.size} of ${entries.length} selected`
                  : `${entries.length} registered article${entries.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {/* Cards / Matrix toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
              title="Card view"
            >⊞</button>
            <button
              className={`view-toggle-btn ${viewMode === "matrix" ? "active" : ""}`}
              onClick={() => setViewMode("matrix")}
              title="Matrix view"
            >⊟</button>
          </div>
          <button className="btn btn-ghost" onClick={onRefresh} disabled={isBusy}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={isBusy}>+ Add Article</button>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {checked.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-label">
            {checked.size} article{checked.size !== 1 ? "s" : ""} selected
          </span>

          {bulkStatus ? (
            <div className="bulk-progress">
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              <span>
                {bulkStatus.action === "send" ? "Sending" : "Pulling"} {bulkStatus.done}/{bulkStatus.total}…
              </span>
              {bulkStatus.errors.length > 0 && (
                <span className="bulk-error-count">{bulkStatus.errors.length} failed</span>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setChecked(new Set())}
              >
                Clear
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => runBulk("pull")}
              >
                ↓ Pull {checked.size}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => runBulk("send")}
              >
                Send {checked.size} to Smartcat →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── States ── */}
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

      {/* ── Matrix view ── */}
      {!loading && entries.length > 0 && viewMode === "matrix" && (
        <LocaleMatrix
          entries={entries}
          onSelectEntry={setSelected}
        />
      )}

      {/* ── Card grid ── */}
      {!loading && entries.length > 0 && viewMode === "cards" && (
        <div className="article-grid">
          {entries.map((entry) => {
            const pct       = overallPct(entry);
            const isChecked = checked.has(entry.key);

            return (
              <div
                key={entry.key}
                className={`article-card article-card-clickable ${isChecked ? "article-card-selected" : ""}`}
                onClick={() => handleCardClick(entry)}
              >
                {/* Checkbox — top-left, stops propagation so card click doesn't fire */}
                <div className="article-card-top">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      className="bulk-checkbox"
                      checked={isChecked}
                      onChange={(e) => toggleOne(entry.key, e)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={isBusy}
                    />
                    <StatusBadge status={entry.status} />
                  </div>
                  <span className="article-project-tag" title={entry.smartcatProjectId}>
                    {entry.projectName || entry.smartcatProjectId?.slice(0, 10) + "…"}
                  </span>
                </div>

                <h3 className="article-title">{entry.title}</h3>

                {entry.shortDescription && (
                  <p className="article-desc">{entry.shortDescription}</p>
                )}

                {/* Per-locale mini progress */}
                {(entry.unifiedLocales || entry.targetLanguages || []).length > 0 && (
                  <div className="locale-mini-grid">
                    {(entry.unifiedLocales || (entry.targetLanguages || []).map((l) => ({
                      code: l.toLowerCase().split("-")[0], hasDoc: true,
                    }))).map((loc) => {
                      const code = loc.code;
                      const s    = entry.localeStatuses?.[code];
                      const p    = s?.status?.toLowerCase() === "completed" ? 100 : (s?.progress ?? 0);
                      return (
                        <div key={code} className="locale-mini-item">
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

      {/* ── Modals ── */}
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

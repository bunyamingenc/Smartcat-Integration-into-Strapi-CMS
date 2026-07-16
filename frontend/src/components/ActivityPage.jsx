// src/components/ActivityPage.jsx
import { useState, useEffect, useCallback } from "react";
import { getActivity, clearActivity } from "../api/client";
import { ActivityListSkeleton } from "./Skeleton";
import { useToast } from "./Toast";

const ACTION_LABELS = {
  register:             "Article Registered",
  remove:               "Article Removed",
  send:                 "Sent to Smartcat",
  pull:                 "Pulled to Strapi",
  diff:                 "Diff Checked",
  "init-locales":       "Locales Initialized",
  "add-strapi-locales": "Locales Added to Strapi",
  "xliff-download":     "XLIFF Downloaded",
  "xliff-upload":       "XLIFF Uploaded",
  "locale-sync":        "Locale Sync",
};

const ACTION_COLORS = {
  register:             "activity-blue",
  remove:               "activity-red",
  send:                 "activity-accent",
  pull:                 "activity-green",
  "init-locales":       "activity-yellow",
  "add-strapi-locales": "activity-yellow",
  "xliff-download":     "activity-gray",
  "xliff-upload":       "activity-green",
  "locale-sync":        "activity-blue",
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildDetail(entry) {
  const parts = [];
  if (entry.projectName)  parts.push(entry.projectName);
  if (entry.lang)         parts.push(`lang: ${entry.lang.toUpperCase()}`);
  if (entry.filename)     parts.push(entry.filename);

  // Clean up field names — strip the "article-xxxx." prefix
  if (entry.fieldsExtracted?.length) {
    const clean = entry.fieldsExtracted.map((f) => f.includes(".") ? f.split(".").slice(1).join(".") : f);
    parts.push(`fields: ${clean.join(", ")}`);
  }

  if (entry.allSynced === true)  parts.push("all synced ✓");
  if (entry.allSynced === false) parts.push("partial sync ⚠");

  if (entry.results) {
    const langs = Object.entries(entry.results)
      .map(([l, r]) => `${l.toUpperCase()}: ${r.status}`)
      .join(" · ");
    if (langs) parts.push(langs);
  }
  if (entry.updateResults) {
    const res = Object.entries(entry.updateResults)
      .map(([l, s]) => `${l.toUpperCase()}: ${s}`)
      .join(" · ");
    if (res) parts.push(res);
  }
  return parts.join("  ·  ") || null;
}

export default function ActivityPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const LIMIT = 25;
  const { add: toast } = useToast();

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      setData(await getActivity(p, LIMIT));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(page); }, [page]);

  async function handleClear() {
    if (!confirm("Clear the entire activity log? This cannot be undone.")) return;
    try {
      await clearActivity();
      toast("Activity log cleared", "info");
      setPage(1);
      load(1);
    } catch (e) { toast(e.message, "error"); }
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Activity</h2>
          <p className="section-sub">
            {data ? `${data.total} action${data.total !== 1 ? "s" : ""} recorded` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost" onClick={() => load(page)}>↻ Refresh</button>
          <button className="btn btn-ghost btn-danger" onClick={handleClear}>Clear log</button>
        </div>
      </div>

      {loading && <ActivityListSkeleton count={5} />}

      {!loading && data?.total === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🕑</div>
          <h3 className="empty-state-title">No activity yet</h3>
          <p className="empty-state-desc">
            Actions like Send, Pull, and XLIFF downloads will appear here as you use the app.
          </p>
        </div>
      )}

      {!loading && data?.entries?.length > 0 && (
        <>
          <div className="activity-timeline">
            {data.entries.map((entry, idx) => {
              const colorClass = ACTION_COLORS[entry.action] || "activity-gray";
              const label      = ACTION_LABELS[entry.action] || entry.action;
              const detail     = buildDetail(entry);

              return (
                <div key={entry.id || idx} className="activity-entry">
                  <div className="activity-left">
                    <div className={`activity-dot ${colorClass}`} />
                    <div className="activity-line" />
                  </div>
                  <div className="activity-body">
                    <div className="activity-header-row">
                      <span className={`activity-action-label ${colorClass}`}>{label}</span>
                      <span className="activity-icon">{entry.icon}</span>
                      <span className="activity-time" title={formatTime(entry.timestamp)}>
                        {timeAgo(entry.timestamp)}
                      </span>
                    </div>
                    {entry.articleTitle && (
                      <p className="activity-article">{entry.articleTitle}</p>
                    )}
                    {detail && (
                      <p className="activity-detail">{detail}</p>
                    )}
                    <p className="activity-timestamp">{formatTime(entry.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="activity-pagination">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Previous
              </button>
              <span className="activity-page-info">
                Page {data.page} of {data.totalPages}
                <span className="activity-page-total">({data.total} total)</span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

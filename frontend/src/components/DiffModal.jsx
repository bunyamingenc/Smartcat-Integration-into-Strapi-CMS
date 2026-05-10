// src/components/DiffModal.jsx
// Shows changes between last-sent snapshot and current Strapi content
import { useEffect, useState } from "react";

const BASE = "http://localhost:3000/api";

function getHeaders() {
  const s = JSON.parse(localStorage.getItem("localesync_settings") || "{}");
  return {
    "x-strapi-url":    s.strapiUrl    || "",
    "x-strapi-token":  s.strapiToken  || "",
    "x-strapi-type":   s.strapiType   || "test-articles",
    "x-strapi-locale": s.strapiLocale || "en",
    "x-sc-server":     s.scServer     || "",
    "x-sc-account":    s.scAccount    || "",
    "x-sc-key":        s.scKey        || "",
  };
}

export default function DiffModal({ entry, onClose, onConfirm }) {
  const [diff, setDiff]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch(`${BASE}/registry/${encodeURIComponent(entry.key)}/diff`, { headers: getHeaders() })
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error)))
      .then(setDiff)
      .catch((e) => setError(typeof e === "string" ? e : "Failed to load diff"))
      .finally(() => setLoading(false));
  }, [entry.key]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Review Changes</h2>
            <p className="modal-subtitle">{entry.title}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading && (
          <div className="state-container" style={{ padding: "2rem" }}>
            <div className="spinner" />
            <p className="state-label">Comparing with last sent version…</p>
          </div>
        )}

        {error && <p className="error-msg">⚠ {error}</p>}

        {diff && !diff.hasSnapshot && (
          <div className="diff-firstsend">
            <span className="diff-firstsend-icon">✨</span>
            <div>
              <p className="diff-firstsend-title">First time sending this article</p>
              <p className="diff-firstsend-desc">
                There's no previous version to compare against. After this send, future changes will show a diff here.
              </p>
              <p className="diff-firstsend-fields">
                Fields to send: <strong>{diff.currentFields.join(", ")}</strong>
              </p>
            </div>
          </div>
        )}

        {diff && diff.hasSnapshot && !diff.hasChanges && (
          <div className="diff-nochanges">
            <span className="diff-nochanges-icon">✓</span>
            <div>
              <p className="diff-nochanges-title">No changes since last send</p>
              <p className="diff-nochanges-desc">
                Last sent: {diff.lastSentAt ? new Date(diff.lastSentAt).toLocaleString() : "—"}
              </p>
              <p className="diff-nochanges-desc" style={{ marginTop: "0.4rem" }}>
                You can still re-send if you want to reset translation progress in Smartcat.
              </p>
            </div>
          </div>
        )}

        {diff && diff.hasChanges && (
          <>
            <div className="diff-summary">
              <span className="diff-count">{diff.changes.length}</span>
              <span>{diff.changes.length === 1 ? "field changed" : "fields changed"} since last send</span>
              {diff.lastSentAt && (
                <span className="diff-last-sent">last sent {new Date(diff.lastSentAt).toLocaleString()}</span>
              )}
            </div>

            <div className="diff-list">
              {diff.changes.map((change) => (
                <div key={change.field} className="diff-block">
                  <div className="diff-field-header">
                    <span className="diff-field-name">{change.field}</span>
                    {change.isNew     && <span className="diff-tag diff-tag-new">NEW</span>}
                    {change.isRemoved && <span className="diff-tag diff-tag-removed">REMOVED</span>}
                    {!change.isNew && !change.isRemoved && <span className="diff-tag diff-tag-changed">MODIFIED</span>}
                  </div>
                  <div className="diff-panes">
                    <div className="diff-pane diff-pane-old">
                      <span className="diff-pane-label">Previous</span>
                      <div className="diff-pane-content">
                        {change.oldValue || <span className="diff-empty">(empty)</span>}
                      </div>
                    </div>
                    <div className="diff-pane diff-pane-new">
                      <span className="diff-pane-label">Current</span>
                      <div className="diff-pane-content">
                        {change.newValue || <span className="diff-empty">(empty)</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {diff?.hasChanges
              ? "Send changes to Smartcat →"
              : diff?.hasSnapshot
                ? "Re-send anyway →"
                : "Send to Smartcat →"}
          </button>
        </div>
      </div>
    </div>
  );
}

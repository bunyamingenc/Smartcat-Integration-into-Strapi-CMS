// src/components/ArticleList.jsx
import { useState, useEffect } from "react";
import StatusBadge from "./StatusBadge";
import { sendToSmartcat, getLocales, deleteArticle } from "../api/client";
import { useToast } from "./Toast";

export default function ArticleList({ articles, loading, onSent, onRefresh, onLocaleChange, activeLocale }) {
  const [sending,  setSending]  = useState({});
  const [deleting, setDeleting] = useState({});
  const [locales,  setLocales]  = useState([]);
  const { add: toast }          = useToast();

  // Reload locales whenever articles change (= new project selected)
  useEffect(() => {
    getLocales()
      .then(setLocales)
      .catch(() => setLocales([]));
  }, [articles]);

  async function handleSend(article) {
    setSending((s) => ({ ...s, [article.documentId]: true }));
    try {
      const result = await sendToSmartcat(article.documentId);
      const updated = result.updateResults
        ? Object.entries(result.updateResults)
            .map(([lang, status]) => `${lang}: ${status}`)
            .join(", ")
        : "";
      toast(`"${article.title}" sent to Smartcat ✓ ${updated ? `(${updated})` : ""}`, "success");
      onSent(article);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSending((s) => ({ ...s, [article.documentId]: false }));
    }
  }

  async function handleDelete(article) {
    const confirmed = confirm(`Delete "${article.title}" from Strapi? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting((s) => ({ ...s, [article.documentId]: true }));
    try {
      await deleteArticle(article.documentId);
      toast(`"${article.title}" deleted from Strapi`, "info");
      onRefresh();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, "error");
    } finally {
      setDeleting((s) => ({ ...s, [article.documentId]: false }));
    }
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Articles</h2>
          <p className="section-sub">
            {loading
              ? "Loading…"
              : `${articles.length} article${articles.length !== 1 ? "s" : ""}${activeLocale && activeLocale !== "all" ? ` · ${activeLocale.toUpperCase()}` : ""}`}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {/* Locale switcher — scoped to current project's languages */}
      {locales.length > 0 && (
        <div className="locale-switcher">
          <button
            className={`locale-btn ${!activeLocale || activeLocale === "all" ? "active" : ""}`}
            onClick={() => onLocaleChange("all")}
          >
            All
          </button>
          {locales.map((l) => (
            <button
              key={l.code}
              className={`locale-btn ${activeLocale === l.code ? "active" : ""}`}
              onClick={() => onLocaleChange(l.code)}
            >
              {l.code.toUpperCase()}
              {l.isDefault && <span className="locale-default">source</span>}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="state-container">
          <div className="spinner" />
          <p className="state-label">Loading articles…</p>
        </div>
      )}

      {!loading && articles.length === 0 && (
        <div className="state-container">
          <p className="state-label">
            {activeLocale && activeLocale !== "all"
              ? `No articles in ${activeLocale.toUpperCase()}. Try another locale.`
              : "No articles found. Create one in Strapi first."}
          </p>
          <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
        </div>
      )}

      {!loading && articles.length > 0 && (
        <div className="article-grid">
          {articles.map((article) => (
            <div key={article.documentId} className="article-card">
              <div className="article-card-top">
                <StatusBadge status={article.jobStatus} />
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="article-locale">{article.locale}</span>
                  <button
                    className="btn-icon btn-icon-danger"
                    onClick={() => handleDelete(article)}
                    disabled={deleting[article.documentId]}
                    title="Delete from Strapi"
                  >
                    {deleting[article.documentId] ? "…" : "🗑"}
                  </button>
                </div>
              </div>

              <h3 className="article-title">{article.title}</h3>

              {article.shortDescription && (
                <p className="article-desc">{article.shortDescription}</p>
              )}

              <div className="article-meta">
                <span className="article-id" title={article.documentId}>
                  {article.documentId.slice(0, 12)}…
                </span>
                <div className="article-targets">
                  {article.targetLocales.map((l) => (
                    <span key={l} className="locale-chip">{l}</span>
                  ))}
                </div>
              </div>

              {article.lastSynced && (
                <p className="article-synced">
                  Last synced: {new Date(article.lastSynced).toLocaleString()}
                </p>
              )}

              <div className="article-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => handleSend(article)}
                  disabled={sending[article.documentId]}
                >
                  {sending[article.documentId] ? "Sending…" : "Send to Smartcat →"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onSent(article)}
                  title="Monitor translation status"
                >
                  Monitor
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

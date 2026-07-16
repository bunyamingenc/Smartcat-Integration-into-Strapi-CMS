// src/components/QAReportModal.jsx
// Shows placeholder/HTML/empty/length checks after a pull

const ISSUE_ICONS = {
  placeholder: "🔗",
  html:        "🏷",
  empty:       "⭕",
  length:      "📏",
};

function IssueRow({ issue }) {
  return (
    <div className={`qa-issue qa-issue-${issue.level}`}>
      <span className="qa-issue-icon">{ISSUE_ICONS[issue.type] || "•"}</span>
      <span className="qa-issue-message">{issue.message}</span>
    </div>
  );
}

function LangSection({ lang, qa }) {
  const fieldEntries = Object.entries(qa.fields || {});
  const clean = fieldEntries.length === 0;

  return (
    <div className={`qa-lang-section ${clean ? "qa-lang-clean" : ""}`}>
      <div className="qa-lang-header">
        <span className="locale-flag">{lang.toUpperCase()}</span>
        {clean ? (
          <span className="qa-lang-status qa-status-pass">✓ All checks passed</span>
        ) : (
          <span className="qa-lang-status">
            {qa.errorCount > 0 && <span className="qa-count qa-count-error">{qa.errorCount} error{qa.errorCount !== 1 ? "s" : ""}</span>}
            {qa.warningCount > 0 && <span className="qa-count qa-count-warning">{qa.warningCount} warning{qa.warningCount !== 1 ? "s" : ""}</span>}
          </span>
        )}
      </div>

      {!clean && (
        <div className="qa-fields">
          {fieldEntries.map(([field, issues]) => (
            <div key={field} className="qa-field-block">
              <span className="qa-field-name">{field}</span>
              <div className="qa-issue-list">
                {issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QAReportModal({ report, articleTitle, onClose }) {
  const langEntries = Object.entries(report.byLang || {});
  const allClean    = report.totalErrors === 0 && report.totalWarnings === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">QA Report</h2>
            <p className="modal-subtitle">{articleTitle}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Summary banner */}
        <div className={`qa-summary-banner ${allClean ? "qa-summary-pass" : "qa-summary-issues"}`}>
          {allClean ? (
            <>
              <span className="qa-summary-icon">✓</span>
              <span>All translations passed quality checks.</span>
            </>
          ) : (
            <>
              <span className="qa-summary-icon">⚠</span>
              <span>
                {report.totalErrors > 0 && <strong>{report.totalErrors} error{report.totalErrors !== 1 ? "s" : ""}</strong>}
                {report.totalErrors > 0 && report.totalWarnings > 0 && " and "}
                {report.totalWarnings > 0 && <strong>{report.totalWarnings} warning{report.totalWarnings !== 1 ? "s" : ""}</strong>}
                {" "}found across {langEntries.length} language{langEntries.length !== 1 ? "s" : ""}.
              </span>
            </>
          )}
        </div>

        {/* Per-language breakdown */}
        <div className="qa-lang-list">
          {langEntries.map(([lang, qa]) => (
            <LangSection key={lang} lang={lang} qa={qa} />
          ))}
        </div>

        {/* Legend */}
        <div className="qa-legend">
          <span className="qa-legend-item">🔗 Placeholder mismatch</span>
          <span className="qa-legend-item">🏷 HTML tag mismatch</span>
          <span className="qa-legend-item">⭕ Empty translation</span>
          <span className="qa-legend-item">📏 Length anomaly</span>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

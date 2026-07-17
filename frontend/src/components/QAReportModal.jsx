// src/components/QAReportModal.jsx
// Shows placeholder/HTML/empty/length checks after a pull.
// Each language section can be collapsed independently to help focus on
// remaining problems once others have been reviewed.
import { useState } from "react";

const ISSUE_BADGES = {
  placeholder: "PH",
  html:        "TAG",
  empty:       "∅",
  length:      "LEN",
};

const ISSUE_LABELS = {
  placeholder: "Placeholder mismatch",
  html:        "HTML tag mismatch",
  empty:       "Empty translation",
  length:      "Length anomaly",
};

function IssueRow({ issue }) {
  return (
    <div className={`qa-issue qa-issue-${issue.level}`}>
      <span className="qa-issue-icon">{ISSUE_BADGES[issue.type] || "•"}</span>
      <span className="qa-issue-message">{issue.message}</span>
    </div>
  );
}

function LangSection({ lang, qa, collapsed, onToggle }) {
  const fieldEntries = Object.entries(qa.fields || {});
  const clean = fieldEntries.length === 0;

  return (
    <div className={`qa-lang-section ${clean ? "qa-lang-clean" : ""}`}>
      <button
        className="qa-lang-header qa-lang-header-btn"
        onClick={onToggle}
        disabled={clean}
        title={clean ? undefined : (collapsed ? "Expand" : "Collapse")}
      >
        <span className="locale-flag">{lang.toUpperCase()}</span>
        {clean ? (
          <span className="qa-lang-status qa-status-pass">✓ All checks passed</span>
        ) : (
          <>
            <span className="qa-lang-status">
              {qa.errorCount > 0 && <span className="qa-count qa-count-error">{qa.errorCount} error{qa.errorCount !== 1 ? "s" : ""}</span>}
              {qa.warningCount > 0 && <span className="qa-count qa-count-warning">{qa.warningCount} warning{qa.warningCount !== 1 ? "s" : ""}</span>}
            </span>
            <span className={`qa-chevron ${collapsed ? "qa-chevron-collapsed" : ""}`}>▾</span>
          </>
        )}
      </button>

      {!clean && !collapsed && (
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

  // Track which language sections are collapsed. All start expanded.
  const [collapsedLangs, setCollapsedLangs] = useState({});

  function toggleLang(lang) {
    setCollapsedLangs((c) => ({ ...c, [lang]: !c[lang] }));
  }

  const anyExpanded = langEntries.some(([lang, qa]) =>
    Object.keys(qa.fields || {}).length > 0 && !collapsedLangs[lang]
  );

  function collapseAll() {
    const next = {};
    for (const [lang, qa] of langEntries) {
      if (Object.keys(qa.fields || {}).length > 0) next[lang] = true;
    }
    setCollapsedLangs(next);
  }

  function expandAll() {
    setCollapsedLangs({});
  }

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
              <span style={{ flex: 1 }}>
                {report.totalErrors > 0 && <strong>{report.totalErrors} error{report.totalErrors !== 1 ? "s" : ""}</strong>}
                {report.totalErrors > 0 && report.totalWarnings > 0 && " and "}
                {report.totalWarnings > 0 && <strong>{report.totalWarnings} warning{report.totalWarnings !== 1 ? "s" : ""}</strong>}
                {" "}found across {langEntries.length} language{langEntries.length !== 1 ? "s" : ""}.
              </span>
              <button className="qa-collapse-toggle" onClick={anyExpanded ? collapseAll : expandAll}>
                {anyExpanded ? "Collapse all" : "Expand all"}
              </button>
            </>
          )}
        </div>

        {/* Per-language breakdown */}
        <div className="qa-lang-list">
          {langEntries.map(([lang, qa]) => (
            <LangSection
              key={lang}
              lang={lang}
              qa={qa}
              collapsed={!!collapsedLangs[lang]}
              onToggle={() => toggleLang(lang)}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="qa-legend">
          <span className="qa-legend-item"><span className="qa-legend-dot" style={{ background: "var(--red)" }} />{ISSUE_LABELS.placeholder}</span>
          <span className="qa-legend-item"><span className="qa-legend-dot" style={{ background: "var(--yellow)" }} />{ISSUE_LABELS.html}</span>
          <span className="qa-legend-item"><span className="qa-legend-dot" style={{ background: "var(--red)" }} />{ISSUE_LABELS.empty}</span>
          <span className="qa-legend-item"><span className="qa-legend-dot" style={{ background: "var(--yellow)" }} />{ISSUE_LABELS.length}</span>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

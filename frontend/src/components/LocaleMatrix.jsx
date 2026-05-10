// src/components/LocaleMatrix.jsx
// Table: rows = articles, columns = all unique locales, cells = progress
import { useMemo } from "react";

function CellContent({ loc, entry }) {
  if (!loc) return <span className="matrix-cell-empty">─</span>;

  const s    = entry.localeStatuses?.[loc.code];
  const pct  = s?.status?.toLowerCase() === "completed" ? 100 : (s?.progress ?? 0);
  const done = pct === 100;

  if (!loc.inSmartcat && loc.inStrapi) {
    return <span className="matrix-cell-strapi-only" title="In Strapi only">S</span>;
  }
  if (!loc.hasDoc) {
    return <span className="matrix-cell-no-doc" title="No Smartcat document">─</span>;
  }
  if (done) {
    return <span className="matrix-cell-done" title="100% complete">✓</span>;
  }
  if (pct === 0) {
    return <span className="matrix-cell-zero" title="Not started">0%</span>;
  }
  return (
    <span className="matrix-cell-progress" title={`${pct}%`}>
      {pct}%
    </span>
  );
}

export default function LocaleMatrix({ entries, onSelectEntry }) {
  // Build the union of all locale codes across all articles
  const allLocales = useMemo(() => {
    const seen = new Map(); // code → { code, label }
    for (const entry of entries) {
      // Source locale always first
      if (!seen.has("en")) seen.set("en", { code: "en", isSource: true });
      for (const loc of (entry.unifiedLocales || [])) {
        if (!seen.has(loc.code)) seen.set(loc.code, { code: loc.code, isSource: false });
      }
    }
    // Source first, then alphabetical
    const source = [...seen.values()].filter((l) => l.isSource);
    const rest   = [...seen.values()].filter((l) => !l.isSource).sort((a, b) => a.code.localeCompare(b.code));
    return [...source, ...rest];
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="state-container">
        <p className="state-label">No articles registered yet.</p>
      </div>
    );
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="matrix-th matrix-th-article">Article</th>
            <th className="matrix-th matrix-th-project">Project</th>
            {allLocales.map((loc) => (
              <th
                key={loc.code}
                className={`matrix-th matrix-th-locale ${loc.isSource ? "matrix-source-col" : ""}`}
              >
                {loc.code.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            // Build a map from code → unifiedLocale for this entry
            const locMap = {};
            for (const loc of (entry.unifiedLocales || [])) {
              locMap[loc.code] = loc;
            }

            return (
              <tr
                key={entry.key}
                className="matrix-row"
                onClick={() => onSelectEntry(entry)}
                title="Click to manage"
              >
                <td className="matrix-td matrix-td-article">
                  <span className="matrix-article-title">{entry.title}</span>
                </td>
                <td className="matrix-td matrix-td-project">
                  <span className="matrix-project-tag">
                    {entry.projectName || entry.smartcatProjectId?.slice(0, 8) + "…"}
                  </span>
                </td>
                {allLocales.map((loc) => {
                  if (loc.isSource) {
                    return (
                      <td key={loc.code} className="matrix-td matrix-cell matrix-cell-source">
                        <span className="matrix-cell-done" title="Source locale">EN</span>
                      </td>
                    );
                  }
                  const entryLoc = locMap[loc.code] ?? null;
                  return (
                    <td
                      key={loc.code}
                      className="matrix-td matrix-cell"
                    >
                      <CellContent loc={entryLoc} entry={entry} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="matrix-legend">
        <span className="matrix-legend-item"><span className="matrix-cell-done">✓</span> Complete</span>
        <span className="matrix-legend-item"><span className="matrix-cell-progress">28%</span> In progress</span>
        <span className="matrix-legend-item"><span className="matrix-cell-zero">0%</span> Not started</span>
        <span className="matrix-legend-item"><span className="matrix-cell-strapi-only">S</span> Strapi only</span>
        <span className="matrix-legend-item"><span className="matrix-cell-no-doc">─</span> No document</span>
      </div>
    </div>
  );
}

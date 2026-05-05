// src/components/Header.jsx
import { getSavedProjects, getActiveProjectId, setActiveProject } from "../api/client";

export default function Header({ health, view, onNav, unconfigured, onProjectSwitch }) {
  const connected = health?.status === "ok";
  const offline   = health?.status === "error";
  const projects  = getSavedProjects();
  const activeId  = getActiveProjectId();
  const active    = projects.find((p) => p.id === activeId);

  function handleSwitch(e) {
    const id = e.target.value;
    setActiveProject(id);
    onProjectSwitch?.(id);
  }

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">⟳</span>
        <span className="header-title">LocaleSync</span>
        <span className="header-sub">Strapi × Smartcat</span>
      </div>

      {/* Quick-switch — cosmetic label, not a filter */}
      <div className="header-center">
        {projects.length > 1 && (
          <div className="project-switcher">
            <span className="project-switcher-label">Default project:</span>
            <select className="project-select" value={activeId} onChange={handleSwitch}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </div>
        )}
        {projects.length === 1 && active && (
          <span className="project-single-label">{active.name || active.id}</span>
        )}
      </div>

      <nav className="header-nav">
        {["articles", "settings"].map((v) => (
          <button
            key={v}
            className={`nav-btn ${view === v ? "active" : ""} ${v === "settings" && unconfigured ? "nav-btn-warn" : ""}`}
            onClick={() => onNav(v)}
          >
            {v === "settings" && unconfigured ? "⚙ Settings !" : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </nav>

      <div className="header-status">
        <span className={`status-dot ${connected ? "connected" : offline ? "error" : "checking"}`} />
        <span className="status-label">
          {health === null ? "Checking…" : connected ? "Connected" : offline ? "Error" : "Unconfigured"}
        </span>
      </div>
    </header>
  );
}

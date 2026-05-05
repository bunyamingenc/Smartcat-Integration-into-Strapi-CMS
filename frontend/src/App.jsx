// src/App.jsx
import { useState, useEffect, useCallback } from "react";
import ArticlesPage from "./components/ArticlesPage";
import Header       from "./components/Header";
import Settings     from "./components/Settings";
import { ToastProvider } from "./components/Toast";
import { getRegistry, getHealth, hasSettings } from "./api/client";
import "./App.css";

export default function App() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [health,  setHealth]  = useState(null);
  const [view,    setView]    = useState(() => hasSettings() ? "articles" : "settings");

  const configured = hasSettings();

  const loadEntries = useCallback(async () => {
    if (!hasSettings()) return;
    setLoading(true);
    try { setEntries(await getRegistry()); }
    catch (e) { console.error(e); setEntries([]); }
    finally { setLoading(false); }
  }, []);

  const checkHealth = useCallback(async () => {
    try { setHealth(await getHealth()); }
    catch { setHealth({ status: "error" }); }
  }, []);

  useEffect(() => {
    if (configured) { loadEntries(); checkHealth(); }
  }, [configured]);

  function handleSettingsSaved() {
    checkHealth();
    loadEntries();
    setView("articles");
  }

  return (
    <ToastProvider>
      <div className="app">
        <Header
          health={health}
          view={view}
          onNav={setView}
          unconfigured={!configured}
          onProjectSwitch={loadEntries}
        />
        <main className="main">
          {view === "articles" && (
            configured
              ? <ArticlesPage entries={entries} loading={loading} onRefresh={loadEntries} />
              : <div className="state-container">
                  <p className="state-label">Configure your credentials in Settings to get started.</p>
                  <button className="btn btn-primary" onClick={() => setView("settings")}>Go to Settings ⚙</button>
                </div>
          )}
          {view === "settings" && <Settings onSaved={handleSettingsSaved} />}
        </main>
      </div>
    </ToastProvider>
  );
}

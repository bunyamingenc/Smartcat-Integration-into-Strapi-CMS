// src/components/Toast.jsx
import { useState, useCallback, createContext, useContext } from "react";
const ToastContext = createContext(null);

// Errors and warnings stay longer — success/info dismiss faster
const DEFAULT_DURATIONS = {
  success: 3500,
  info:    3500,
  warning: 6000,
  error:   7000,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    // Mark as leaving first so CSS exit animation can play, then remove from DOM
    setToasts((t) => t.map((x) => x.id === id ? { ...x, leaving: true } : x));
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 180);
  }, []);

  const add = useCallback((message, type = "info", duration) => {
    const id = Date.now() + Math.random();
    const finalDuration = duration ?? DEFAULT_DURATIONS[type] ?? 4000;
    setToasts((t) => [...t, { id, message, type, leaving: false }]);
    if (finalDuration > 0) setTimeout(() => remove(id), finalDuration);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ add, remove }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? "toast-leaving" : ""}`}>
            <span className="toast-icon">{t.type === "success" ? "✓" : t.type === "error" ? "✗" : t.type === "warning" ? "⚠" : "ℹ"}</span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => remove(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

// src/hooks/useKeyboardShortcuts.js
import { useEffect } from "react";

/**
 * Global keyboard shortcuts.
 * - Cmd/Ctrl+K → onAddArticle
 * - Esc        → onEscape (closes topmost modal)
 * - R          → onRefresh (only when no input/textarea is focused)
 */
export function useKeyboardShortcuts({ onAddArticle, onEscape, onRefresh }) {
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;

      // Cmd/Ctrl + K — open Add Article (works even while typing elsewhere, but not inside an input)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onAddArticle?.();
        return;
      }

      // Esc — close modal
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }

      // R — refresh (only when not typing)
      if (!isTyping && e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        onRefresh?.();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onAddArticle, onEscape, onRefresh]);
}

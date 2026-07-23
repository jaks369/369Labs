import { useState, useEffect } from "react";
import { Command, X } from "lucide-react";

const NAV_KEYS = [
  { key: "Alt+1", label: "Command Center" },
  { key: "Alt+2", label: "AI Assistant" },
  { key: "Alt+3", label: "Strategy Builder" },
  { key: "Alt+4", label: "Backtesting" },
  { key: "Alt+5", label: "Bots" },
  { key: "Alt+6", label: "Portfolio" },
  { key: "Alt+7", label: "Journal" },
  { key: "Alt+8", label: "Settings" },
];

const GLOBAL_KEYS = [
  { key: "Ctrl+K / ⌘K", label: "Command Palette" },
  { key: "Escape", label: "Close modals" },
];

export default function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Command className="w-5 h-5 text-[var(--amber)]" />
            <span className="text-sm font-bold text-white">Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-2">Navigation</p>
            <div className="space-y-1.5">
              {NAV_KEYS.map(s => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
                  <kbd className="text-[11px] px-2 py-0.5 rounded bg-black/30 border border-[var(--border)] text-[var(--text-muted)] font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-2">Global</p>
            <div className="space-y-1.5">
              {GLOBAL_KEYS.map(s => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
                  <kbd className="text-[11px] px-2 py-0.5 rounded bg-black/30 border border-[var(--border)] text-[var(--text-muted)] font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

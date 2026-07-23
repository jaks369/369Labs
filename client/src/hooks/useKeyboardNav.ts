import { useEffect, useCallback } from "react";
import { useLocation } from "wouter";

type HotkeyAction = { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; handler: () => void; description: string };

const GLOBAL_HOTKEYS: HotkeyAction[] = [];

export function registerHotkey(hk: HotkeyAction) {
  GLOBAL_HOTKEYS.push(hk);
  return () => { const idx = GLOBAL_HOTKEYS.indexOf(hk); if (idx >= 0) GLOBAL_HOTKEYS.splice(idx, 1); };
}

const NAV_SHORTCUTS: { key: string; path: string; label: string }[] = [
  { key: "1", path: "/dashboard", label: "Command Center" },
  { key: "2", path: "/ai-assistant", label: "AI Assistant" },
  { key: "3", path: "/strategy-builder", label: "Strategy Builder" },
  { key: "4", path: "/backtesting", label: "Backtesting" },
  { key: "5", path: "/bots", label: "Bots" },
  { key: "6", path: "/portfolio", label: "Portfolio" },
  { key: "7", path: "/journal", label: "Journal" },
  { key: "8", path: "/settings", label: "Settings" },
];

export function useGlobalKeyboardNav() {
  const [, navigate] = useLocation();

  const handler = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const shortcut = NAV_SHORTCUTS.find(s => s.key === e.key);
      if (shortcut) { e.preventDefault(); navigate(shortcut.path); return; }
    }

    for (const hk of GLOBAL_HOTKEYS) {
      const ctrlOrMeta = (hk.ctrl || hk.meta) ? (e.ctrlKey || e.metaKey) : true;
      const shiftOk = hk.shift ? e.shiftKey : !e.shiftKey;
      if (e.key.toLowerCase() === hk.key.toLowerCase() && ctrlOrMeta && shiftOk) {
        e.preventDefault(); hk.handler(); return;
      }
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  return { shortcuts: NAV_SHORTCUTS, hotkeys: GLOBAL_HOTKEYS };
}

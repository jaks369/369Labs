import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  LayoutDashboard,
  Bot,
  Brain,
  CandlestickChart,
  Settings,
  Bell,
  MessageCircle,
  FlaskConical,
  Wrench,
  Zap,
} from "lucide-react";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  group: string;
};

const COMMANDS: Command[] = [
  { id: "nav.dashboard", label: "Go to Dashboard", group: "Navigate", icon: LayoutDashboard, run: () => navigateTo("/dashboard") },
  { id: "nav.bots", label: "Go to Bots", group: "Navigate", icon: Bot, run: () => navigateTo("/bots") },
  { id: "nav.assistant", label: "Open 369AI Assistant", group: "Navigate", icon: Brain, run: () => navigateTo("/ai-assistant") },
  { id: "nav.signals", label: "Open AI Signals", group: "Navigate", icon: CandlestickChart, run: () => navigateTo("/marketplace") },
  { id: "nav.backtesting", label: "Open Backtesting", group: "Navigate", icon: FlaskConical, run: () => navigateTo("/backtesting") },
  { id: "nav.settings", label: "Open Settings", group: "Navigate", icon: Settings, run: () => navigateTo("/settings") },
  { id: "nav.notifications", label: "Open Notifications", group: "Navigate", icon: Bell, run: () => navigateTo("/notifications") },
  { id: "nav.telegram", label: "Open Telegram", group: "Navigate", icon: MessageCircle, run: () => navigateTo("/telegram") },
  { id: "act.deploy", label: "Deploy a strategy (go to Bots)", group: "Action", icon: Zap, run: () => navigateTo("/bots") },
  { id: "act.backtest", label: "Run a backtest (go to Backtesting)", group: "Action", icon: FlaskConical, run: () => navigateTo("/backtesting") },
  { id: "act.ask", label: "Ask 369AI to build a strategy", group: "Action", icon: Brain, run: () => navigateTo("/ai-assistant") },
  { id: "act.tools", label: "Open command palette help", group: "Action", icon: Wrench, run: () => {} },
];

let _setLocation: ((to: string) => void) | null = null;
function navigateTo(to: string) {
  if (_setLocation) _setLocation(to);
  window.dispatchEvent(new CustomEvent("command-palette:close"));
}

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("command-palette:open"));
}

export default function CommandPalette() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    _setLocation = setLocation;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    window.addEventListener("command-palette:close", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
      window.removeEventListener("command-palette:close", onClose);
    };
  }, [setLocation]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const exec = (c: Command) => {
    c.run();
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[#0D1117] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-[#30363D]">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) exec(filtered[active]); }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Type a command or searchâ€¦  (navigate, deploy, backtest, ask 369AI)"
            className="flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-slate-600"
          />
          <kbd className="text-[10px] text-slate-500 border border-[#30363D] rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No matching commands</p>
          )}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => exec(c)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm ${
                  i === active ? "bg-blue-600/15 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="flex-1">{c.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-600">{c.group}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-[#30363D] text-[10px] text-slate-600 flex items-center gap-2">
          <kbd className="border border-[#30363D] rounded px-1">â†‘</kbd>
          <kbd className="border border-[#30363D] rounded px-1">â†“</kbd>
          to navigate Â· <kbd className="border border-[#30363D] rounded px-1">â†µ</kbd> to run Â· 369Labs Command Center
        </div>
      </div>
    </div>
  );
}

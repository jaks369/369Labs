import { useEffect, useState } from "react";
import { Activity, Bot, Brain, TrendingUp, AlertTriangle } from "lucide-react";

export type TimelineEntry = {
  ts: number;
  icon: "ai" | "bot" | "market" | "risk";
  text: string;
};

const ICONS = {
  ai: Brain,
  bot: Bot,
  market: TrendingUp,
  risk: AlertTriangle,
};
const COLORS = {
  ai: "text-[var(--cyan)]",
  bot: "text-[var(--cyan)]",
  market: "text-[var(--green)]",
  risk: "text-[var(--red)]",
};

export function pushTimeline(entry: Omit<TimelineEntry, "ts">) {
  window.dispatchEvent(new CustomEvent("ai-timeline:push", { detail: { ...entry, ts: Date.now() } }));
}

export default function AITimeline({ compact = false }: { compact?: boolean }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent).detail as TimelineEntry;
      setEntries((prev) => [detail, ...prev].slice(0, compact ? 6 : 40));
    };
    window.addEventListener("ai-timeline:push", onPush as EventListener);
    return () => window.removeEventListener("ai-timeline:push", onPush as EventListener);
  }, [compact]);

  const fmt = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="text-left">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity className="w-3 h-3 text-[var(--cyan)]" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">AI Timeline</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          Live agent activity will appear here ΓÇö scans, strategy builds, risk checks, trades.
        </p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e, i) => {
            const Icon = ICONS[e.icon];
            return (
              <li key={i} className="flex items-start gap-1.5">
                <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${COLORS[e.icon]}`} />
                <span className="text-[10px] text-[var(--text-secondary)] leading-tight flex-1">{e.text}</span>
                <span className="text-[9px] text-[var(--text-muted)] tabular-nums shrink-0">{fmt(e.ts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

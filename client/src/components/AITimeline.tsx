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
  ai: "text-amber-400",
  bot: "text-[#E89A2A]",
  market: "text-emerald-400",
  risk: "text-red-400",
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
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-[#E89A2A]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Timeline</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Live agent activity will appear here — scans, strategy builds, risk checks, trades.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e, i) => {
            const Icon = ICONS[e.icon];
            return (
              <li key={i} className="flex items-start gap-2">
                <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${COLORS[e.icon]}`} />
                <span className="text-[10px] text-slate-400 leading-tight flex-1">{e.text}</span>
                <span className="text-[9px] text-slate-600 tabular-nums shrink-0">{fmt(e.ts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

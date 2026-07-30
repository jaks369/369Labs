import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  ai: "text-[var(--accent)]",
  bot: "text-[var(--accent)]",
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
        <Activity className="w-3 h-3 text-[var(--accent)]" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">AI Timeline</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-micro text-[var(--text-muted)] leading-relaxed">
          Live agent activity will appear here — scans, strategy builds, risk checks, trades.
        </p>
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {entries.map((e, i) => {
              const Icon = ICONS[e.icon];
              return (
                <motion.li
                  key={e.ts}
                  initial={{ opacity: 0, x: -8, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                  className="flex items-start gap-1.5"
                >
                  <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${COLORS[e.icon]}`} />
                  <span className="text-micro text-[var(--text-secondary)] leading-tight flex-1">{e.text}</span>
                  <span className="text-[9px] text-[var(--text-muted)] tabular-nums shrink-0">{fmt(e.ts)}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

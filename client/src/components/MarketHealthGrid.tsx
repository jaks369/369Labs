import { Activity, TrendingUp, TrendingDown, Minus, BarChart3, Waves } from "lucide-react";
import { IntegerStat } from "@/components/LiveStat";

interface MarketHealthItem {
  symbol: string;
  displayName: string;
  score: number;
  trend: number;
  momentum: number;
  noise: number;
  volatility: "Low" | "Medium" | "High";
  tradeQuality: number;
  recommendation: string;
}

interface MarketHealthGridProps {
  data: MarketHealthItem[] | undefined;
  loading: boolean;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-[var(--green)]";
  if (score >= 45) return "text-[var(--accent)]";
  return "text-[var(--red)]";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-[var(--green-soft)] border-[var(--green)]/20";
  if (score >= 45) return "bg-[var(--accent-soft)] border-[var(--accent)]/20";
  return "bg-[var(--red-soft)] border-[var(--red)]/20";
}

function volColor(v: string): string {
  switch (v) {
    case "Low": return "text-[var(--green)]";
    case "Medium": return "text-[var(--accent)]";
    case "High": return "text-[var(--red)]";
    default: return "text-[var(--text-muted)]";
  }
}

function volBg(v: string): string {
  switch (v) {
    case "Low": return "bg-[var(--green-soft)]";
    case "Medium": return "bg-[var(--accent-soft)]";
    case "High": return "bg-[var(--red-soft)]";
    default: return "bg-[var(--border)]";
  }
}

export default function MarketHealthGrid({ data, loading }: MarketHealthGridProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="section-title text-caption">Market Health</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-3 w-16 bg-[var(--border)] rounded mb-2" />
              <div className="h-7 w-12 bg-[var(--border)] rounded mb-2" />
              <div className="h-2 w-full bg-[var(--border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="section-title text-caption">Market Health</h3>
        </div>
        <div className="empty-state"><p className="empty-state-desc">No market health data available yet. The orchestrator will begin polling shortly.</p></div>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.score - a.score);

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="section-title text-caption">Market Health</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} symbols</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {sorted.map((h) => (
          <div key={h.symbol} className={`rounded-lg p-3 border ${scoreBg(h.score)}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-micro font-bold text-white">{h.displayName}</span>
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${volBg(h.volatility)} ${volColor(h.volatility)}`}>
                {h.volatility}
              </span>
            </div>
            <div className={`text-xl font-bold font-mono ${scoreColor(h.score)}`}><IntegerStat value={h.score} /></div>
            <div className="flex items-center gap-2 text-[8px] text-[var(--text-muted)]">
              <span className="flex items-center gap-0.5">
                {h.trend > 5 ? <TrendingUp className="w-2.5 h-2.5 text-[var(--green)]" /> : h.trend < -5 ? <TrendingDown className="w-2.5 h-2.5 text-[var(--red)]" /> : <Minus className="w-2.5 h-2.5 text-[var(--text-muted)]" />}
                <IntegerStat value={h.trend} variant="positive" />
              </span>
              <span className="flex items-center gap-0.5">
                <BarChart3 className="w-2.5 h-2.5" />
                <IntegerStat value={h.momentum} variant="positive" />
              </span>
              <span className="flex items-center gap-0.5">
                <Waves className="w-2.5 h-2.5" />
                <IntegerStat value={h.noise} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

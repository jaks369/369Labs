import { Activity, TrendingUp, TrendingDown, Minus, BarChart3, Waves } from "lucide-react";

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
  if (score >= 45) return "text-[var(--amber)]";
  return "text-[var(--red)]";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-[var(--green-soft)] border-[var(--green)]/20";
  if (score >= 45) return "bg-[var(--amber-soft)] border-[var(--amber)]/20";
  return "bg-[var(--red-soft)] border-[var(--red)]/20";
}

function volColor(v: string): string {
  switch (v) {
    case "Low": return "text-[var(--green)]";
    case "Medium": return "text-[var(--amber)]";
    case "High": return "text-[var(--red)]";
    default: return "text-[var(--text-muted)]";
  }
}

function volBg(v: string): string {
  switch (v) {
    case "Low": return "bg-[var(--green-soft)]";
    case "Medium": return "bg-[var(--amber-soft)]";
    case "High": return "bg-[var(--red-soft)]";
    default: return "bg-[var(--border)]";
  }
}

export default function MarketHealthGrid({ data, loading }: MarketHealthGridProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Market Health</h3>
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
          <Activity className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Market Health</h3>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] italic text-center py-6">No market health data available yet. The orchestrator will begin polling shortly.</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.score - a.score);

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="section-title text-[11px]">Market Health</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} symbols</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {sorted.map((h) => (
          <div key={h.symbol} className={`rounded-lg p-3 border ${scoreBg(h.score)}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-white">{h.symbol}</span>
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${volBg(h.volatility)} ${volColor(h.volatility)}`}>
                {h.volatility}
              </span>
            </div>
            <div className={`text-xl font-bold font-mono ${scoreColor(h.score)}`}>{h.score}</div>
            <div className="text-[8px] text-[var(--text-muted)] mb-2">{h.displayName}</div>
            <div className="flex items-center gap-2 text-[8px] text-[var(--text-muted)]">
              <span className="flex items-center gap-0.5">
                {h.trend > 5 ? <TrendingUp className="w-2.5 h-2.5 text-[var(--green)]" /> : h.trend < -5 ? <TrendingDown className="w-2.5 h-2.5 text-[var(--red)]" /> : <Minus className="w-2.5 h-2.5 text-[var(--text-muted)]" />}
                {h.trend}%
              </span>
              <span className="flex items-center gap-0.5">
                <BarChart3 className="w-2.5 h-2.5" />
                {h.momentum}%
              </span>
              <span className="flex items-center gap-0.5">
                <Waves className="w-2.5 h-2.5" />
                {h.noise}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

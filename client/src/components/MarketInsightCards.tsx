import { Zap, TrendingUp, TrendingDown, Activity, Hash, GripHorizontal, AlertTriangle, Lightbulb } from "lucide-react";

interface InsightItem {
  id: string;
  type: string;
  market: string;
  message: string;
  confidence: number;
  reasoning: string[];
  timestamp: number;
}

interface MarketInsightCardsProps {
  data: InsightItem[] | undefined;
  loading: boolean;
}

function insightIcon(type: string) {
  switch (type) {
    case "volatility_change": return <Zap className="w-3.5 h-3.5" />;
    case "momentum_change": return <TrendingUp className="w-3.5 h-3.5" />;
    case "digit_bias": return <Hash className="w-3.5 h-3.5" />;
    case "consolidation": return <GripHorizontal className="w-3.5 h-3.5" />;
    default: return <Lightbulb className="w-3.5 h-3.5" />;
  }
}

function insightColor(type: string): string {
  switch (type) {
    case "volatility_change": return "text-[var(--amber)]";
    case "momentum_change": return "text-[var(--green)]";
    case "digit_bias": return "text-[var(--cyan)]";
    case "consolidation": return "text-[var(--cyan)]";
    default: return "text-[var(--text-muted)]";
  }
}

function insightBg(type: string): string {
  switch (type) {
    case "volatility_change": return "bg-[var(--amber-soft)] border-[var(--amber)]/20";
    case "momentum_change": return "bg-[var(--green-soft)] border-[var(--green)]/20";
    case "digit_bias": return "bg-[var(--cyan-soft)] border-[var(--cyan)]/20";
    case "consolidation": return "bg-[var(--cyan-soft)] border-[var(--cyan)]/20";
    default: return "bg-[var(--card)] border-[var(--border)]";
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MarketInsightCards({ data, loading }: MarketInsightCardsProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">AI Insights</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-3 w-24 bg-[var(--border)] rounded mb-2" />
              <div className="h-4 w-40 bg-[var(--border)] rounded mb-2" />
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
          <Lightbulb className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">AI Insights</h3>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] italic text-center py-6">No AI insights generated yet. Insights appear as the orchestrator detects volatility changes, momentum shifts, digit biases, or consolidations.</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="section-title text-[11px]">AI Insights</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} active</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((insight) => (
          <div key={insight.id} className={`rounded-lg p-3 border ${insightBg(insight.type)}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className={`flex items-center gap-1.5 ${insightColor(insight.type)}`}>
                {insightIcon(insight.type)}
                <span className="text-[8px] font-bold uppercase tracking-wider">{insight.type.replace(/_/g, " ")}</span>
              </div>
              <span className="text-[8px] text-[var(--text-muted)]">{formatTime(insight.timestamp)}</span>
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-white">{insight.market}</span>
              <span className="text-[8px] font-mono text-[var(--text-secondary)]">{insight.confidence}%</span>
            </div>
            <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed mb-1.5">{insight.message}</p>
            {insight.reasoning.length > 0 && (
              <div className="space-y-0.5">
                {insight.reasoning.slice(0, 2).map((r, j) => (
                  <p key={j} className="text-[8px] text-[var(--text-muted)]">ΓÇó {r}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

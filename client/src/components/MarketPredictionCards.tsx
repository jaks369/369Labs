import { Sparkles, TrendingUp, TrendingDown, Shield, GripHorizontal } from "lucide-react";

interface PredictionItem {
  market: string;
  contractType: string;
  prediction: string;
  confidence: number;
  risk: "Low" | "Medium" | "High";
  expectedDuration: string;
  reasoning: string[];
  recommendation: string;
}

interface MarketPredictionCardsProps {
  data: PredictionItem[] | undefined;
  loading: boolean;
}

function riskColor(r: string): string {
  switch (r) {
    case "Low": return "text-[var(--green)]";
    case "Medium": return "text-[var(--amber)]";
    case "High": return "text-[var(--red)]";
    default: return "text-[var(--text-muted)]";
  }
}

function riskBg(r: string): string {
  switch (r) {
    case "Low": return "bg-[var(--green-soft)] border-[var(--green)]/20";
    case "Medium": return "bg-[var(--amber-soft)] border-[var(--amber)]/20";
    case "High": return "bg-[var(--red-soft)] border-[var(--red)]/20";
    default: return "bg-[var(--card)] border-[var(--border)]";
  }
}

export default function MarketPredictionCards({ data, loading }: MarketPredictionCardsProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Predictions</h3>
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-3 w-20 bg-[var(--border)] rounded mb-2" />
              <div className="h-5 w-16 bg-[var(--border)] rounded mb-2" />
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
          <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Predictions</h3>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] italic text-center py-6">No active predictions. Predictions are generated when sufficient data and confidence thresholds are met.</p>
      </div>
    );
  }

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="section-title text-[11px]">Predictions</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} active</span>
      </div>
      <div className="space-y-3">
        {data.map((p, i) => (
          <div key={i} className={`rounded-lg p-3 border ${riskBg(p.risk)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white">{p.market}</span>
                <span className="text-[8px] text-[var(--text-muted)] bg-[var(--border)] rounded px-1.5 py-0.5">{p.contractType}</span>
              </div>
              <span className={`text-[8px] font-bold ${riskColor(p.risk)}`}>{p.risk} risk</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              {p.prediction === "RISE" || p.prediction === "EVEN" ? (
                <TrendingUp className="w-4 h-4 text-[var(--green)]" />
              ) : (
                <TrendingDown className="w-4 h-4 text-[var(--red)]" />
              )}
              <span className="text-sm font-bold font-mono text-white">{p.prediction}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{p.expectedDuration}</span>
            </div>

            <div className="mb-2">
              <div className="flex items-center justify-between text-[8px] text-[var(--text-muted)] mb-0.5">
                <span>Confidence</span>
                <span className="font-bold font-mono text-white">{p.confidence}%</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${p.confidence >= 70 ? "bg-[var(--green)]" : p.confidence >= 50 ? "bg-[var(--amber)]" : "bg-[var(--red)]"}`}
                  style={{ width: `${p.confidence}%` }}
                />
              </div>
            </div>

            {p.reasoning.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {p.reasoning.slice(0, 2).map((r, j) => (
                  <p key={j} className="text-[8px] text-[var(--text-muted)]">ΓÇó {r}</p>
                ))}
              </div>
            )}

            <p className="text-[8px] text-[var(--text-secondary)] italic">{p.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

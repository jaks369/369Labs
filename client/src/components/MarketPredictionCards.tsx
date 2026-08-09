import { Sparkles, ArrowUpRight, ArrowDownRight, Minus, Circle } from "lucide-react";
import { IntegerStat } from "@/components/LiveStat";

interface PredictionItem {
  market: string;
  contractType: string;
  prediction: string;
  direction?: "up" | "down" | "neutral" | null;
  lean?: string;
  confidence: number;
  risk: "Low" | "Medium" | "High";
  expectedDuration: string;
  reasoning: string[];
  recommendation: string;
  plain?: string;
  edgePct?: number;
}

interface MarketPredictionCardsProps {
  data: PredictionItem[] | undefined;
  loading: boolean;
}

function riskColor(r: string): string {
  switch (r) {
    case "Low": return "text-[var(--green)]";
    case "Medium": return "text-[var(--accent)]";
    case "High": return "text-[var(--red)]";
    default: return "text-[var(--text-muted)]";
  }
}

function riskBg(r: string): string {
  switch (r) {
    case "Low": return "bg-[var(--green-soft)] border-[var(--green)]/20";
    case "Medium": return "bg-[var(--accent-soft)] border-[var(--accent)]/20";
    case "High": return "bg-[var(--red-soft)] border-[var(--red)]/20";
    default: return "bg-[var(--card)] border-[var(--border)]";
  }
}

function headline(p: PredictionItem): string {
  if (p.prediction === "NO CLEAR LEAN") return "No clear lean";
  if (p.prediction === "RISE") return "Leans Rise";
  if (p.prediction === "FALL") return "Leans Fall";
  return p.lean || p.prediction;
}

function headlineColor(p: PredictionItem): string {
  if (p.direction === "down") return "text-[var(--red)]";
  if (p.direction === "up") return "text-[var(--green)]";
  if (p.prediction === "NO CLEAR LEAN") return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

function LeadIcon({ direction, prediction }: { direction?: string | null; prediction: string }) {
  if (direction === "down") return <ArrowDownRight className="w-4 h-4 text-[var(--red)]" />;
  if (direction === "up") return <ArrowUpRight className="w-4 h-4 text-[var(--green)]" />;
  if (prediction === "NO CLEAR LEAN") return <Minus className="w-4 h-4 text-[var(--text-muted)]" />;
  return <Circle className="w-4 h-4 text-[var(--accent)]" />;
}

export default function MarketPredictionCards({ data, loading }: MarketPredictionCardsProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="section-title text-caption">Predictions</h3>
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-3 w-20 bg-[var(--border)] rounded mb-2" />
              <div className="h-5 w-40 bg-[var(--border)] rounded mb-2" />
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
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="section-title text-caption">Predictions</h3>
        </div>
        <p className="text-micro text-[var(--text-muted)] italic text-center py-6">No active predictions yet. They appear when a contract type shows a real edge over its fair rate.</p>
      </div>
    );
  }

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="section-title text-caption">Predictions</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} live · one per market</span>
      </div>
      <div className="space-y-3">
        {data.map((p, i) => (
          <div key={i} className={`rounded-lg p-3 border ${riskBg(p.risk)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-caption font-bold text-white">{p.market}</span>
                <span className="text-[8px] text-[var(--text-muted)] bg-[var(--border)] rounded px-1.5 py-0.5">{p.contractType}</span>
              </div>
              <span className={`text-[8px] font-bold ${riskColor(p.risk)}`}>{p.risk} risk</span>
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <LeadIcon direction={p.direction} prediction={p.prediction} />
              <span className={`text-sm font-bold ${headlineColor(p)}`}>{headline(p)}</span>
              {typeof p.edgePct === "number" && (
                <span className={`text-[8px] font-mono ${p.edgePct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                  +{p.edgePct.toFixed(1)}pp vs fair
                </span>
              )}
            </div>

            {p.plain && <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed mb-2">{p.plain}</p>}

            <div className="mb-2">
              <div className="flex items-center justify-between text-[8px] text-[var(--text-muted)] mb-0.5">
                <span>Confidence (est.)</span>
                <span className="font-bold font-mono text-white"><IntegerStat value={p.confidence} variant="always-positive" />%</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${p.confidence >= 70 ? "bg-[var(--green)]" : p.confidence >= 50 ? "bg-[var(--accent)]" : "bg-[var(--red)]"}`}
                  style={{ width: `${Math.max(0, Math.min(100, p.confidence))}%` }}
                />
              </div>
            </div>

            {(p.reasoning?.length || 0) > 0 && (
              <div className="space-y-0.5 mb-2">
                {(p.reasoning || []).slice(0, 2).map((r, j) => (
                  <p key={j} className="text-[8px] text-[var(--text-muted)]">• {r}</p>
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
import { Brain, Lightbulb, Loader2, AlertCircle, BarChart3, Target, Activity, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";

type Slot = "prediction" | "entry" | "risk";

const SLOT_CONFIG: Record<Slot, { icon: any; title: string; preferredTypes: string[] }> = {
  prediction: { icon: BarChart3, title: "Price Prediction", preferredTypes: ["market_pattern", "ai_insight"] },
  entry: { icon: Target, title: "Entry Signal", preferredTypes: ["trade_review", "ai_insight"] },
  risk: { icon: Activity, title: "Risk Assessment", preferredTypes: ["trade_review", "strategy_insight", "strategy_review"] },
};

const TYPE_LABELS: Record<string, string> = {
  trade_review: "Trade Analysis",
  strategy_review: "Strategy Review",
  accuracy_log: "Accuracy Report",
  market_pattern: "Market Pattern",
  ai_insight: "AI Insight",
  journal: "Journal Entry",
  strategy_insight: "Strategy Insight",
  pattern_insight: "Pattern Discovery",
  trade_context: "Trade Context",
};

function formatFactors(data: any): string[] {
  if (!data || typeof data !== "object") return [];
  const skip = new Set(["id", "userId", "createdAt", "updatedAt", "knowledgeType", "symbol", "source", "confidence", "score", "strategyScore"]);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (skip.has(k)) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      lines.push(...formatFactors(v));
    } else {
      const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
      lines.push(`${label}: ${Array.isArray(v) ? v.join(", ") : String(v).slice(0, 100)}`);
    }
    if (lines.length >= 6) break;
  }
  return lines;
}

function confidencePercent(entry: any, data: any): number {
  if (entry.confidence) {
    const n = parseFloat(entry.confidence);
    if (!isNaN(n)) return Math.round(n);
  }
  const score = data?.score ?? data?.strategyScore ?? data?.confidence;
  return typeof score === "number" ? Math.round(score) : 50;
}

function pickSignal(data: any, knowledgeType: string): string {
  const rec = data?.recommendation || data?.outcome || "";
  if (/bull|buy|rise/i.test(rec)) return "Bullish";
  if (/bear|sell|fall/i.test(rec)) return "Bearish";
  if (knowledgeType === "market_pattern") {
    const trend = typeof data?.trend === "number" ? data.trend : 0;
    return trend > 0.1 ? "Bullish" : trend < -0.1 ? "Bearish" : "Neutral";
  }
  if (knowledgeType === "trade_review" && data?.result?.outcome === "win") return "BUY";
  return "Analyzed";
}

export default function AIExplainability() {
  const memoryQuery = trpc.ai.memory.useQuery({ limit: 20 });
  const [slotIdx, setSlotIdx] = useState<Record<Slot, number>>({ prediction: 0, entry: 0, risk: 0 });

  const allEntries = useMemo(() => (memoryQuery.data?.entries || []).filter((e: any) => e.data && typeof e.data === "object"), [memoryQuery.data]);

  const preferredFor = useMemo(() => {
    const map: Record<Slot, any[]> = { prediction: [], entry: [], risk: [] };
    for (const slot of ["prediction", "entry", "risk"] as Slot[]) {
      const types = SLOT_CONFIG[slot].preferredTypes;
      map[slot] = allEntries.filter((e: any) => types.includes(e.knowledgeType));
    }
    return map;
  }, [allEntries]);

  const slotEntry = (slot: Slot) => {
    const pref = preferredFor[slot];
    const pool = pref.length > 0 ? pref : allEntries;
    const idx = slotIdx[slot] % (pool.length || 1);
    return pool[idx] || null;
  };

  const cycleSlot = (slot: Slot) => {
    const pool = preferredFor[slot].length > 0 ? preferredFor[slot] : allEntries;
    setSlotIdx(prev => ({ ...prev, [slot]: ((prev[slot] ?? 0) + 1) % Math.max(pool.length, 1) }));
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">AI Explainability</h1>
            <p className="text-xs text-[var(--text-muted)]">Understand how 369AI reaches its trading decisions</p>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-[var(--amber)] mt-0.5 shrink-0" />
            <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Every AI trading decision includes a list of contributing factors ranked by importance. The confidence score reflects how strongly the available data supports each prediction. Low-confidence signals (below 50%) are automatically flagged for review.
            </div>
          </div>
        </div>

        {memoryQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" /></div>
        ) : allEntries.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">No AI analysis data yet. Run a market scan or deploy a bot to generate explainability data.</div>
        ) : (
          <div className="space-y-4">
            {(["prediction", "entry", "risk"] as Slot[]).map(slot => {
              const cfg = SLOT_CONFIG[slot];
              const entry = slotEntry(slot);
              if (!entry) return null;
              const data = entry.data as any;
              const confidence = confidencePercent(entry, data);
              const signal = pickSignal(data, entry.knowledgeType);
              const factors = formatFactors(data);
              const typeLabel = TYPE_LABELS[entry.knowledgeType] || entry.knowledgeType;
              const Icon = cfg.icon;
              const isPositive = (signal === "Bullish" || signal === "BUY") || confidence >= 60;

              return (
                <div key={slot} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[var(--amber)]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{cfg.title}</h3>
                        <span className={`text-xs font-bold ${isPositive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {signal} · {confidence}% confidence
                          <span className="text-[var(--text-muted)] font-normal ml-2">({typeLabel})</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => cycleSlot(slot)} className="p-1 rounded hover:bg-white/5 text-[var(--text-muted)] hover:text-white" title="Show next entry">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-16 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${confidence >= 70 ? "bg-[var(--green)]" : confidence >= 50 ? "bg-[var(--amber)]" : "bg-[var(--red)]"}`} style={{ width: `${Math.min(confidence, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-white w-8 text-right">{confidence}%</span>
                    </div>
                  </div>
                  {entry.symbol && <p className="text-[10px] text-[var(--text-muted)] mb-2">Symbol: {entry.symbol}</p>}
                  {factors.length > 0 ? (
                    <ul className="space-y-2">
                      {factors.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--amber)]" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">{(data as any)?.review || JSON.stringify(data).slice(0, 200)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-[var(--red-soft)]/20 border border-[var(--red)]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--red)] mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            AI predictions are probabilistic and not guaranteed. Always use risk management measures. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </div>
  );
}

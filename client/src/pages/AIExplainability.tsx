import { Brain, Lightbulb, BarChart3, Target, Activity, Info, AlertCircle } from "lucide-react";

const EXPLANATIONS = [
  { icon: BarChart3, title: "Price Prediction", signal: "Bullish", confidence: 78, factors: ["RSI(14) at 62 indicates bullish momentum", "Price above 50-period EMA (bullish)", "Volume increasing 15% above average", "Support level detected at 158.50"] },
  { icon: Target, title: "Entry Signal", signal: "BUY", confidence: 72, factors: ["Momentum crossover detected (fast MA crossed above slow MA)", "Volatility within normal range (ATR 14: 1.24)", "No major news events expected in next 4 hours"] },
  { icon: Activity, title: "Risk Assessment", signal: "Moderate", confidence: 85, factors: ["Position size within 2% risk limit", "Stop-loss at 1.5x ATR (standard risk)", "Current drawdown at 8% (below 15% threshold)", "Market correlation score: 0.32 (low correlation risk)"] },
];

export default function AIExplainability() {
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

        <div className="space-y-4">
          {EXPLANATIONS.map((e) => {
            const Icon = e.icon;
            const isPositive = e.signal === "Bullish" || e.signal === "BUY" || e.signal === "Moderate";
            return (
              <div key={e.title} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center">
                      <Icon className="w-5 h-5 text-[var(--amber)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{e.title}</h3>
                      <span className={`text-xs font-bold ${isPositive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{e.signal} · {e.confidence}% confidence</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${e.confidence >= 70 ? "bg-[var(--green)]" : e.confidence >= 50 ? "bg-[var(--amber)]" : "bg-[var(--red)]"}`} style={{ width: `${e.confidence}%` }} />
                    </div>
                    <span className="text-xs font-bold text-white w-8 text-right">{e.confidence}%</span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {e.factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--amber)]" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

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

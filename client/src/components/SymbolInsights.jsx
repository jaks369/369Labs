import { TrendingUp, TrendingDown, Activity, BarChart3, Zap } from "lucide-react";

function digitFrequency(ticks, decimals) {
  const freq = Array(10).fill(0);
  let total = 0;
  ticks.forEach((t) => {
    const d = t.lastDigit != null ? t.lastDigit : parseInt(Number(t.price).toFixed(decimals || 3).slice(-1), 10) || 0;
    freq[d]++; total++;
  });
  return { freq, total };
}

function trendBias(ticks) {
  let up = 0, down = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].price > ticks[i - 1].price) up++;
    else if (ticks[i].price < ticks[i - 1].price) down++;
  }
  const total = up + down || 1;
  return { up, down, bias: ((up - down) / total) * 100 };
}

function volatilityLevel(ticks) {
  if (ticks.length < 2) return { label: "—", pct: 0 };
  const prices = ticks.map((t) => Number(t.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = (min + max) / 2 || 1;
  const rangePct = ((max - min) / avg) * 100;
  const label = rangePct > 0.5 ? "High" : rangePct > 0.15 ? "Medium" : "Low";
  return { label, pct: rangePct };
}

export default function SymbolInsights({ symbol, ticks = [], trades = [], decimalPlaces = 3 }) {
  const { freq, total } = digitFrequency(ticks, decimalPlaces);
  const { up, down, bias } = trendBias(ticks);
  const vol = volatilityLevel(ticks);

  const symTrades = trades.filter((t) => (t.symbol || "") === symbol);
  const wins = symTrades.filter((t) => t.result === "win").length;
  const losses = symTrades.filter((t) => t.result === "loss").length;
  const wr = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
  const netPnl = symTrades.reduce((a, t) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);

  const maxDigit = total > 0 ? freq.indexOf(Math.max(...freq)) : null;
  const digitPct = maxDigit != null && total > 0 ? Math.round((freq[maxDigit] / total) * 100) : null;

  const insights = [
    {
      icon: bias > 5 ? TrendingUp : bias < -5 ? TrendingDown : Activity,
      label: bias > 5 ? "Bullish Bias" : bias < -5 ? "Bearish Bias" : "Neutral",
      value: `${up + down} ticks`,
      detail: `${up} up / ${down} down`,
      color: bias > 5 ? "var(--green)" : bias < -5 ? "var(--red)" : "var(--text-muted)",
    },
    {
      icon: BarChart3,
      label: "Digit Pattern",
      value: maxDigit != null ? `#${maxDigit} (${digitPct}%)` : "—",
      detail: `Most frequent last digit in ${total} ticks`,
      color: "var(--amber)",
    },
    {
      icon: Activity,
      label: "Volatility",
      value: vol.label,
      detail: `Range ${vol.pct.toFixed(2)}%`,
      color: vol.label === "High" ? "var(--red)" : vol.label === "Medium" ? "var(--amber)" : "var(--green)",
    },
  ];

  if (wr != null) {
    insights.push({
      icon: Zap,
      label: "Win Rate",
      value: `${wr}%`,
      detail: `${wins}W / ${losses}L · ${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}`,
      color: wr >= 50 ? "var(--green)" : "var(--red)",
    });
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-3.5 h-3.5 text-[var(--amber)]" />
        <h3 className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest">{symbol} Insights</h3>
      </div>
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-3 p-2.5 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <ins.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: ins.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-semibold text-white">{ins.label}</span>
                <span className="text-caption font-bold font-mono" style={{ color: ins.color }}>{ins.value}</span>
              </div>
              <p className="text-micro text-[var(--text-muted)] mt-0.5">{ins.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-[var(--text-muted)] mt-3 text-center">Auto-calculated from live tick data · updates every tick</p>
    </div>
  );
}

import { Sparkles, TrendingUp, TrendingDown, BarChart3, Scale } from "lucide-react";

interface AIVerdictsProps {
  symbol: string;
  ticks?: any[];
  trades?: any[];
  decimalPlaces?: number;
}

function marketHealth(ticks: any[]) {
  if (!ticks || ticks.length < 5) return null;
  let up = 0, down = 0;
  for (let i = 1; i < ticks.length; i++) {
    const a = Number(ticks[i].price), b = Number(ticks[i - 1].price);
    if (a > b) up++; else if (a < b) down++;
  }
  const total = up + down || 1;
  const bias = ((up - down) / total) * 100;
  const prices = ticks.map((t) => Number(t.price));
  const min = Math.min(...prices), max = Math.max(...prices);
  const avg = (min + max) / 2 || 1;
  const rangePct = ((max - min) / avg) * 100;
  const counts: Record<number, number> = {};
  for (const t of ticks) {
    if (typeof t.lastDigit !== "number") continue;
    counts[t.lastDigit] = (counts[t.lastDigit] || 0) + 1;
  }
  const digits = Object.entries(counts);
  const hottest = digits.length ? digits.sort((a, b) => b[1] - a[1])[0] : null;
  return {
    bias,
    dir: bias > 8 ? "up" : bias < -8 ? "down" : "flat",
    momentum: Math.abs(bias) > 40 ? "strong" : Math.abs(bias) > 15 ? "moderate" : "choppy",
    vol: rangePct > 0.5 ? "high" : rangePct > 0.15 ? "medium" : "low",
    rangePct,
    hottestDigit: hottest ? hottest[0] : null,
    hottestPct: hottest && digits.length ? Math.round((Number(hottest[1]) / digits.length) * 100) : 0,
  };
}

export default function AIVerdicts({ symbol, ticks = [], trades = [], decimalPlaces = 3 }: AIVerdictsProps) {
  const health = marketHealth(ticks);

  const settled = trades.filter((t) => t.result === "win" || t.result === "loss");
  const bySymbol: Record<string, { pnl: number; n: number; wins: number }> = {};
  const byType: Record<string, { pnl: number; n: number; wins: number }> = {};
  for (const t of settled) {
    const s = t.symbol || "-";
    bySymbol[s] = bySymbol[s] || { pnl: 0, n: 0, wins: 0 };
    bySymbol[s].pnl += parseFloat(t.profitLoss?.toString() || "0");
    bySymbol[s].n++; if (t.result === "win") bySymbol[s].wins++;
    const ty = t.contractType || "-";
    byType[ty] = byType[ty] || { pnl: 0, n: 0, wins: 0 };
    byType[ty].pnl += parseFloat(t.profitLoss?.toString() || "0");
    byType[ty].n++; if (t.result === "win") byType[ty].wins++;
  }

  const bestSymbol = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl)[0] || null;
  const bestType = Object.entries(byType).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].pnl - a[1].pnl)[0] || null;

  const verdicts: string[] = [];
  if (bestSymbol && bestSymbol[0] !== symbol) {
    verdicts.push(`${bestSymbol[0]} is your top performer (${Number(bestSymbol[1].pnl).toFixed(2)} P&L, ${bestSymbol[1].n} trades).`);
  }
  if (bestType) {
    verdicts.push(`${bestType[0]} yields the best edge (${Number(bestType[1].pnl).toFixed(2)} P&L on ${bestType[1].n} trades).`);
  }
  if (health) {
    if (health.vol === "high") verdicts.push(`${symbol} volatility is elevated (${health.rangePct.toFixed(2)}% range) — widen barriers.`);
    if (health.momentum === "strong") verdicts.push(health.dir === "up" ? `Momentum favors longs on ${symbol}.` : `Momentum favors shorts on ${symbol}.`);
    if (health.hottestDigit != null) verdicts.push(`Digit ${health.hottestDigit} is hot (${health.hottestPct}%) — consider matching.`);
  }
  if (!verdicts.length) verdicts.push("Keep a flat risk profile until more data accumulates.");

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
        <h3 className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest">369AI Verdicts</h3>
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" />
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">live</span>
        </span>
      </div>

      {health && (
        <div className="grid grid-cols-3 gap-1.5 mb-3 min-w-0">
          <div className={`min-w-0 px-1.5 py-1.5 rounded-lg border text-center ${health.dir === "up" ? "bg-[var(--green-soft)] border-[var(--green)]/25" : health.dir === "down" ? "bg-[var(--red-soft)] border-[var(--red)]/25" : "bg-[var(--surface-secondary)] border-[var(--border)]"}`}>
            <div className="text-[8px] uppercase tracking-wide text-[var(--text-muted)] font-bold mb-0.5 truncate">Momentum</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-1 min-w-0 ${health.dir === "up" ? "text-[var(--green)]" : health.dir === "down" ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}>
              {health.dir === "up" ? <TrendingUp className="w-3 h-3 shrink-0" /> : health.dir === "down" ? <TrendingDown className="w-3 h-3 shrink-0" /> : <BarChart3 className="w-3 h-3 shrink-0" />}
              <span className="truncate">{health.momentum}</span>
            </div>
          </div>
          <div className={`min-w-0 px-1.5 py-1.5 rounded-lg border text-center ${health.vol === "high" ? "bg-[var(--red-soft)] border-[var(--red)]/25" : health.vol === "medium" ? "bg-[var(--accent-soft)] border-[var(--accent-border)]" : "bg-[var(--surface-secondary)] border-[var(--border)]"}`}>
            <div className="text-[8px] uppercase tracking-wide text-[var(--text-muted)] font-bold mb-0.5 truncate">Volatility</div>
            <div className="text-xs font-bold font-mono truncate" style={{ color: health.vol === "high" ? "var(--red)" : health.vol === "medium" ? "var(--accent)" : "var(--green)" }}>{health.vol}</div>
          </div>
          <div className="min-w-0 px-1.5 py-1.5 rounded-lg border text-center bg-[var(--surface-secondary)] border-[var(--border)]">
            <div className="text-[8px] uppercase tracking-wide text-[var(--text-muted)] font-bold mb-0.5 truncate">Hot Digit</div>
            <div className="text-xs font-bold font-mono text-[var(--accent)] truncate">{health.hottestDigit != null ? `${health.hottestDigit} · ${health.hottestPct}%` : "—"}</div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {verdicts.map((v, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <Scale className="w-3 h-3 shrink-0 mt-0.5 text-[var(--accent)]" />
            <p className="text-[var(--text-secondary)] leading-relaxed">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-[var(--text-muted)] mt-3 text-center">Auto-derived from your live ticks and trade history</p>
    </div>
  );
}

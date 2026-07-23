import { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Activity, Loader2, GitCompare } from "lucide-react";
import { trpc } from "@/lib/trpc";

const METRICS = [
  { key: "winRate", label: "Win Rate", format: (v: number) => `${v.toFixed(1)}%` },
  { key: "profitFactor", label: "Profit Factor", format: (v: number) => v.toFixed(2) },
  { key: "totalTrades", label: "Total Trades", format: (v: number) => v.toString() },
  { key: "totalProfit", label: "Total Profit", format: (v: number) => v.toFixed(2) },
  { key: "maxDrawdown", label: "Max Drawdown", format: (v: number) => `${v.toFixed(1)}%` },
  { key: "sharpeRatio", label: "Sharpe Ratio", format: (v: number) => v.toFixed(2) },
];

const MOCK_RESULT = { winRate: 64.2, profitFactor: 1.87, totalTrades: 142, totalProfit: 384.5, maxDrawdown: 12.3, sharpeRatio: 1.54 };
const MOCK_RESULT2 = { winRate: 58.7, profitFactor: 1.52, totalTrades: 198, totalProfit: 267.8, maxDrawdown: 18.9, sharpeRatio: 1.12 };

export default function StrategyComparison() {
  const [strategy1, setStrategy1] = useState("Momentum Crossover");
  const [strategy2, setStrategy2] = useState("Mean Reversion");
  const comparison = { strategy1: { name: strategy1, ...MOCK_RESULT }, strategy2: { name: strategy2, ...MOCK_RESULT2 } };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <GitCompare className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Strategy Comparison</h1>
            <p className="text-xs text-[var(--text-muted)]">Compare performance metrics across strategies</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy A</label>
            <input value={strategy1} onChange={(e) => setStrategy1(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy B</label>
            <input value={strategy2} onChange={(e) => setStrategy2(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-4 text-[var(--text-muted)] font-medium">Metric</th>
                <th className="text-right p-4 text-[var(--amber)] font-bold">{comparison.strategy1.name}</th>
                <th className="text-right p-4 text-[var(--blue)] font-bold">{comparison.strategy2.name}</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const v1 = (comparison.strategy1 as any)[m.key] as number;
                const v2 = (comparison.strategy2 as any)[m.key] as number;
                const better = m.key === "maxDrawdown" ? (v1 < v2 ? 1 : v2 < v1 ? -1 : 0) : (v1 > v2 ? 1 : v2 > v1 ? -1 : 0);
                return (
                  <tr key={m.key} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="p-4 text-[var(--text-secondary)]">{m.label}</td>
                    <td className={`p-4 text-right font-mono font-bold ${better === 1 ? "text-[var(--green)]" : "text-white"}`}>{m.format(v1)}</td>
                    <td className={`p-4 text-right font-mono font-bold ${better === -1 ? "text-[var(--green)]" : "text-white"}`}>{m.format(v2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

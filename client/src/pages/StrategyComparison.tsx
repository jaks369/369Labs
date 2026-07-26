import { useState, useMemo, useEffect, useRef } from "react";
import { Loader2, GitCompare, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

type StrategyMetrics = {
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  totalProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
};

function computeMetrics(trades: any[]): StrategyMetrics {
  const totalTrades = trades.length;

  const wins = trades.filter(t => t.result === "win");
  const losses = trades.filter(t => t.result === "loss");
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

  const winSum = wins.reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const lossSum = losses.reduce((s, t) => s + Math.abs(parseFloat(t.profitLoss?.toString() || "0")), 0);
  const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? Infinity : 0;

  const totalProfit = trades.reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0);

  // max drawdown from cumulative P&L (sorted by entryTime)
  const ordered = [...trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  let peak = 0, cur = 0, maxDD = 0;
  for (const t of ordered) {
    cur += parseFloat(t.profitLoss?.toString() || "0");
    if (cur > peak) peak = cur;
    maxDD = Math.max(maxDD, peak - cur);
  }

  // sharpe ratio
  const returns = trades.map(t => parseFloat(t.profitLoss?.toString() || "0"));
  const meanReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / returns.length)
    : 0;
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(returns.length) : 0;

  return { winRate, profitFactor, totalTrades, totalProfit, maxDrawdown: maxDD, sharpeRatio };
}

const METRICS: { key: keyof StrategyMetrics; label: string; format: (v: number) => string; higherBetter: boolean }[] = [
  { key: "winRate", label: "Win Rate", format: v => `${v.toFixed(1)}%`, higherBetter: true },
  { key: "profitFactor", label: "Profit Factor", format: v => v === Infinity ? "∞" : v.toFixed(2), higherBetter: true },
  { key: "totalTrades", label: "Total Trades", format: v => v.toString(), higherBetter: false },
  { key: "totalProfit", label: "Total Profit", format: v => `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`, higherBetter: true },
  { key: "maxDrawdown", label: "Max Drawdown", format: v => `${v.toFixed(1)}%`, higherBetter: false },
  { key: "sharpeRatio", label: "Sharpe Ratio", format: v => v.toFixed(2), higherBetter: true },
];

export default function StrategyComparison() {
  const strategiesQuery = trpc.strategies.list.useQuery();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 5000 });
  const strategies = strategiesQuery.data || [];

  const [strategy1Id, setStrategy1Id] = useState<number | "">("");
  const [strategy2Id, setStrategy2Id] = useState<number | "">("");
  const autoSelected = useRef(false);

  useEffect(() => {
    if (!autoSelected.current && strategies.length >= 2) {
      autoSelected.current = true;
      setStrategy1Id(strategies[0].id);
      setStrategy2Id(strategies[1].id);
    }
  }, [strategies]);

  const s1 = strategies.find(s => s.id === strategy1Id);
  const s2 = strategies.find(s => s.id === strategy2Id);

  const allTrades = tradesQuery.data || [];

  const metrics1 = useMemo(() => s1 ? computeMetrics(allTrades.filter(t => t.strategyId === s1.id)) : null, [allTrades, s1]);
  const metrics2 = useMemo(() => s2 ? computeMetrics(allTrades.filter(t => t.strategyId === s2.id)) : null, [allTrades, s2]);

  const loading = strategiesQuery.isLoading || tradesQuery.isLoading;

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

        {loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" /></div>
        ) : strategies.length < 2 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="text-[var(--text-secondary)]">Need at least 2 strategies to compare.</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Create strategies in the Strategy Builder first.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy A</label>
                <select value={strategy1Id} onChange={e => setStrategy1Id(Number(e.target.value))}
                  className="w-full bg-[#1a1a2e] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--amber)] outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white">
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy B</label>
                <select value={strategy2Id} onChange={e => setStrategy2Id(Number(e.target.value))}
                  className="w-full bg-[#1a1a2e] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--amber)] outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white">
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {metrics1 && metrics2 ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left p-4 text-[var(--text-muted)] font-medium">Metric</th>
                      <th className="text-right p-4 text-[var(--amber)] font-bold">{s1!.name}</th>
                      <th className="text-right p-4 text-[var(--blue)] font-bold">{s2!.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(m => {
                      const v1 = metrics1[m.key];
                      const v2 = metrics2[m.key];
                      const better = m.higherBetter
                        ? (v1 > v2 ? 1 : v2 > v1 ? -1 : 0)
                        : (v1 < v2 ? 1 : v2 < v1 ? -1 : 0);
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
            ) : (
              <div className="flex items-center justify-center h-32 text-[var(--text-muted)]">Select two strategies to compare</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

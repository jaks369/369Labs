import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Play, BarChart3, Loader2, CheckCircle2, XCircle, AlertCircle, Search, CandlestickChart } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { derivWS } from "@/services/derivWebSocket";
import { runBacktest, BacktestResult } from "@/services/BacktestEngine";
import Sparkline from "@/components/Sparkline";
import { StrategyRule } from "@/components/RuleBuilder";

const IT_SYMBOLS = ["R_10","R_25","R_50","R_75","R_100","1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V","BOOM300","BOOM500","BOOM1000","CRASH300","CRASH500","CRASH1000"];

export default function Backtesting() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_100");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [stake, setStake] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<number | null>(null);
  const [signalRule, setSignalRule] = useState<StrategyRule | null>(null);
  const [loadedSignal, setLoadedSignal] = useState<any | null>(null);

  const [sweepParam, setSweepParam] = useState<"barrier" | "count" | "stake">("barrier");
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [sweepGrid, setSweepGrid] = useState<{ value: number; winRate: number; trades: number; pnl: number }[] | null>(null);

  const strategiesQuery = trpc.strategies.list.useQuery();
  const signalsQuery = trpc.signals.list.useQuery();

  const params = new URLSearchParams(window.location.search);
  const signalId = params.get("signal");

  if (!isAuthenticated) { navigate("/login"); return null; }

  // When arriving from a signal, load its rule + symbol automatically.
  if (signalId && !loadedSignal && (signalsQuery.data as any[])?.length) {
    const sig = (signalsQuery.data as any[]).find((s: any) => String(s.id) === String(signalId));
    if (sig) {
      setLoadedSignal(sig);
      setSymbol(sig.symbol);
      setSignalRule(sig.rule as StrategyRule);
    }
  }

  const runBacktestHandler = async () => {
    const rule = (selectedStrategyId
      ? (strategiesQuery.data?.find(s => s.id === selectedStrategyId)?.config as any)?.rule
      : signalRule) as StrategyRule | undefined;
    if (!rule) { toast(selectedStrategyId ? "Selected strategy has no deployable rule. Use visual IF/THEN mode." : "No strategy or signal selected.", "error"); return; }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const startEpoch = Math.floor(new Date(startDate).getTime() / 1000);
      const endEpoch = Math.floor(new Date(endDate).getTime() / 1000);

      const ticks = await derivWS.fetchTickHistory(symbol, startEpoch, endEpoch);
      if (ticks.length < 20) { throw new Error(`Only ${ticks.length} ticks returned â€” need at least 20. Try a wider date range.`); }

      const backtestResult = await runBacktest(ticks, rule, stake);
      setResult(backtestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  const SWEEP_RANGES: Record<string, number[]> = {
    barrier: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    count: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    stake: [1, 2, 3, 5, 8, 10, 15, 20, 30, 50],
  };

  const runSweep = async () => {
    const rule = (selectedStrategyId
      ? (strategiesQuery.data?.find(s => s.id === selectedStrategyId)?.config as any)?.rule
      : signalRule) as StrategyRule | undefined;
    if (!rule) { toast("Select a strategy or signal first.", "error"); return; }
    setSweepRunning(true);
    setSweepError(null);
    setSweepGrid(null);
    try {
      const startEpoch = Math.floor(new Date(startDate).getTime() / 1000);
      const endEpoch = Math.floor(new Date(endDate).getTime() / 1000);
      const ticks = await derivWS.fetchTickHistory(symbol, startEpoch, endEpoch);
      if (ticks.length < 20) throw new Error(`Only ${ticks.length} ticks returned â€” need at least 20.`);
      const values = SWEEP_RANGES[sweepParam];
      const grid: { value: number; winRate: number; trades: number; pnl: number }[] = [];
      for (const v of values) {
        let sweptRule = rule;
        let sweptStake = stake;
        if (sweepParam === "stake") {
          sweptStake = v;
        } else {
          sweptRule = {
            ...rule,
            condition: { ...(rule.condition || ({} as any)), [sweepParam]: v },
          };
          if (rule.conditions) {
            // sweep only applies cleanly to flat conditions; tree kept as-is
          }
        }
        const r = await runBacktest(ticks, sweptRule, sweptStake);
        grid.push({ value: v, winRate: r.winRate, trades: r.totalTrades, pnl: r.totalPnl });
      }
      setSweepGrid(grid);
    } catch (e) {
      setSweepError(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setSweepRunning(false);
    }
  };

  const heatColor = (wr: number) => {
    // 40% red -> 60% amber -> 75%+ green
    if (wr >= 75) return "bg-[var(--green-soft)] text-white";
    if (wr >= 60) return "bg-[var(--green-soft)] text-[var(--green)]";
    if (wr >= 50) return "bg-[var(--amber-soft)] text-[var(--amber-hover)]";
    if (wr >= 40) return "bg-[var(--red-soft)] text-[var(--red)]";
    return "bg-[var(--red-soft)] text-white";
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Backtesting Engine</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Test your strategies against historical market data from Deriv</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Parameters</h2>

            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Symbol</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm">
                {IT_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Strategy</label>
              {loadedSignal && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--cyan-soft)] border border-[var(--cyan-border)] flex items-start gap-2">
                <CandlestickChart className="w-4 h-4 text-[var(--cyan)] mt-0.5" />
                <div className="text-xs text-[var(--text-secondary)]">
                  <b className="text-[var(--cyan)]">Backtesting AI signal:</b> {loadedSignal.title} (win rate {loadedSignal.winRate}%, {loadedSignal.sampleSize} samples). Rule loaded automatically.
                </div>
              </div>
            )}
            <select value={selectedStrategyId || ""} onChange={e => setSelectedStrategyId(Number(e.target.value))} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm">
                <option value="">{strategiesQuery.isLoading ? "Loading..." : strategiesQuery.isError ? "Failed to load" : "Select a strategy..."}</option>
                {(strategiesQuery.data || []).filter(s => (s.config as any)?.rule).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {strategiesQuery.isError && <p className="text-xs text-[var(--red)] mt-1">Failed to load strategies.</p>}
              {(!strategiesQuery.isLoading && !strategiesQuery.isError && (!strategiesQuery.data || strategiesQuery.data.length === 0)) && (
                <p className="text-xs text-[var(--text-muted)] mt-1">No strategies found. Save one in Strategy Builder first.</p>
              )}
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Stake ($)</label>
              <input type="number" value={stake} onChange={e => setStake(Number(e.target.value))} min={0.35} step={0.5} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <Button onClick={runBacktestHandler} disabled={running || !selectedStrategyId} className="w-full bg-[var(--amber)] hover:bg-[var(--amber)] text-white">
              {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching ticks...</> : <><Play className="w-4 h-4 mr-2" /> Run Backtest</>}
            </Button>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {error && (
              <div className="bg-[var(--red-soft)] border border-[var(--red)]/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--red)] shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--red)]">{error}</p>
              </div>
            )}

            {running && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-[var(--amber)] mx-auto mb-4" />
                  <p className="text-[var(--text-secondary)]">Fetching historical ticks from Deriv and running simulation...</p>
                </div>
              </div>
            )}

            {result && !running && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Total Trades</p>
                    <p className="text-2xl font-bold text-white mt-1">{result.totalTrades}</p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Win Rate</p>
                    <p className={`text-2xl font-bold mt-1 ${result.winRate >= 50 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{result.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Total P&L</p>
                    <p className={`text-2xl font-bold mt-1 ${result.totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {result.totalPnl >= 0 ? "+" : ""}${result.totalPnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Max Drawdown</p>
                    <p className="text-2xl font-bold text-[var(--red)] mt-1">-${result.maxDrawdown.toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4">Equity Curve (cumulative P&L)</h3>
                  <Sparkline data={(result.equityCurve || []).map((v: number) => ({ value: v }))} />
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4">Trade Log ({result.trades.length} trades)</h3>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                          <th className="pb-3 font-bold">#</th>
                          <th className="pb-3 font-bold">ENTRY</th>
                          <th className="pb-3 font-bold">EXIT</th>
                          <th className="pb-3 font-bold">TYPE</th>
                          <th className="pb-3 font-bold">RESULT</th>
                          <th className="pb-3 font-bold text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {result.trades.slice(0, 100).map((t, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="py-3 text-[var(--text-muted)]">{i + 1}</td>
                            <td className="py-3 text-[var(--text-secondary)]">${t.entryPrice.toFixed(2)}</td>
                            <td className="py-3 text-[var(--text-secondary)]">${t.exitPrice.toFixed(2)}</td>
                            <td className="py-3 text-[var(--text-secondary)]">{t.contractType}</td>
                            <td className="py-3">
                              {t.result === "win" ? <CheckCircle2 className="w-4 h-4 text-[var(--green)]" /> : <XCircle className="w-4 h-4 text-[var(--red)]" />}
                            </td>
                            <td className={`py-3 text-right font-bold ${t.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                              {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4">Equity Curve</h3>
                  <div className="h-48 flex items-end gap-0.5">
                    {result.equityCurve.map((val, i) => {
                      const min = Math.min(...result.equityCurve, 0);
                      const max = Math.max(...result.equityCurve, 1);
                      const h = ((val - min) / (max - min)) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{
                            height: `${Math.max(h, 2)}%`,
                            backgroundColor: val >= 0 ? "var(--green)" : "var(--red)",
                            opacity: 0.7,
                          }}
                          title={`$${val.toFixed(2)}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-1">Parameter Sweep</h3>
                  <p className="text-xs text-[var(--text-muted)] mb-4">Stress-test one parameter across a range on the same tick window. Cells show win rate (green = strong, red = weak).</p>
                  <div className="flex items-center gap-2 mb-4">
                    <select value={sweepParam} onChange={(e) => setSweepParam(e.target.value as any)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm">
                      <option value="barrier">Barrier digit (0-9)</option>
                      <option value="count">Count / frequency (1-10)</option>
                      <option value="stake">Stake ($)</option>
                    </select>
                    <Button onClick={runSweep} disabled={sweepRunning} className="bg-[var(--amber)] hover:bg-[var(--amber)] text-white">
                      {sweepRunning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sweeping...</> : <><Search className="w-4 h-4 mr-2" /> Run Sweep</>}
                    </Button>
                  </div>
                  {sweepError && <p className="text-sm text-[var(--red)] mb-3">{sweepError}</p>}
                  {sweepGrid && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                            <th className="pb-2 font-bold">{sweepParam}</th>
                            <th className="pb-2 font-bold">Win Rate</th>
                            <th className="pb-2 font-bold">Trades</th>
                            <th className="pb-2 font-bold text-right">P&L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {sweepGrid.map((c) => (
                            <tr key={c.value} className="hover:bg-white/5">
                              <td className="py-2 font-bold text-white">{c.value}</td>
                              <td className={`py-2 px-2 rounded font-bold ${heatColor(c.winRate)}`}>{c.winRate.toFixed(1)}%</td>
                              <td className="py-2 text-[var(--text-secondary)]">{c.trades}</td>
                              <td className={`py-2 text-right font-bold ${c.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {!result && !running && !error && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 flex items-center justify-center h-64">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 text-[var(--border)]" />
                  <p className="text-[var(--text-muted)]">Configure parameters and run a backtest to see results</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


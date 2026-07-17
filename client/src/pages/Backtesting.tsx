import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { History, Play, BarChart3, TrendingUp, Clock, Loader2, CheckCircle2, XCircle, AlertCircle, Search, CandlestickChart } from "lucide-react";
import { useLocation } from "wouter";
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
      ? strategiesQuery.data?.find(s => s.id === selectedStrategyId)?.config?.rule
      : signalRule) as StrategyRule | undefined;
    if (!rule) { alert(selectedStrategyId ? "Selected strategy has no deployable rule. Use visual IF/THEN mode." : "No strategy or signal selected."); return; }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const startEpoch = Math.floor(new Date(startDate).getTime() / 1000);
      const endEpoch = Math.floor(new Date(endDate).getTime() / 1000);

      const ticks = await derivWS.fetchTickHistory(symbol, startEpoch, endEpoch);
      if (ticks.length < 20) { throw new Error(`Only ${ticks.length} ticks returned — need at least 20. Try a wider date range.`); }

      const backtestResult = await runBacktest(ticks, rule, stake);
      setResult(backtestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Backtesting Engine</h1>
            <p className="text-slate-400 text-sm mt-1">Test your strategies against historical market data from Deriv</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-[#161B22] border border-[#30363D] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Parameters</h2>

            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Symbol</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm">
                {IT_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Strategy</label>
              {loadedSignal && (
              <div className="mb-4 p-3 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-start gap-2">
                <CandlestickChart className="w-4 h-4 text-amber-400 mt-0.5" />
                <div className="text-xs text-slate-300">
                  <b className="text-amber-400">Backtesting AI signal:</b> {loadedSignal.title} (win rate {loadedSignal.winRate}%, {loadedSignal.sampleSize} samples). Rule loaded automatically.
                </div>
              </div>
            )}
            <select value={selectedStrategyId || ""} onChange={e => setSelectedStrategyId(Number(e.target.value))} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm">
                <option value="">Select a strategy...</option>
                {(strategiesQuery.data || []).filter(s => s.config?.rule).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                <p className="text-xs text-slate-600 mt-1">No strategies found. Save one in Strategy Builder first.</p>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Stake ($)</label>
              <input type="number" value={stake} onChange={e => setStake(Number(e.target.value))} min={0.35} step={0.5} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <Button onClick={runBacktestHandler} disabled={running || !selectedStrategyId} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching ticks...</> : <><Play className="w-4 h-4 mr-2" /> Run Backtest</>}
            </Button>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {running && (
              <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
                  <p className="text-slate-400">Fetching historical ticks from Deriv and running simulation...</p>
                </div>
              </div>
            )}

            {result && !running && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Trades</p>
                    <p className="text-2xl font-bold text-white mt-1">{result.totalTrades}</p>
                  </div>
                  <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Win Rate</p>
                    <p className={`text-2xl font-bold mt-1 ${result.winRate >= 50 ? "text-emerald-500" : "text-red-500"}`}>{result.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total P&L</p>
                    <p className={`text-2xl font-bold mt-1 ${result.totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {result.totalPnl >= 0 ? "+" : ""}${result.totalPnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Drawdown</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">-${result.maxDrawdown.toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4">Equity Curve (cumulative P&L)</h3>
                  <Sparkline data={(result.equityCurve || []).map((v: number) => ({ value: v }))} />
                </div>

                <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4">Trade Log ({result.trades.length} trades)</h3>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-[#30363D]">
                          <th className="pb-3 font-bold">#</th>
                          <th className="pb-3 font-bold">ENTRY</th>
                          <th className="pb-3 font-bold">EXIT</th>
                          <th className="pb-3 font-bold">TYPE</th>
                          <th className="pb-3 font-bold">RESULT</th>
                          <th className="pb-3 font-bold text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#30363D]">
                        {result.trades.slice(0, 100).map((t, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="py-3 text-slate-500">{i + 1}</td>
                            <td className="py-3 text-slate-300">${t.entryPrice.toFixed(2)}</td>
                            <td className="py-3 text-slate-300">${t.exitPrice.toFixed(2)}</td>
                            <td className="py-3 text-slate-400">{t.contractType}</td>
                            <td className="py-3">
                              {t.result === "win" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                            </td>
                            <td className={`py-3 text-right font-bold ${t.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
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
                            backgroundColor: val >= 0 ? "#10B981" : "#EF4444",
                            opacity: 0.7,
                          }}
                          title={`$${val.toFixed(2)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {!result && !running && !error && (
              <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 flex items-center justify-center h-64">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 text-slate-700" />
                  <p className="text-slate-500">Configure parameters and run a backtest to see results</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

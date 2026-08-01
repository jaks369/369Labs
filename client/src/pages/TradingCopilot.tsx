import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Bot, TrendingUp, Activity, BarChart3, BrainCircuit, Loader2, Sparkles } from "lucide-react";
import AIChatWindow from "@/components/AIChatWindow";
import { useState, useEffect, useMemo, useRef } from "react";
import { derivWS } from "@/services/derivWebSocket";
import { getValidSymbols, getSymbolDisplayName } from "@/lib/symbols";

export default function TradingCopilot() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  if (!isAuthenticated) { navigate("/login"); return null; }

  const [symbol, setSymbol] = useState("R_100");
  const [tick, setTick] = useState<{ price: number; change: number } | null>(null);
  const listenerRef = useRef<{ onTick: (t: any) => void } | null>(null);

  useEffect(() => {
    const id = derivWS.subscribe(symbol);
    const listener = {
      onTick: (t: any) => setTick(prev => prev ? { price: Number(t.price), change: ((Number(t.price) - prev.price) / prev.price) * 100 } : { price: Number(t.price), change: 0 }),
    };
    listenerRef.current = listener;
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); derivWS.unsubscribe(id); };
  }, [symbol]);

  const dp = derivWS.decimalPlacesFor(symbol);

  const tradesQuery = trpc.trades.list.useQuery({ limit: 500 });
  const strategiesQuery = trpc.strategies.list.useQuery();

  const stats = useMemo(() => {
    const trades = tradesQuery.data || [];
    const total = trades.length;
    const wins = trades.filter(t => t.result === "win").length;
    const pnl = trades.reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0);
    return { total, wins, winRate: total > 0 ? (wins / total) * 100 : 0, pnl };
  }, [tradesQuery.data]);

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)] flex items-center justify-center">
              <Bot className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Trading Copilot</h1>
              <p className="text-xs text-[var(--text-muted)]">AI-powered trading assistant with real-time market context</p>
            </div>
          </div>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
            {getValidSymbols().map(s => <option key={s} value={s}>{getSymbolDisplayName(s)}</option>)}
          </select>
        </div>

        {/* Market Context + Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-micro">{getSymbolDisplayName(symbol)} Live</span>
              {tick && <span className={`text-caption font-bold ${tick.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{tick.change >= 0 ? "+" : ""}{Number(tick.change).toFixed(2)}%</span>}
            </div>
            <p className="text-3xl font-bold text-white font-mono">
              {tick ? Number(tick.price).toFixed(dp) : <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)] inline" />}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <span className="text-micro">Total P&L</span>
            <p className={`text-xl font-bold mt-1 font-mono ${stats.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
              {stats.pnl >= 0 ? "+" : ""}${Number(stats.pnl).toFixed(2)}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <span className="text-micro">Win Rate</span>
            <p className="text-xl font-bold mt-1 font-mono text-[var(--green)]">{Number(stats.winRate).toFixed(1)}%</p>
            <p className="text-caption mt-0.5">{stats.wins}/{stats.total} trades</p>
          </div>
        </div>

        {/* Main content: Chat + Side info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AIChatWindow />
          </div>
          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" /> Quick Actions</h3>
              <div className="space-y-2">
                {[
                  { icon: BrainCircuit, label: "Analyze current market", action: `Analyze ${symbol} market conditions and give a trading recommendation.` },
                  { icon: BarChart3, label: "Portfolio performance", action: "Review my portfolio performance and risk metrics." },
                  { icon: Activity, label: "Strategy insights", action: "Which of my strategies is performing best and why?" },
                  { icon: TrendingUp, label: "Recent trades review", action: "Review my last 10 trades and tell me what I'm doing well or poorly." },
                ].map(q => (
                  <button key={q.label} onClick={() => {
                    const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
                    if (input) { input.value = q.action; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); }
                  }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-white/5 hover:text-white transition-colors">
                    <q.icon className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Strategies summary */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-[var(--accent)]" /> Strategies ({strategiesQuery.data?.length || 0})</h3>
              {strategiesQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
              ) : (strategiesQuery.data || []).length === 0 ? (
                <div className="empty-state"><p className="empty-state-desc">No strategies yet.</p></div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(strategiesQuery.data || []).slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5">
                      <span className="text-xs text-white truncate">{s.name}</span>
                      <span className={`text-[9px] font-bold ${s.isActive ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}>{s.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

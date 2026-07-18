import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Play,
  Square,
  Activity,
  AlertCircle,
  AlertTriangle,
  Zap,
  Plus,
} from "lucide-react";
import { useLocation } from "wouter";
import { BotEngine, BotStatus, BotTrade } from "@/services/BotEngine";
import { runBacktest } from "@/services/BacktestEngine";
import { derivWS } from "@/services/derivWebSocket";
import { StrategyRule } from "@/components/RuleBuilder";
import { StrategyBuilderContent } from "@/pages/StrategyBuilder";
import { pushTimeline } from "@/components/AITimeline";

interface RunningBot {
  runId: number;
  strategyId: number;
  name: string;
  symbol: string;
  engine: BotEngine;
  status: BotStatus;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  backtestWinRate: number | null;
  lastLog?: string;
}

// A strategy is only deployable if it was built with the structured rule builder
// (StrategyBuilder's "visual" mode). The freeform block-notes mode has no
// machine-executable shape yet.
function extractRule(config: any): StrategyRule | null {
  return config && typeof config === "object" && config.rule ? (config.rule as StrategyRule) : null;
}

const DEFAULT_SYMBOL = "R_100";

export default function Bots() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [runningBots, setRunningBots] = useState<RunningBot[]>([]);
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const strategiesQuery = trpc.strategies.list.useQuery();
  const derivTokenQuery = trpc.deriv.getToken.useQuery();
  const startRunMutation = trpc.bot.startRun.useMutation();
  const stopRunMutation = trpc.bot.stopRun.useMutation();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const notifyTelegram = trpc.telegram.send.useMutation();

  const alertTg = (msg: string) => { try { notifyTelegram.mutate({ message: msg }); } catch { /* ignore */ } };

  // Keep a live-mutable ref so BotEngine callbacks (closures created at deploy time)
  // always update the latest state array rather than a stale snapshot.
  const botsRef = useRef<RunningBot[]>([]);
  useEffect(() => {
    botsRef.current = runningBots;
  }, [runningBots]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Stop all engines if the user navigates away / unmounts, so bots don't keep
  // trading in the background with no visible controls.
  useEffect(() => {
    return () => {
      botsRef.current.forEach((b) => b.engine.stop());
    };
  }, []);

  const updateBot = (runId: number, patch: Partial<RunningBot>) => {
    setRunningBots((prev) => prev.map((b) => (b.runId === runId ? { ...b, ...patch } : b)));
  };

  const handleDeploy = async (strategy: { id: number; name: string; config: any }) => {
    const rule = extractRule(strategy.config);
    if (!rule) {
      alert("This strategy was built in freeform notes mode and can't be deployed yet — rebuild it using the visual IF/THEN rule builder.");
      return;
    }
    if (!derivTokenQuery.data?.token) {
      alert("Add your Deriv API token in Settings before deploying a bot.");
      navigate("/settings");
      return;
    }

    setDeployingId(strategy.id);
    try {
      derivWS.setApiToken(derivTokenQuery.data.token);

      const botRun = await startRunMutation.mutateAsync({ strategyId: strategy.id });

      const engine = new BotEngine({
        onStatusChange: (status) => updateBot(botRun.id, { status }),
        onTrade: (trade: BotTrade) => {
          if (trade.result === "open") return; // only persist settled trades
          const current = botsRef.current.find((b) => b.runId === botRun.id);
          updateBot(botRun.id, {
            pnl: (current?.pnl || 0) + parseFloat(trade.pnl),
            trades: (current?.trades || 0) + 1,
            wins: (current?.wins || 0) + (trade.result === "win" ? 1 : 0),
            losses: (current?.losses || 0) + (trade.result === "loss" ? 1 : 0),
          });
          saveTradeMutation.mutate({
            botRunId: botRun.id,
            strategyId: strategy.id,
            entryTime: trade.timestamp,
            entryPrice: String(trade.entryPrice),
            stake: String(trade.stake),
            profitLoss: trade.pnl,
            result: trade.result,
            symbol: trade.symbol,
            contractType: trade.contractType,
            contractId: trade.contractId ? String(trade.contractId) : undefined,
          });
          const decimalRegex = /^\d+(\.\d{1,8})?$/;
          if (!decimalRegex.test(trade.stake.toString())) {
            console.warn(`Trade saved with unexpected stake format: ${trade.stake}`);
          }
          alertTg(`🔔 ${strategy.name} [${trade.symbol}] trade ${trade.result.toUpperCase()} · stake $${trade.stake} · P&L ${trade.pnl >= 0 ? "+" : ""}${trade.pnl}`);
        },
        onLog: (message) => updateBot(botRun.id, { lastLog: message }),
      });

      const newBot: RunningBot = {
        runId: botRun.id,
        strategyId: strategy.id,
        name: strategy.name,
        symbol: rule.symbol || DEFAULT_SYMBOL,
        engine,
        status: "running",
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        backtestWinRate: null,
      };
      setRunningBots((prev) => [...prev, newBot]);

      engine.start({ symbol: rule.symbol || DEFAULT_SYMBOL, strategy: rule });
      pushTimeline({ icon: "bot", text: `Bot started: ${strategy.name} on ${rule.symbol || DEFAULT_SYMBOL}` });
      alertTg(`🚀 Bot deployed: ${strategy.name} on ${rule.symbol || DEFAULT_SYMBOL}`);

      // Capture the expected win rate via backtest so we can flag regime drift live.
      const stake = Number(rule.params?.stake ?? 1);
      derivWS
        .fetchTickHistory(rule.symbol || DEFAULT_SYMBOL, Math.floor(Date.now() / 1000) - 7 * 24 * 3600, Math.floor(Date.now() / 1000))
        .then(async (ticks) => {
          if (!ticks || ticks.length < 20) return;
          const res = await runBacktest(ticks, rule, stake);
          updateBot(botRun.id, { backtestWinRate: res.winRate });
        })
        .catch(() => {
          /* backtest unavailable (e.g. invalid token) — badge stays hidden */
        });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to deploy bot");
    } finally {
      setDeployingId(null);
    }
  };

  const handleStop = async (bot: RunningBot) => {
    bot.engine.stop();

    if (bot.engine.hasPendingTrade()) {
      updateBot(bot.runId, { lastLog: "Stopping — waiting for open trade to settle..." });
      await bot.engine.waitForOpenTradeToSettle();
    }

    // Read final totals directly from the engine (single source of truth for
    // settled trades) rather than the UI's separately-accumulated state, so
    // a trade that settled during the wait above is correctly included.
    const finalTrades = bot.engine.getTrades().length;
    const finalPnl = bot.engine.getTotalPnl();

    setRunningBots((prev) => prev.filter((b) => b.runId !== bot.runId));
    pushTimeline({ icon: "bot", text: `Bot stopped: ${bot.name} · ${finalTrades} trades · P&L ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)}` });
    alertTg(`⏹️ Bot stopped: ${bot.name} · ${finalTrades} trades · P&L ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)}`);
    try {
      await stopRunMutation.mutateAsync({
        id: bot.runId,
        status: bot.status === "error" ? "error" : "stopped",
        totalTrades: finalTrades,
        totalProfitLoss: finalPnl.toFixed(2),
      });
    } catch {
      // Non-fatal — the bot is already stopped client-side.
    }
  };

  if (creating) {
    return (
      <div className="p-6 lg:p-10">
        <StrategyBuilderContent
          embedded
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); strategiesQuery.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Automated Bots</h1>
          <p className="text-[#64748B] text-sm font-medium">Manage and monitor your 24/7 trading instances.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create New Bot
        </Button>
      </div>

      {!derivTokenQuery.data?.token && (
        <div className="mb-6 p-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
          <p className="text-xs text-[#F59E0B]">
            No Deriv API token on file — bots can't place real trades until you add one in{" "}
            <button className="underline font-bold" onClick={() => navigate("/settings")}>
              Settings
            </button>
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Bots List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bloomberg-panel">
            <div className="p-4 border-b border-[#252B35] flex items-center justify-between bg-black/20">
              <h2 className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Running Instances</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#22C55E]">{runningBots.length} Active</span>
              </div>
            </div>

            <div className="p-0">
              {runningBots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 bg-[#151B23] rounded-full flex items-center justify-center mb-4 border border-[#252B35]">
                    <Bot className="w-6 h-6 text-[#64748B]" />
                  </div>
                  <p className="text-[#64748B] text-sm mb-6">No bots are currently running.</p>
                  <Button variant="outline" className="btn-outline text-xs" onClick={() => navigate("/strategy-builder")}>
                    Deploy your first strategy
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[#252B35]">
                  {runningBots.map((bot) => (
                    <div key={bot.runId} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                          bot.status === "error"
                            ? "bg-[#EF4444]/10 border-[#EF4444]/20"
                            : "bg-[#F59E0B]/10 border-[#F59E0B]/20"
                        }`}>
                          <Activity className={`w-5 h-5 ${bot.status === "error" ? "text-[#EF4444]" : "text-[#F59E0B] animate-pulse"}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                          <p className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">
                            {bot.symbol} • {bot.trades} trades • {bot.status}
                          </p>
                          {bot.lastLog && <p className="text-[10px] text-[#64748B] mt-1">{bot.lastLog}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Profit/Loss</p>
                          <p className={`text-sm font-bold ${bot.pnl >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                            {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toFixed(2)}
                          </p>
                        </div>
                        {(() => {
                          const settled = bot.wins + bot.losses;
                          const liveWinRate = settled > 0 ? (bot.wins / settled) * 100 : null;
                          if (bot.backtestWinRate == null || liveWinRate == null || settled < 5) return null;
                          const drift = liveWinRate - bot.backtestWinRate;
                          const mismatch = drift <= -15 || liveWinRate < bot.backtestWinRate * 0.7;
                          if (!mismatch) return null;
                          return (
                            <div className="max-w-[180px] text-left bg-[#EF4444]/10 border border-[#EF4444]/30 rounded px-2 py-1">
                              <div className="flex items-center gap-1 text-[10px] font-bold text-[#EF4444] uppercase">
                                <AlertTriangle className="w-3 h-3" /> Regime mismatch
                              </div>
                              <p className="text-[10px] text-[#EF4444]/80 leading-tight mt-0.5">
                                Live {liveWinRate.toFixed(0)}% vs backtest {bot.backtestWinRate.toFixed(0)}%
                              </p>
                            </div>
                          );
                        })()}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20 hover:bg-[#EF4444] hover:text-white"
                          onClick={() => handleStop(bot)}
                        >
                          <Square className="w-3 h-3 mr-2 fill-current" /> Stop
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Stats & Available Strategies */}
        <div className="space-y-8">
          <div className="bloomberg-panel p-6">
            <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-6">System Health</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#94A3B8]">Active Bots</span>
                <span className="text-[10px] font-bold text-[#94A3B8] uppercase">{runningBots.length}</span>
              </div>
            </div>
          </div>

          <div className="bloomberg-panel p-6">
            <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-6">Ready to Deploy</h3>
            <div className="space-y-3">
              {strategiesQuery.data?.map((s: any) => (
                <div key={s.id} className="p-4 rounded-xl bg-[#151B23] border border-[#252B35] hover:border-[#F59E0B]/50 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-xs font-bold text-white">{s.name}</h4>
                    <Zap className="w-3 h-3 text-[#F59E0B]" />
                  </div>
                  <Button
                    className="w-full h-8 text-[10px] font-bold bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B] hover:text-white border border-[#F59E0B]/20"
                    disabled={deployingId === s.id || runningBots.some((b) => b.strategyId === s.id)}
                    onClick={() => handleDeploy(s)}
                  >
                    <Play className="w-3 h-3 mr-2 fill-current" />
                    {runningBots.some((b) => b.strategyId === s.id) ? "Running" : deployingId === s.id ? "Deploying..." : "Deploy Bot"}
                  </Button>
                </div>
              ))}
              {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                <p className="text-xs text-[#64748B] italic text-center py-4">No strategies found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



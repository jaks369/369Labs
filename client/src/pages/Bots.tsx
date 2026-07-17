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
  Zap,
  Plus,
} from "lucide-react";
import { useLocation } from "wouter";
import { BotEngine, BotStatus, BotTrade } from "@/services/BotEngine";
import { derivWS } from "@/services/derivWebSocket";
import { StrategyRule } from "@/components/RuleBuilder";

interface RunningBot {
  runId: number;
  strategyId: number;
  name: string;
  symbol: string;
  engine: BotEngine;
  status: BotStatus;
  pnl: number;
  trades: number;
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
  const isMountedRef = useRef(true);

  const strategiesQuery = trpc.strategies.list.useQuery();
  const derivTokenQuery = trpc.deriv.getToken.useQuery();
  const startRunMutation = trpc.bot.startRun.useMutation();
  const stopRunMutation = trpc.bot.stopRun.useMutation();
  const saveTradeMutation = trpc.trades.save.useMutation();

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
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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
        onStatusChange: (status) => { if (isMountedRef.current) updateBot(botRun.id, { status }); },
        onTrade: async (trade: BotTrade) => {
          if (trade.result === "open") return;
          const current = botsRef.current.find((b) => b.runId === botRun.id);
          if (isMountedRef.current) {
            updateBot(botRun.id, {
              pnl: (current?.pnl || 0) + parseFloat(trade.pnl),
              trades: (current?.trades || 0) + 1,
            });
          }
          try {
            await saveTradeMutation.mutateAsync({
              botRunId: botRun.id,
              strategyId: strategy.id,
              entryTime: trade.timestamp,
              entryPrice: String(trade.entryPrice),
              stake: String(trade.stake),
              profitLoss: trade.pnl,
              result: trade.result,
              contractId: trade.contractId ? String(trade.contractId) : undefined,
            });
          } catch (e) {
            console.error("Failed to persist trade:", e);
          }
          const decimalRegex = /^\d+(\.\d{1,8})?$/;
          if (!decimalRegex.test(trade.stake.toString())) {
            console.warn(`Trade saved with unexpected stake format: ${trade.stake}`);
          }
        },
        onLog: (message) => { if (isMountedRef.current) updateBot(botRun.id, { lastLog: message }); },
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
      };
      if (isMountedRef.current) setRunningBots((prev) => [...prev, newBot]);

      engine.start({ symbol: rule.symbol || DEFAULT_SYMBOL, strategy: rule });
    } catch (error) {
      if (isMountedRef.current) alert(error instanceof Error ? error.message : "Failed to deploy bot");
    } finally {
      if (isMountedRef.current) setDeployingId(null);
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

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Automated Bots</h1>
          <p className="text-slate-500 text-sm font-medium">Manage and monitor your 24/7 trading instances.</p>
        </div>
        <Button onClick={() => navigate("/strategy-builder")} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create New Bot
        </Button>
      </div>

      {!derivTokenQuery.data?.token && (
        <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-400">
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
            <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between bg-black/20">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Running Instances</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-500">{runningBots.length} Active</span>
              </div>
            </div>

            <div className="p-0">
              {runningBots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-[rgba(255,255,255,0.08)]">
                    <Bot className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm mb-6">No bots are currently running.</p>
                  <Button variant="outline" className="btn-outline text-xs" onClick={() => navigate("/strategy-builder")}>
                    Deploy your first strategy
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[rgba(255,255,255,0.08)]">
                  {runningBots.map((bot) => (
                    <div key={bot.runId} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                          bot.status === "error"
                            ? "bg-red-600/10 border-red-600/20"
                            : "bg-orange-500/10 border-orange-500/20"
                        }`}>
                          <Activity className={`w-5 h-5 ${bot.status === "error" ? "text-red-500" : "text-orange-400 animate-pulse"}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            {bot.symbol} • {bot.trades} trades • {bot.status}
                          </p>
                          {bot.lastLog && <p className="text-[10px] text-slate-600 mt-1">{bot.lastLog}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Profit/Loss</p>
                          <p className={`text-sm font-bold ${bot.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toFixed(2)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white"
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
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">System Health</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Deriv Connection</span>
                <span className={`text-[10px] font-bold uppercase ${derivWS.isConnected() ? "text-emerald-500" : "text-red-500"}`}>
                  {derivWS.isConnected() ? "Connected" : "Offline"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">API Token</span>
                <span className={`text-[10px] font-bold uppercase ${derivTokenQuery.data?.token ? "text-emerald-500" : "text-red-500"}`}>
                  {derivTokenQuery.data?.token ? "Configured" : "Missing"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Active Bots</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase">{runningBots.length}</span>
              </div>
            </div>
          </div>

          <div className="bloomberg-panel p-6">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Ready to Deploy</h3>
            <div className="space-y-3">
              {strategiesQuery.data?.map((s: any) => (
                <div key={s.id} className="p-4 rounded-xl bg-[rgba(30,30,34,0.6)] border border-[rgba(255,255,255,0.08)] hover:border-orange-400/50 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-xs font-bold text-white">{s.name}</h4>
                    <Zap className="w-3 h-3 text-orange-400" />
                  </div>
                  <Button
                    className="w-full h-8 text-[10px] font-bold bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20"
                    disabled={deployingId === s.id || runningBots.some((b) => b.strategyId === s.id)}
                    onClick={() => handleDeploy(s)}
                  >
                    <Play className="w-3 h-3 mr-2 fill-current" />
                    {runningBots.some((b) => b.strategyId === s.id) ? "Running" : deployingId === s.id ? "Deploying..." : "Deploy Bot"}
                  </Button>
                </div>
              ))}
              {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                <p className="text-xs text-slate-600 italic text-center py-4">No strategies found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

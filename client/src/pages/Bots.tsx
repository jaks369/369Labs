import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Play,
  Square,
  Activity,
  AlertCircle,
  AlertTriangle,
  Zap,
  Plus,
  Wallet,
  FileText,
  X,
  Loader2,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { BotEngine, BotStatus, BotTrade } from "@/services/BotEngine";
import { runBacktest } from "@/services/BacktestEngine";
import { derivWS } from "@/services/derivWebSocket";
import { StrategyRule } from "@/components/RuleBuilder";
import { StrategyBuilderContent } from "@/pages/StrategyBuilder";
import { pushTimeline } from "@/components/AITimeline";
import { paperEngine } from "@/services/PaperEngine";

const PAPER_MODE_KEY = "369labs_paper_mode";

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
  const [paperMode, setPaperMode] = useState(() => localStorage.getItem(PAPER_MODE_KEY) === "true");
  const [paperBal, setPaperBal] = useState(() => paperEngine.getBalance());
  const [viewLogsFor, setViewLogsFor] = useState<number | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([]);

  const strategiesQuery = trpc.strategies.list.useQuery();
  const derivTokenQuery = trpc.deriv.getToken.useQuery();
  const startRunMutation = trpc.bot.startRun.useMutation();
  const stopRunMutation = trpc.bot.stopRun.useMutation();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const notifyTelegram = trpc.telegram.send.useMutation();
  const botLogsQuery = trpc.bot.getLogs.useQuery(
    { botRunId: viewLogsFor ?? 0, limit: 200 },
    { enabled: viewLogsFor !== null }
  );

  const alertTg = (msg: string) => { try { notifyTelegram.mutate({ message: msg }); } catch { /* ignore */ } };

  // Comprehensive error handling system for all user interactions
  const handleBotError = (error: any, context: string): string => {
    const message = error instanceof Error ? error.message : String(error);
    if (context === "deployment") {
      toast(message || "Failed to deploy bot", "error");
    } else if (context === "backtest") {
      toast(message || "Backtest failed", "error");
    } else {
      toast(message || "An error occurred", "error");
    }
    return message;
  };

  const errorBots = runningBots.filter(b => b.status === "error");
  const idleBots = runningBots.filter(b => b.status === "stopped");

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

  useEffect(() => {
    return paperEngine.onBalance(setPaperBal);
  }, []);

  const updateBot = (runId: number, patch: Partial<RunningBot>) => {
    setRunningBots((prev) => prev.map((b) => (b.runId === runId ? { ...b, ...patch } : b)));
  };

  const togglePaperMode = () => {
    const next = !paperMode;
    setPaperMode(next);
    localStorage.setItem(PAPER_MODE_KEY, String(next));
    toast(next ? "Paper trading enabled" : "Live trading mode", "success");
  };

  const handleDeploy = async (strategy: { id: number; name: string; config: any }) => {
    const rule = extractRule(strategy.config);
    if (!rule) {
      toast("This strategy was built in freeform notes mode and can't be deployed yet — rebuild it using the visual IF/THEN rule builder.", "error");
      return;
    }
    if (!paperMode && !derivTokenQuery.data?.token) {
      toast("Add your Deriv API token in Settings before deploying a bot, or enable Paper Trading.", "error");
      navigate("/settings");
      return;
    }

    setDeployingId(strategy.id);
    try {
      if (!paperMode) {
        derivWS.setApiToken(derivTokenQuery.data?.token ?? "");
        if (!derivWS.isAuthorized() || !derivWS.isConnected()) {
          toast("Authentication failed. Please check your API token and try again.", "error");
          return;
        }
      }

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
          }
          alertTg(`${strategy.name} [${trade.symbol}] trade ${trade.result.toUpperCase()} · stake $${trade.stake} · P&L ${parseFloat(trade.pnl) >= 0 ? "+" : ""}${trade.pnl}`);
        },
        onLog: (message) => {
          updateBot(botRun.id, { lastLog: message });
          try { fetch("/api/trpc/bot.saveLog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { botRunId: botRun.id, message, level: "info" } }) }).catch(() => {}); } catch {}
        },
      }, paperMode);

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
      alertTg(`ðŸš€ Bot deployed: ${strategy.name} on ${rule.symbol || DEFAULT_SYMBOL}`);

      // Capture the expected win rate via backtest so we can flag regime drift live.
      const stake = Number(rule.params?.stake ?? 1);
      derivWS
        .fetchTickHistory(rule.symbol || DEFAULT_SYMBOL, Math.floor(Date.now() / 1000) - 7 * 24 * 3600, Math.floor(Date.now() / 1000))
        .then(async (ticks) => {
          if (!ticks || ticks.length < 20) return;
          const res = await runBacktest(ticks, rule, stake);
          updateBot(botRun.id, { backtestWinRate: res.winRate });
        })
        .catch((error) => {
          // Backtest unavailable (e.g. invalid token) — badge stays hidden
        });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to deploy bot", "error");
    } finally {
      setDeployingId(null);
    }
  };

  const handleMultiDeploy = async () => {
    const toDeploy = (strategiesQuery.data || []).filter((s: any) => selectedMulti.includes(s.id));
    for (const s of toDeploy) {
      await handleDeploy(s);
    }
    setSelectedMulti([]);
    toast(`Deployed ${toDeploy.length} bots`, "success");
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
    pushTimeline({ icon: "bot", text: `Bot stopped: ${bot.name} Â· ${finalTrades} trades Â· P&L ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)}` });
    alertTg(`⏹️ Bot stopped: ${bot.name} Â· ${finalTrades} trades Â· P&L ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)}`);
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
    <div className="page-container">
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
            <p className="text-[var(--text-muted)] text-sm font-medium">Manage and monitor your 24/7 trading instances.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className={`w-4 h-4 ${paperMode ? "text-[var(--amber-hover)]" : "text-[var(--text-muted)]"}`} />
              <span className={`font-semibold ${paperMode ? "text-[var(--amber-hover)]" : "text-[var(--text-muted)]"}`}>
                Paper
              </span>
              <Switch checked={paperMode} onCheckedChange={togglePaperMode} className="data-[state=checked]:bg-[var(--amber-hover)]" />
            </div>
            <Button onClick={() => setCreating(true)} className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create New Bot
            </Button>
          </div>
        </div>

        {paperMode && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber-soft)] flex items-center gap-3">
            <Wallet className="w-4 h-4 text-[var(--amber-hover)] shrink-0" />
            <p className="text-xs text-[var(--amber-hover)]">
              Paper trading active — bots will use simulated trades. Paper balance: <strong>${paperBal.toFixed(2)}</strong>.{" "}
              <button className="underline font-bold" onClick={() => navigate("/settings")}>
                Manage in Settings
              </button>
            </p>
          </div>
        )}

        {!paperMode && !derivTokenQuery.data?.token && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--amber)] shrink-0" />
            <p className="text-xs text-[var(--amber)]">
              No Deriv API token on file — enable Paper Trading above or add a token in{" "}
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
          <div className="panel">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-black/20">
              <h2 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Running Instances</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[var(--green)]">{runningBots.length} Active</span>
              </div>
            </div>

            <div className="p-0">
              {runningBots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 bg-[var(--card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border)]">
                    <Bot className="w-6 h-6 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-[var(--text-muted)] text-sm mb-6">No bots are currently running.</p>
                  <Button variant="outline" className="btn btn-outline text-xs" onClick={() => navigate("/strategy-builder")}>
                    Deploy your first strategy
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {runningBots.map((bot) => (
                    <div key={bot.runId} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                          bot.status === "error"
                            ? "bg-[var(--red-soft)] border-[var(--red)]/20"
                            : "bg-[var(--amber-soft)] border-[var(--amber-border)]"
                        }`}>
                          <Activity className={`w-5 h-5 ${bot.status === "error" ? "text-[var(--red)]" : "text-[var(--amber)] animate-pulse"}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                          <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
                            {bot.symbol} • {bot.trades} trades • {bot.status}
                          </p>
                          {bot.lastLog && <p className="text-[10px] text-[var(--text-muted)] mt-1">{bot.lastLog}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Profit/Loss</p>
                          <p className={`text-sm font-bold ${bot.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
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
                            <div className="max-w-[180px] text-left bg-[var(--red-soft)] border border-[var(--red)]/30 rounded px-2 py-1">
                              <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--red)] uppercase">
                                <AlertTriangle className="w-3 h-3" /> Regime mismatch
                              </div>
                              <p className="text-[10px] text-[var(--red)]/80 leading-tight mt-0.5">
                                Live {liveWinRate.toFixed(0)}% vs backtest {bot.backtestWinRate.toFixed(0)}%
                              </p>
                            </div>
                          );
                        })()}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[var(--text-muted)] hover:text-[var(--cyan)] border border-[var(--border)] hover:border-[var(--cyan)]/30"
                          onClick={() => setViewLogsFor(bot.runId)}
                        >
                          <FileText className="w-3 h-3 mr-1" /> Logs
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="bg-[var(--red-soft)] text-[var(--red)] border-[var(--red)]/20 hover:bg-[var(--red)] hover:text-white"
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

        {/* Bot Logs Viewer */}
        {viewLogsFor !== null && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewLogsFor(null)}>
            <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4" /> Bot Execution Logs</h3>
                <button onClick={() => setViewLogsFor(null)} className="text-[var(--text-muted)] hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-1 max-h-[60vh] overflow-y-auto font-mono text-[11px]">
                {botLogsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /></div>
                ) : (botLogsQuery.data || []).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8">No logs for this bot run.</p>
                ) : (
                  (botLogsQuery.data || []).map((log: any) => (
                    <div key={log.id} className={`flex items-start gap-2 py-1 ${log.level === "error" ? "text-[var(--red)]" : log.level === "warn" ? "text-[var(--amber)]" : "text-[var(--text-secondary)]"}`}>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0 w-16">{log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}</span>
                      <span className="text-[10px] font-bold uppercase shrink-0 w-10">[{log.level}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sidebar - Quick Stats & Available Strategies */}
        <div className="space-y-8">
          <div className="panel p-6">
            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">System Health</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Active Bots</span>
                <span className={`text-[10px] font-bold ${runningBots.length > 0 ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}>{runningBots.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Idle Bots</span>
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">{idleBots.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Errors</span>
                <span className={`text-[10px] font-bold ${errorBots.length > 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>{errorBots.length > 0 ? `${errorBots.length} bot(s)` : "None"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Deriv WS</span>
                <span className={`text-[10px] font-bold ${derivWS.isAuthorized() ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{derivWS.isAuthorized() ? "Connected" : "Disconnected"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Total Trades</span>
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">{runningBots.reduce((s, b) => s + (b.trades || 0), 0)}</span>
              </div>
              {runningBots.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)]">Avg. Win Rate</span>
                  <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                    {(() => {
                      const withWR = runningBots.filter(b => b.backtestWinRate != null);
                      return withWR.length > 0 ? (withWR.reduce((s, b) => s + (b.backtestWinRate || 0), 0) / withWR.length).toFixed(0) + "%" : "—";
                    })()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Ready to Deploy</h3>
              {selectedMulti.length > 1 && (
                <Button onClick={handleMultiDeploy} className="text-[10px] font-bold bg-[var(--cyan)] text-black px-3 py-1 rounded-lg flex items-center gap-1">
                  <Play className="w-3 h-3" /> Deploy {selectedMulti.length} Strategies
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {strategiesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Activity className="w-5 h-5 animate-spin text-[var(--amber)]" />
                </div>
              ) : strategiesQuery.isError ? (
                <p className="text-xs text-[var(--red)] italic text-center py-4">Failed to load strategies. Please try again.</p>
              ) : strategiesQuery.data?.map((s: any) => {
                const isSelected = selectedMulti.includes(s.id);
                const isRunning = runningBots.some((b) => b.strategyId === s.id);
                return (
                <div key={s.id} className={`p-4 rounded-xl bg-[var(--card)] border transition-all group ${isSelected ? "border-[var(--cyan)]" : "border-[var(--border)] hover:border-[var(--amber)]/50"}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={isSelected} onChange={() => setSelectedMulti((p) => p.includes(s.id) ? p.filter((id) => id !== s.id) : [...p, s.id])} className="accent-[var(--cyan)] w-3.5 h-3.5" />
                      <h4 className="text-xs font-bold text-white">{s.name}</h4>
                    </div>
                    <Zap className="w-3 h-3 text-[var(--amber)]" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-8 text-[10px] font-bold bg-[var(--amber-soft)] text-[var(--amber)] hover:bg-[var(--amber)] hover:text-white border border-[var(--amber-border)]"
                      disabled={deployingId === s.id || isRunning}
                      onClick={() => handleDeploy(s)}
                    >
                      <Play className="w-3 h-3 mr-2 fill-current" />
                      {isRunning ? "Running" : deployingId === s.id ? "Deploying..." : "Deploy"}
                    </Button>
                  </div>
                </div>
              );})}
              {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] italic text-center py-4">No strategies found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




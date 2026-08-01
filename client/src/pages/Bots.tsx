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
  FileText,
  X,
  Loader2,
  RotateCcw,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { derivWS } from "@/services/derivWebSocket";
import { StrategyRule } from "@/components/RuleBuilder";
import { StrategyBuilderContent } from "@/pages/StrategyBuilder";
import { pushTimeline } from "@/components/AITimeline";

interface ServerBot {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  totalTrades: number;
  totalProfitLoss: string;
  lossStreak: number;
  hasOpenTrade: boolean;
  symbol: string;
  backtestWinRate: number | null;
  lastLog?: string;
}

interface RunningBot {
  runId: number;
  strategyId: number;
  name: string;
  symbol: string;
  status: "running" | "stopped" | "error";
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  backtestWinRate: number | null;
  lastLog?: string;
}

const DEFAULT_SYMBOL = "R_100";

function extractRule(config: any): StrategyRule | null {
  return config && typeof config === "object" && config.rule ? (config.rule as StrategyRule) : null;
}

export default function Bots() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [runningBots, setRunningBots] = useState<RunningBot[]>([]);
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewLogsFor, setViewLogsFor] = useState<number | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const strategiesQuery = trpc.strategies.list.useQuery();
  const derivTokenQuery = trpc.deriv.getToken.useQuery();
  const startRunMutation = trpc.bot.startRun.useMutation();
  const stopRunMutation = trpc.bot.stopRun.useMutation();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const saveLogMutation = trpc.bot.saveLog.useMutation();
  const notifyTelegram = trpc.telegram.send.useMutation();
  const botLogsQuery = trpc.bot.getLogs.useQuery(
    { botRunId: viewLogsFor ?? 0, limit: 200 },
    { enabled: viewLogsFor !== null }
  );
  const listActiveQuery = trpc.bot.listActive.useQuery(undefined, { refetchInterval: 5000, enabled: isAuthenticated });

  const alertTg = (msg: string) => { try { notifyTelegram.mutate({ message: msg }); } catch { /* ignore */ } };

  // Sync runningBots with server state on mount and when listActive updates
  useEffect(() => {
    if (!isAuthenticated) {
      setRunningBots([]);
      return;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!listActiveQuery.data) return;

    const serverBots = listActiveQuery.data;
    setRunningBots((prev) => {
      const merged = [...prev];
      for (const sb of serverBots) {
        const existingIndex = merged.findIndex((b) => b.runId === Number(sb.def.id));
        const botData: RunningBot = {
          runId: Number(sb.def.id),
          strategyId: 0, // strategyId not directly available from listActive; using runId as fallback
          name: sb.def.name,
          symbol: sb.def.strategy?.symbol || DEFAULT_SYMBOL,
          status: sb.status === "paused" || sb.status === "restarting" ? "running" : sb.status,
          pnl: sb.totalProfitLoss,
          trades: sb.totalTrades,
          wins: 0, // not in listActive response
          losses: 0,
          backtestWinRate: null,
          lastLog: sb.lastError,
        };
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], ...botData };
        } else {
          merged.push(botData);
        }
      }
      // Remove bots that are no longer active on server
      const serverIds = new Set(serverBots.map((b) => Number(b.def.id)));
      return merged.filter((b) => serverIds.has(b.runId));
    });
  }, [listActiveQuery.data]);

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

  const handleDeploy = async (strategy: { id: number; name: string; config: any }) => {
    const rule = extractRule(strategy.config);
    if (!rule) {
      toast("This strategy was built in freeform notes mode and can't be deployed yet — rebuild it using the visual IF/THEN rule builder.", "error");
      return;
    }
    // Prevent double-deploy: check if this strategy is already running
    if (runningBots.some((b) => b.strategyId === strategy.id)) {
      toast(`${strategy.name} is already running`, "error");
      return;
    }
    if (!derivTokenQuery.data?.token) {
      toast("Add your Deriv API token in Settings before deploying a bot.", "error");
      navigate("/settings");
      return;
    }

    setDeployingId(strategy.id);
    try {
      await derivWS.setApiToken(derivTokenQuery.data?.token ?? "");
      if (!derivWS.isAuthorized() || !derivWS.isConnected()) {
        toast("Authentication failed. Your token may be invalid or expired. Update it in Settings.", "error");
        return;
      }

      const botRun = await startRunMutation.mutateAsync({ strategyId: strategy.id });

      // Trigger immediate refetch to pick up the new bot from server
      setRefreshKey((k) => k + 1);
      listActiveQuery.refetch();

      pushTimeline({ icon: "bot", text: `Bot started: ${strategy.name} on ${rule.symbol || DEFAULT_SYMBOL}` });
      alertTg(`🚀 Bot deployed: ${strategy.name} on ${rule.symbol || DEFAULT_SYMBOL}`);

      // Capture the expected win rate via backtest so we can flag regime drift live.
      const stake = Number(rule.params?.stake ?? 1);
      derivWS
        .fetchTickHistory(rule.symbol || DEFAULT_SYMBOL, Math.floor(Date.now() / 1000) - 7 * 24 * 3600, Math.floor(Date.now() / 1000))
        .then(async (ticks) => {
          if (!ticks || ticks.length < 20) return;
          const { runBacktest } = await import("@/services/BacktestEngine");
          const res = await runBacktest(ticks, rule, stake, rule.symbol);
          // Update local state with backtest win rate
          setRunningBots((prev) => prev.map((b) => (b.runId === botRun.id ? { ...b, backtestWinRate: res.winRate } : b)));
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
    try {
      await stopRunMutation.mutateAsync({
        id: bot.runId,
        status: bot.status === "error" ? "error" : "stopped",
        totalTrades: bot.trades,
        totalProfitLoss: bot.pnl.toFixed(2),
      });
      // Remove from local state immediately for responsive UI
      setRunningBots((prev) => prev.filter((b) => b.runId !== bot.runId));
      pushTimeline({ icon: "bot", text: `Bot stopped: ${bot.name} · ${bot.trades} trades · P&L ${bot.pnl >= 0 ? "+" : ""}$${bot.pnl.toFixed(2)}` });
      alertTg(`⏹️ Bot stopped: ${bot.name} · ${bot.trades} trades · P&L ${bot.pnl >= 0 ? "+" : ""}$${bot.pnl.toFixed(2)}`);
      // Trigger refetch to sync with server
      listActiveQuery.refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to stop bot", "error");
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
          <Button onClick={() => setCreating(true)} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create New Bot
          </Button>
        </div>
      </div>

      {!derivTokenQuery.data?.token && (
        <div className="mb-6 p-4 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <p className="text-xs text-[var(--accent)]">
            No Deriv API token on file — add a token in{" "}
            <button className="underline font-bold" onClick={() => navigate("/settings")}>
              Settings
            </button>{" "}
            to deploy bots.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Bots List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="panel">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-black/20">
              <h2 className="text-micro">Running Instances</h2>
              <div className="flex items-center gap-2">
                <span className="text-caption text-price-up font-bold">{runningBots.length} Active</span>
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
                            : "bg-[var(--accent-soft)] border-[var(--accent-border)]"
                        }`}>
                          <Activity className={`w-5 h-5 ${bot.status === "error" ? "text-[var(--red)]" : "text-[var(--accent)] animate-pulse"}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                          <p className="text-micro">
                            {bot.symbol} • {bot.trades} trades • {bot.status}
                          </p>
                          {bot.lastLog && <p className="text-caption mt-1">{bot.lastLog}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-micro mb-1">Profit/Loss</p>
                          <p className={`text-sm font-bold ${bot.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {bot.pnl >= 0 ? "+" : ""}${Number(bot.pnl).toFixed(2)}
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
                            <div className="text-right">
                              <p className="text-micro mb-1">Regime Drift</p>
                              <p className={`text-sm font-bold ${mismatch ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                                {drift.toFixed(1)}%
                              </p>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setViewLogsFor(bot.runId)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)] transition-colors cursor-pointer"
                          >
                            Logs
                          </button>
                          <button
                            onClick={() => handleStop(bot)}
                            disabled={bot.status !== "running"}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30 hover:bg-[var(--red)]/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Errored/Idle Bots */}
          {(runningBots.filter((b) => b.status === "error" || b.status === "stopped").length > 0) && (
            <div className="panel mt-6">
              <div className="p-4 border-b border-[var(--border)] bg-black/20">
                <h2 className="text-micro">Stopped & Errored</h2>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {runningBots.filter((b) => b.status === "error" || b.status === "stopped").map((bot) => (
                  <div key={bot.runId} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                        bot.status === "error"
                          ? "bg-[var(--red-soft)] border-[var(--red)]/20"
                          : "bg-white/5 border-white/10"
                      }`}>
                        <Activity className={`w-5 h-5 ${bot.status === "error" ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                        <p className="text-micro">{bot.symbol} • {bot.trades} trades • {bot.status}</p>
                        {bot.lastLog && <p className="text-caption mt-1">{bot.lastLog}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-micro mb-1">Final P&L</p>
                        <p className={`text-sm font-bold ${bot.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {bot.pnl >= 0 ? "+" : ""}${Number(bot.pnl).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => setViewLogsFor(bot.runId)}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)] transition-colors cursor-pointer"
                      >
                        Logs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Strategy List & Deployment */}
        <div className="space-y-6">
          <div className="panel">
            <div className="p-4 border-b border-[var(--border)] bg-black/20 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Deployable Strategies</h2>
              <button onClick={() => setSelectedMulti([])} className="text-xs text-[var(--accent)] hover:underline">Clear selection</button>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {(strategiesQuery.data || []).filter((s: any) => s.config?.rule).map((strategy: any) => {
                const rule = extractRule(strategy.config);
                const isDeploying = deployingId === strategy.id;
                const isRunning = runningBots.some((b) => b.strategyId === strategy.id);
                const isSelected = selectedMulti.includes(strategy.id);
                return (
                  <div key={strategy.id} className={`p-4 flex items-center justify-between hover:bg-white/5 transition-colors ${isSelected ? "bg-[var(--accent-soft)] border-l-2 border-[var(--accent)]" : ""}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setSelectedMulti((prev) => isSelected ? prev.filter((id) => id !== strategy.id) : [...prev, strategy.id])}
                        className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{strategy.name}</h3>
                        <p className="text-caption text-[var(--text-muted)] truncate">
                          {rule?.symbol || DEFAULT_SYMBOL} • {rule?.action?.tradeType || "—"} • ${rule?.params?.stake || 1}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunning ? (
                        <span className="px-2 py-1 text-[10px] font-bold bg-[var(--green-soft)] text-[var(--green)] rounded">Running</span>
                      ) : (
                        <button
                          onClick={() => handleDeploy(strategy)}
                          disabled={isDeploying || !derivTokenQuery.data?.token}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
                        >
                          {isDeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Deploy"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {(strategiesQuery.data || []).filter((s: any) => s.config?.rule).length === 0 && (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  <Bot className="w-8 h-8 mx-auto mb-2 text-[var(--text-disabled)]" />
                  <p className="text-sm">No deployable strategies yet.</p>
                  <p className="text-xs mt-1">Create one in the <button className="underline font-bold hover:text-white" onClick={() => navigate("/strategy-builder")}>Strategy Builder</button> using the visual IF/THEN rule builder.</p>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Deploy */}
          {selectedMulti.length > 0 && (
            <div className="panel p-4 bg-[var(--accent-soft)]/20 border-[var(--accent-border)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--accent)]">{selectedMulti.length} strategies selected</span>
                <Button onClick={handleMultiDeploy} disabled={deployingId !== null} className="btn btn-primary btn-sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Deploy All
                </Button>
              </div>
            </div>
          )}

          {/* Logs Modal */}
          {viewLogsFor !== null && (
            <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewLogsFor(null)}>
              <div className="w-full max-w-2xl max-h-[80vh] bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4" /> Bot Logs</h3>
                  <button onClick={() => setViewLogsFor(null)} className="text-[var(--text-muted)] hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                  {botLogsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
                  ) : botLogsQuery.isError ? (
                    <p className="text-xs text-[var(--red)] italic text-center py-4">Failed to load logs.</p>
                  ) : (botLogsQuery.data || []).length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic text-center py-4">No logs for this bot run.</p>
                  ) : (
                    <div className="space-y-1">
                      {(botLogsQuery.data || []).map((log: any) => (
                        <div key={log.id} className={`text-xs p-2 rounded-lg bg-black/20 ${log.level === "error" ? "text-[var(--red)]" : log.level === "warn" ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                          <span className="text-[var(--text-muted)] mr-2">{new Date(log.createdAt).toLocaleTimeString()}</span>
                          <span className="font-bold text-[var(--accent)]">{log.level.toUpperCase()}</span>
                          <span className="ml-1">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
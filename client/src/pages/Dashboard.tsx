import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  Zap,
  ChevronDown,
  Wallet,
  Sparkles,
  RotateCcw,
  AlertCircle,
  Bell,
  BellOff,
  Plus,
  X,
  Gauge,
  BookOpen,
  BarChart3,
  Bot,
  MessageSquare,
  Brain,
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";
import DigitStats from "@/components/DigitStats";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import { VOLATILITY_SYMBOLS } from "@/lib/symbols";

const ALL_FALLBACK: DerivSymbol[] = VOLATILITY_SYMBOLS.map(s => ({ ...s, decimalPlaces: 2 }));

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<{ currency: string; accountType: string } | null>(null);
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(ALL_FALLBACK[0]?.symbol || "");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });
  const [stake, setStake] = useState<number>(1);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [newAlertSym, setNewAlertSym] = useState("");
  const [newAlertDir, setNewAlertDir] = useState<"above" | "below">("above");
  const [newAlertPrice, setNewAlertPrice] = useState("");

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 });
  const signalsQuery = trpc.signals.list.useQuery({}, { refetchInterval: 30000 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const memoryQuery = trpc.memory.get.useQuery();
  const alertsQuery = trpc.alerts.list.useQuery();
  const createAlertMutation = trpc.alerts.create.useMutation({
    onSuccess: () => { alertsQuery.refetch(); setNewAlertSym(""); setNewAlertPrice(""); },
  });
  const disableAlertMutation = trpc.alerts.disable.useMutation({
    onSuccess: () => alertsQuery.refetch(),
  });
  const [historyTab, setHistoryTab] = useState<"trades" | "prices">("trades");
  const priceQuery = trpc.market.getHistory.useQuery({ symbol: selectedSymbol, limit: 200 }, { enabled: historyTab === "prices", refetchInterval: historyTab === "prices" ? 3000 : false });

  // Live tick buffer: stream ticks from the Deriv WS so the Price History table
  // updates in real time (newest on top, pushing older rows down).
  const [liveTicks, setLiveTicks] = useState<any[]>([]);
  useEffect(() => {
    if (historyTab !== "prices") return;
    setLiveTicks([]);
    const subId = derivWS.subscribe(selectedSymbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== selectedSymbol) return;
        const price = Number(tick.price);
        const lastDigit = parseInt(String(tick.price).replace(".", "").slice(-1), 10) || 0;
        setLiveTicks((prev) => [{ symbol: tick.symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 50));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); derivWS.unsubscribe(subId); };
  }, [selectedSymbol, historyTab]);

  // Use live ticks if streaming, else fall back to the DB snapshot.
  const displayTicks = liveTicks.length ? liveTicks : (priceQuery.data?.ticks || []).slice(0, 50);

  const handleQuickTrade = async () => {
    if (!derivWS.isAuthorized()) { setTradeMsg({ kind: "err", text: "Connect a Deriv token first (Settings)." }); return; }
    const dailyLossLimit = (memoryQuery.data?.memory as any)?.dailyLossLimit;
    if (dailyLossLimit > 0) {
      const today = new Date().toDateString();
      const todayTrades = (tradesQuery.data || []).filter((t: any) => new Date(t.entryTime).toDateString() === today);
      const todayPnl = todayTrades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
      if (todayPnl <= -dailyLossLimit) {
        setTradeMsg({ kind: "err", text: `Daily loss limit of $${dailyLossLimit} reached. Trading blocked until tomorrow.` });
        return;
      }
    }
    if (accountType === "real") {
      const ok = window.confirm("You are connected to a REAL account. This trade uses real funds. Continue?");
      if (!ok) return;
    }
    const map: Record<string, string> = {
      "rise_fall": contract.direction === "fall" ? "PUT" : "CALL",
      "over_under": contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
      "even_odd": contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
      "digits": "DIGITMATCH",
      "accumulator": "ACCU",
    };
    const contractType = map[contract.category];
    if (!contractType) { setTradeMsg({ kind: "err", text: "Unsupported contract type." }); return; }
    setTradeBusy(true); setTradeMsg(null);
    try {
      const purchase = await derivWS.purchaseContract({
        symbol: selectedSymbol,
        contractType: contractType as any,
        amount: stake,
        duration: 5,
        durationUnit: "t",
        ...(contract.category === "over_under" && contract.barrier !== undefined ? { barrier: contract.barrier } : {}),
        ...(contract.category === "digits" && contract.digit !== undefined ? { barrier: contract.digit } : {}),
        ...(stopLoss > 0 ? { stopLoss } : {}),
        ...(takeProfit > 0 ? { takeProfit } : {}),
      });
      setTradeMsg({ kind: "ok", text: "Trade placed (contract #" + purchase.contractId + "). Tracking settlement…" });

      // Persist the open trade and subscribe to its settlement so the
      // user's trade history stays accurate even after navigating away.
      derivWS.subscribeToContract(purchase.contractId, (c: any) => {
        if (c.status !== "open") {
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          saveTradeMutation.mutate({
            result: (profit >= 0 ? "win" : "loss") as any,
            stake: String(stake),
            entryPrice: String(purchase.buyPrice ?? ""),
            profitLoss: profit.toFixed(2),
            entryTime: new Date(),
            exitTime: new Date(),
            contractId: String(purchase.contractId),
          } as any, { onSuccess: () => tradesQuery.refetch() });
        }
      });
    } catch (e: any) {
      setTradeMsg({ kind: "err", text: "Trade failed: " + (e?.message || e) });
    } finally { setTradeBusy(false); }
  };

  useEffect(() => {
    if (!isAuthenticated) { navigate("/"); }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (tradesQuery.data) {
      const totalPnl = tradesQuery.data.reduce((sum, trade) => {
        const pnlValue = parseFloat(trade.profitLoss?.toString() || "0");
        return sum + pnlValue;
      }, 0);
      setPnl(totalPnl);
    }
  }, [tradesQuery.data]);

  useEffect(() => {
    if (botRunsQuery.data) {
      const running = botRunsQuery.data.some(run => run.status === "running");
      setBotRunning(running);
    }
  }, [botRunsQuery.data]);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : (b.accounts || [b]);
      const acct = list[0] || b;
      setBalance(parseFloat(acct?.balance != null ? acct.balance : (acct?.display_balance || "0")) || 0);
      setBalanceInfo({
        currency: acct?.currency || "USD",
        accountType: (acct?.account_type || b.account_type || "").toString().toLowerCase(),
      });
    });
    return () => {};
  }, []);

  useEffect(() => {
    setTokenSaved(Boolean(tokenQuery.data?.token));
    if (tokenQuery.data?.token) {
      derivWS.setApiToken(tokenQuery.data.token).catch(console.error);
    }
  }, [tokenQuery.data]);

  // Three distinct token states: none saved | saved but invalid/unauthorized | connected.
  const tokenStatus: "none" | "invalid" | "connected" =
    !tokenSaved ? "none" : tokenError || !derivWS.isAuthorized() ? "invalid" : "connected";

  useEffect(() => {
    const unsub = derivWS.onTokenError((msg) => setTokenError(msg));
    const interval = setInterval(() => {
      if (derivWS.isAuthorized() && tokenError) setTokenError(null);
    }, 1000);
    return () => { clearInterval(interval); };
  }, [tokenError]);

  const [symbols, setSymbols] = useState<DerivSymbol[]>([]);
  const [widgets, setWidgets] = useState<string[]>(["trades", "signals", "chart", "history", "alerts"]);
  const [showWidgetConfig, setShowWidgetConfig] = useState(false);
  const [symInitDone, setSymInitDone] = useState(false);
  useEffect(() => {
    const unsub = derivWS.onSymbols((syms) => {
      setSymbols(syms);
      if (syms.length > 0) setSymInitDone(true);
    });
    return () => {};
  }, []);

  const symbolList = symbols.length > 0 ? symbols : ALL_FALLBACK;
  const pickerSymbols = symbols.length > 0 ? symbols : ALL_FALLBACK;
  const vol1sSymbols = pickerSymbols.filter(s => /^1HZ/i.test(s.symbol) || /\(1s\)/i.test(s.displayName));
  const volRegularSymbols = pickerSymbols.filter(s => /volatility/i.test(s.displayName) && !/\(1s\)/i.test(s.displayName) && !/^1HZ/i.test(s.symbol));
  const boomCrashSymbols = pickerSymbols.filter(s => /boom|crash/i.test(s.market) || /boom|crash/i.test(s.displayName));

  const selectedDisplay = symbolList.find(s => s.symbol === selectedSymbol)?.displayName || selectedSymbol;
  const decimalPlaces = derivWS.decimalPlacesFor(selectedSymbol);
  const { status: derivStatus, accountType } = useDerivStatus();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Market Overview</h1>
          <p className="text-[var(--text-muted)] text-sm font-medium">Volatility Indices &middot; Live Trading</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg panel-secondary">
            <Wallet className="w-4 h-4 text-[var(--green)]" />
            <span className="text-sm font-bold text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {balanceInfo?.currency || "USD"}
            </span>
            {balanceInfo?.accountType ? (
              <span className={`badge ${balanceInfo.accountType === "demo" ? "badge-amber" : "badge-red"}`}>
                {balanceInfo.accountType}
              </span>
            ) : tokenStatus === "invalid" ? (
              <span className="badge badge-red" title={"Click 'Connect Deriv' to fix the token issue"}>{tokenError?.includes("invalid") || tokenError?.includes("expired") ? "BAD TOKEN" : "NOT CONNECTED"}</span>
            ) : tokenStatus === "none" ? (
              <span className="badge badge-gray">no token</span>
            ) : (
              <span className="badge badge-green">connected</span>
            )}
          </div>

          <Button onClick={() => setShowTokenModal(true)} className="btn btn-primary gap-2 w-full sm:w-auto">
            <Zap className="w-4 h-4 shrink-0" /> <span className="sm:inline">Connect Deriv</span>
          </Button>
          <Button onClick={() => setShowSymbolPicker(s => !s)} className="btn btn-outline gap-2 w-full sm:w-auto">
            <Activity className="w-4 h-4 shrink-0" /> <span className="truncate max-w-[120px] sm:max-w-none">{selectedDisplay}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <button onClick={() => navigate("/bots")} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--cyan)]/40 transition-all">
          <Bot className="w-5 h-5 text-[var(--cyan)]" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">Bots</p>
            <p className="text-[10px] text-[var(--text-muted)]">Manage automations</p>
          </div>
        </button>
        <button onClick={() => navigate("/backtesting")} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--amber)]/40 transition-all">
          <BarChart3 className="w-5 h-5 text-[var(--amber)]" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">Backtest</p>
            <p className="text-[10px] text-[var(--text-muted)]">Test a strategy</p>
          </div>
        </button>
        <button onClick={() => navigate("/journal")} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--green)]/40 transition-all">
          <BookOpen className="w-5 h-5 text-[var(--green)]" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">Journal</p>
            <p className="text-[10px] text-[var(--text-muted)]">AI trade analysis</p>
          </div>
        </button>
        <button onClick={() => navigate("/ai-assistant")} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--cyan)]/40 transition-all">
          <Brain className="w-5 h-5 text-[var(--cyan)]" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">AI Assistant</p>
            <p className="text-[10px] text-[var(--text-muted)]">AI-powered trading help</p>
          </div>
        </button>
      </div>

      {/* Token error banner */}
      {tokenError && (
        <div className="flex items-start justify-between gap-3 bg-[var(--red-soft)] border border-[var(--red)]/30 text-[var(--red)] text-sm rounded-[var(--radius)] px-4 py-3 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm mb-1">Deriv Authentication Failed</p>
              <p className="text-xs leading-relaxed">{tokenError}</p>
            </div>
          </div>
          <Button onClick={() => setShowTokenModal(true)} className="shrink-0 bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 text-xs px-3 py-1 rounded-lg hover:bg-[var(--red)] hover:text-white transition-colors">UPDATE TOKEN</Button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left column - Chart & History */}
        <div className="xl:col-span-2 space-y-8">

          {/* Chart container */}
          <div className="chart-container">
            <div className="chart-header">
              <h2 className="card-title text-sm">Live Chart &mdash; {selectedDisplay}</h2>
              <div className="chart-toolbar">
                <button className="chart-toolbar-btn active">1m</button>
                <button className="chart-toolbar-btn">5m</button>
                <button className="chart-toolbar-btn">15m</button>
                <button className="chart-toolbar-btn">1h</button>
              </div>
            </div>
            {showSymbolPicker ? (
              <div className="max-h-[300px] md:max-h-[420px] overflow-y-auto space-y-5 p-4">
                <div className="sticky top-0 z-10 bg-[var(--card)] pb-2 -mt-2 pt-2">
                  <input
                    type="text"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search symbols..."
                    className="input w-full text-sm"
                  />
                </div>
                  {(() => {
                    const q = symbolSearch.toLowerCase().trim();
                    const filter = (s: DerivSymbol) => !q || s.symbol.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q);
                    const vol1sFiltered = vol1sSymbols.filter(filter);
                    const volRegFiltered = volRegularSymbols.filter(filter);
                    const boomCrashFiltered = boomCrashSymbols.filter(filter);
                  return (
                    <>
                      {vol1sFiltered.length > 0 && (
                        <div>
                          <h3 className="section-title mb-2">Volatility 1s Indices</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {vol1sFiltered.map(s => (
                              <button
                                key={s.symbol}
                                onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); setSymbolSearch(""); }}
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--amber-soft)] text-[var(--amber-hover)] border border-[var(--amber-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
                              >
                                {s.displayName || s.symbol}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {volRegFiltered.length > 0 && (
                        <div>
                          <h3 className="section-title mb-2">Volatility Indices</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {volRegFiltered.map(s => (
                              <button
                                key={s.symbol}
                                onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); setSymbolSearch(""); }}
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--amber-soft)] text-[var(--amber-hover)] border border-[var(--amber-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
                              >
                                {s.displayName || s.symbol}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {boomCrashFiltered.length > 0 && (
                        <div>
                          <h3 className="section-title mb-2">Boom & Crash Indices</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {boomCrashFiltered.map(s => (
                              <button
                                key={s.symbol}
                                onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); setSymbolSearch(""); }}
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--amber-soft)] text-[var(--amber-hover)] border border-[var(--amber-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
                              >
                                {s.displayName || s.symbol}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {vol1sFiltered.length === 0 && volRegFiltered.length === 0 && boomCrashFiltered.length === 0 && (
                        <p className="text-sm text-[var(--text-muted)] text-center py-8">No symbols match "{symbolSearch}"</p>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="chart-plot min-h-[400px]">
                {symInitDone || symbols.length > 0 ? (
                  <TickChart symbol={selectedSymbol} maxDataPoints={50} decimalPlaces={decimalPlaces} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-[var(--text-muted)] text-sm">Loading market data...</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* History panel */}
          <div className="panel">
            <div className="panel-header">
              <h2 className="card-title text-sm">History</h2>
              <div className="tabs">
                <button onClick={() => setHistoryTab("trades")} className={`tab ${historyTab === "trades" ? "active" : ""}`}>Trades</button>
                <button onClick={() => setHistoryTab("prices")} className={`tab ${historyTab === "prices" ? "active" : ""}`}>Price History</button>
              </div>
            </div>
            {historyTab === "trades" ? (
              <div>
                {(() => {
                  const symTrades = (tradesQuery.data || []).filter((t: any) => (t.symbol || "") === selectedSymbol);
                  const wins = symTrades.filter((t: any) => t.result === "win").length;
                  const grossProfit = symTrades.filter((t: any) => parseFloat(t.profitLoss?.toString() || "0") >= 0).reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
                  const grossLoss = symTrades.filter((t: any) => parseFloat(t.profitLoss?.toString() || "0") < 0).reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
                  const net = grossProfit + grossLoss;
                  const winRate = symTrades.length ? Math.round((wins / symTrades.length) * 100) : 0;
                  return (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-[var(--border)]">
                      <div className="kpi-card">
                        <div className="kpi-label">Trades</div>
                        <div className="kpi-value text-lg">{symTrades.length}</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">Win Rate</div>
                        <div className="kpi-value text-lg">{winRate}%</div>
                      </div>
                      <div className="kpi-card kpi-card-green">
                        <div className="kpi-label">Gross Profit</div>
                        <div className="kpi-value text-lg text-[var(--green)]">+{grossProfit.toFixed(2)}</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">Net P&L</div>
                        <div className={`kpi-value text-lg ${net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{net >= 0 ? "+" : ""}{net.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="table-container border-0 rounded-none">
                  {(() => {
                    const symTrades = (tradesQuery.data || []).filter((t: any) => (t.symbol || "") === selectedSymbol);
                    if (symTrades.length === 0) {
                      return <div className="empty-state"><p className="empty-state-desc">No trades for {selectedSymbol} yet.</p></div>;
                    }
                    return (
                      <table className="table">
                        <thead>
                          <tr><th>#</th><th>TYPE</th><th>STAKE</th><th>ENTRY</th><th>RESULT</th><th className="text-right">P&L</th></tr>
                        </thead>
                        <tbody>
                          {symTrades.slice(0, 10).map((trade: any, i: number) => (
                            <tr key={trade.id}>
                              <td className="text-[var(--text-muted)] font-mono">{i + 1}</td>
                              <td><span className="tag">{trade.contractType || "-"}</span></td>
                              <td>${trade.stake}</td>
                              <td className="font-mono">{trade.entryPrice}</td>
                              <td>
                                <span className={`badge ${trade.result === "win" ? "badge-green" : "badge-red"}`}>
                                  {trade.result.toUpperCase()}
                                </span>
                              </td>
                              <td className={`text-right font-bold font-mono ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                {parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "+" : ""}{trade.profitLoss}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-4">
                {priceQuery.isLoading ? (
                  <div className="flex items-center justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--amber)]" /></div>
                ) : priceQuery.data?.ticks?.length ? (
                  <div className="table-container border-0 rounded-none">
                    <table className="table">
                      <thead>
                        <tr><th>#</th><th>TIME</th><th className="text-right">PRICE</th><th className="text-right">LAST DIGIT</th></tr>
                      </thead>
                      <tbody>
                        {displayTicks.map((t: any, i: number) => (
                          <tr key={i}>
                            <td className="text-[var(--text-muted)] font-mono">{i + 1}</td>
                            <td>{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                            <td className="text-right text-white font-mono">{Number(t.price).toFixed(decimalPlaces)}</td>
                            <td className="text-right font-mono">{t.lastDigit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state"><p className="empty-state-desc">No price history for {selectedSymbol} yet.</p></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column - Trade Studio & AI Insight */}
        <div className="space-y-8">

          {/* Widget Customization */}
          {(widgets.length > 0 || true) && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title text-[10px]">Dashboard Widgets</h3>
                <button onClick={() => setShowWidgetConfig(!showWidgetConfig)} className="text-[10px] text-[var(--cyan)] hover:text-[var(--cyan)]/80 transition-colors">
                  {showWidgetConfig ? "Done" : "Customize"}
                </button>
              </div>
              {showWidgetConfig && (
                <div className="space-y-2">
                  {[
                    { key: "trades", label: "Recent Trades" },
                    { key: "signals", label: "AI Signals" },
                    { key: "chart", label: "Live Chart" },
                    { key: "history", label: "Trade History" },
                    { key: "alerts", label: "Price Alerts" },
                  ].map((w) => (
                    <label key={w.key} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={widgets.includes(w.key)}
                        onChange={() => {
                          setWidgets((prev) => prev.includes(w.key) ? prev.filter((k) => k !== w.key) : [...prev, w.key]);
                        }}
                        className="accent-[var(--cyan)]"
                      />
                      {w.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trade Studio */}
          <div className="trade-studio p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="section-title text-[11px]">Trade Studio</h3>
              <span className={`badge ${accountType === "real" ? "badge-red" : accountType === "demo" ? "badge-amber" : tokenStatus === "invalid" ? "badge-red" : "badge-gray"}`}>
                {accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : tokenStatus === "invalid" ? "UNAUTHORIZED" : "NO TOKEN"}
              </span>
            </div>
            <div className="space-y-4">
              <div className="input-group">
                <label className="input-label">Symbol</label>
                <div className="input bg-[var(--surface-secondary)] cursor-default">{selectedSymbol}</div>
              </div>
              <ContractTypeSelector selection={contract} onChange={setContract} />
              <div className="input-group">
                <label className="input-label">Stake ($)</label>
                <input
                  type="number"
                  min={0.35}
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="input-group">
                  <label className="input-label text-[var(--red)]">Stop Loss ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={stopLoss || ""}
                    onChange={(e) => setStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="input border-[var(--red)]/40"
                    placeholder="Optional"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label text-[var(--green)]">Take Profit ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={takeProfit || ""}
                    onChange={(e) => setTakeProfit(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="input border-[var(--green)]/40"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <Button onClick={handleQuickTrade} disabled={tradeBusy} className="btn btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (contract.direction === "fall" ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />)}
                {tradeBusy ? "Placing..." : "Buy"}
              </Button>
              {tradeMsg && (
                <p className={`text-xs ${tradeMsg.kind === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{tradeMsg.text}</p>
              )}
              {!derivWS.isAuthorized() && (
                <p className="text-xs text-[var(--text-muted)]">Connect a Deriv token in Settings to enable trading.</p>
              )}
            </div>
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <DigitStats symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
            </div>
          </div>

          {/* Price Alerts */}
          <div className="panel">
            <div className="panel-header flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-[var(--amber)]" />
                <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Price Alerts</h3>
              </div>
              <button onClick={() => setAlertsOpen(!alertsOpen)} className="text-[var(--text-muted)] hover:text-[var(--amber)] transition-colors">
                {alertsOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>
            {alertsOpen && (
              <div className="p-4 border-b border-[var(--border)] space-y-3">
                <input
                  type="text" value={newAlertSym || selectedSymbol} onChange={(e) => setNewAlertSym(e.target.value)}
                  placeholder="Symbol (e.g. R_100)" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                />
                <div className="flex gap-2">
                  <button onClick={() => setNewAlertDir("above")} className={`flex-1 text-xs font-bold py-1.5 rounded ${newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/30" : "bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]"}`}>Above</button>
                  <button onClick={() => setNewAlertDir("below")} className={`flex-1 text-xs font-bold py-1.5 rounded ${newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/30" : "bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]"}`}>Below</button>
                </div>
                <input
                  type="number" value={newAlertPrice} onChange={(e) => setNewAlertPrice(e.target.value)}
                  placeholder="Target price" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                />
                <Button onClick={() => {
                  if (!newAlertPrice) return;
                  createAlertMutation.mutate({ symbol: newAlertSym || selectedSymbol, direction: newAlertDir, targetPrice: Number(newAlertPrice) });
                }} disabled={createAlertMutation.isPending} className="w-full text-xs font-bold bg-[var(--amber)] text-black py-2 rounded-lg">
                  {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
                </Button>
              </div>
            )}
            <div className="p-4 space-y-2">
              {alertsQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--amber)]" />
              ) : (alertsQuery.data || []).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic text-center py-3">No price alerts set.</p>
              ) : (
                (alertsQuery.data || []).slice(0, 5).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                    <div>
                      <span className="text-xs font-bold text-white">{a.symbol}</span>
                      <span className={`text-[10px] ml-2 ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                        {a.direction === "above" ? "↑" : "↓"} {a.targetPrice}
                      </span>
                      <span className={`text-[10px] ml-2 ${a.status === "triggered" ? "text-[var(--amber)]" : "text-[var(--text-muted)]"}`}>
                        {a.status}
                      </span>
                    </div>
                    {a.status === "active" && (
                      <button onClick={() => disableAlertMutation.mutate({ id: a.id })} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
                        <BellOff className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Insight */}
          <div className="ai-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="section-title text-[11px]">369AI Insight</h3>
            </div>
            {(() => {
              const sigs = (signalsQuery.data as any[]) || [];
              const latest = sigs[0];
              if (!latest) {
                return <div className="empty-state py-6"><p className="empty-state-desc">No signals yet. Ask 369AI to watch a market, or wait for the always-on scanner to surface a pattern.</p></div>;
              }
              return (
                <div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{latest.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <span className="ai-badge">{latest.symbol}</span>
                    <span className="text-[var(--text-muted)]">win rate <b className="text-[var(--green)]">{latest.winRate}%</b></span>
                    <span className="text-[var(--text-muted)]">{new Date((latest.discoveredAt || 0) * 1000).toLocaleString()}</span>
                  </div>
                  <button onClick={() => navigate("/marketplace")} className="mt-3 text-xs text-[var(--cyan)] hover:text-[var(--cyan)]/80 transition-colors flex items-center gap-1">
                    View all signals <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </div>
  );
}
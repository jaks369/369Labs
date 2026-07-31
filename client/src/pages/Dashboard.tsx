import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CurrencyStat, PercentStat, IntegerStat, SignedCurrencyStat } from "@/components/LiveStat";
import { PageContainer, PageSection } from "@/components/PageSection";
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
  AlertCircle,
  Bell,
  BellOff,
  Plus,
  X,
  BookOpen,
  BarChart3,
  Bot,
  Brain,
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";
import DigitProbability from "@/components/DigitProbability";
import SymbolInsights from "@/components/SymbolInsights";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import { VOLATILITY_SYMBOLS } from "@/lib/symbols";
import { getDecimalPlaces } from "@shared/lastDigit";
import WatchlistPanel from "@/components/WatchlistPanel";

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
  const [tradeLogs, setTradeLogs] = useState<{ kind: "ok" | "err"; text: string; time: Date }[]>([]);
  const addTradeLog = (kind: "ok" | "err", text: string) => {
    setTradeLogs(prev => [{ kind, text, time: new Date() }, ...prev].slice(0, 50));
  };
  const [showRiskSettings, setShowRiskSettings] = useState(false);
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
  const [historyTab, setHistoryTab] = useState<"positions" | "trades" | "prices">("positions");
  const priceQuery = trpc.market.getHistory.useQuery({ symbol: selectedSymbol, limit: 200 }, { enabled: historyTab === "prices", refetchInterval: historyTab === "prices" ? 3000 : false, staleTime: 30000, gcTime: 60000 });

  // Live tick buffer: stream ticks from the Deriv WS so the Price History table
  // updates in real time (newest on top, pushing older rows down).
  // Always subscribe when on prices tab, but keep buffer on tab switch.
  const [liveTicks, setLiveTicks] = useState<any[]>([]);
  useEffect(() => {
    if (historyTab !== "prices") return;
    const subId = derivWS.subscribe(selectedSymbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== selectedSymbol) return;
        const price = Number(tick.price);
        const decimals = derivWS.decimalPlacesFor(selectedSymbol);
        const lastDigit = parseInt(price.toFixed(decimals).slice(-1), 10) || 0;
        setLiveTicks((prev) => [{ symbol: tick.symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 50));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); derivWS.unsubscribe(subId); };
  }, [selectedSymbol, historyTab]);

  // Clear live ticks when symbol changes (but NOT on tab switch).
  const prevSymbolRef = useRef(selectedSymbol);
  useEffect(() => {
    if (prevSymbolRef.current !== selectedSymbol) {
      setLiveTicks([]);
      prevSymbolRef.current = selectedSymbol;
    }
  }, [selectedSymbol]);

  // Recover pending contract subscriptions after page refresh / reconnect.
  useEffect(() => {
    if (!derivWS.isAuthorized()) return;
    const pendingIds = derivWS.restorePendingContractsFromLocalStorage();
    if (pendingIds.length === 0) return;
    const existingIds = new Set(Array.from(derivWS["contractListeners"]?.keys() || []));
    for (const contractId of pendingIds) {
      if (existingIds.has(contractId)) continue;
      const meta = derivWS.getContractMeta(contractId);
      if (!meta) continue;
      derivWS.subscribeToContract(contractId, (c: any) => {
        if (c.status !== "open") {
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          saveTradeMutation.mutate({
            result: (profit >= 0 ? "win" : "loss") as any,
            stake: meta.stake,
            entryPrice: meta.entryPrice,
            profitLoss: profit.toFixed(2),
            entryTime: new Date(meta.entryTime),
            exitTime: new Date(),
            symbol: meta.symbol,
            contractType: meta.contractType,
            contractId: String(contractId),
          } as any, { onSuccess: () => tradesQuery.refetch() });
          derivWS.clearContractMeta(contractId);
        }
      });
    }
  }, [derivWS.isAuthorized()]);

  // Use live ticks if streaming, else fall back to the DB snapshot.
  const displayTicks = liveTicks.length ? liveTicks : (priceQuery.data?.ticks || []).slice(0, 50);

  const allTrades = (tradesQuery.data || []) as any[];
  const settled = allTrades.filter((t: any) => t.result === "win" || t.result === "loss");
  const todayKey = new Date().toDateString();
  const todayTrades = allTrades.filter((t: any) => new Date(t.entryTime).toDateString() === todayKey);
  const todaySettled = todayTrades.filter((t: any) => t.result === "win" || t.result === "loss");
  const todayPnl = todaySettled.reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const todayWinRate = todaySettled.length ? Math.round((todaySettled.filter((t: any) => t.result === "win").length / todaySettled.length) * 100) : 0;
  const bestSymbol = (() => {
    const bySym: Record<string, number> = {};
    for (const t of settled) {
      const s = t.symbol || "-";
      bySym[s] = (bySym[s] || 0) + parseFloat(t.profitLoss?.toString() || "0");
    }
    return Object.entries(bySym).sort((a, b) => b[1] - a[1])[0] || null;
  })();
  const bestType = (() => {
    const byType: Record<string, { pnl: number; n: number }> = {};
    for (const t of settled) {
      const ty = t.contractType || "-";
      byType[ty] = byType[ty] || { pnl: 0, n: 0 };
      byType[ty].pnl += parseFloat(t.profitLoss?.toString() || "0");
      byType[ty].n += 1;
    }
    const ranked = Object.entries(byType).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].pnl - a[1].pnl)[0] || null;
    return ranked;
  })();
  const avgWin = (() => {
    const wins = settled.filter((t: any) => t.result === "win");
    if (!wins.length) return 0;
    return wins.reduce((a, t) => a + parseFloat(t.profitLoss?.toString() || "0"), 0) / wins.length;
  })();
  const avgLoss = (() => {
    const losses = settled.filter((t: any) => t.result === "loss");
    if (!losses.length) return 0;
    return losses.reduce((a, t) => a + parseFloat(t.profitLoss?.toString() || "0"), 0) / losses.length;
  })();

  const handleQuickTrade = async () => {
    if (!derivWS.isAuthorized()) { addTradeLog("err", "Connect a Deriv token first (Settings)."); return; }
    const dailyLossLimit = (memoryQuery.data?.memory as any)?.dailyLossLimit;
    if (dailyLossLimit > 0) {
      const today = new Date().toDateString();
      const todayTrades = (tradesQuery.data || []).filter((t: any) => new Date(t.entryTime).toDateString() === today);
      const todayPnl = todayTrades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
      if (todayPnl <= -dailyLossLimit) {
        addTradeLog("err", `Daily loss limit of $${dailyLossLimit} reached. Trading blocked until tomorrow.`);
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
    if (!contractType) { addTradeLog("err", "Unsupported contract type."); return; }
    setTradeBusy(true);
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
      const entrySpot = purchase.entrySpot;
      const entrySuffix = entrySpot !== undefined ? ` @ ${Number(entrySpot).toFixed(getDecimalPlaces(selectedSymbol))}` : "";
      addTradeLog("ok", `Trade placed — contract #${purchase.contractId} on ${selectedSymbol}${entrySuffix}`);
      if (typeof purchase.balanceAfter === "number") setBalance(purchase.balanceAfter);

      // Save an initial pending trade so it shows in history immediately.
      const entryTime = new Date();
      const entryPrice = String(entrySpot ?? purchase.buyPrice ?? stake);
      saveTradeMutation.mutate({
        result: "pending" as any,
        stake: String(stake),
        entryPrice,
        entryTime,
        symbol: selectedSymbol,
        contractType: contractType,
        contractId: String(purchase.contractId),
      } as any, { onSuccess: () => tradesQuery.refetch() });

      derivWS.registerContractMeta(purchase.contractId, {
        stake: String(stake),
        entryPrice,
        entryTime: entryTime.toISOString(),
        symbol: selectedSymbol,
        contractType: contractType,
      });
      derivWS.subscribeToContract(purchase.contractId, (c: any) => {
        if (c.status !== "open") {
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          const resultLabel = profit >= 0 ? "WIN" : "LOSS";
          addTradeLog(profit >= 0 ? "ok" : "err", `Contract #${purchase.contractId} settled — ${resultLabel} ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`);
          saveTradeMutation.mutate({
            result: (profit >= 0 ? "win" : "loss") as any,
            stake: String(stake),
            entryPrice,
            profitLoss: profit.toFixed(2),
            entryTime,
            exitTime: new Date(),
            symbol: selectedSymbol,
            contractType: contractType,
            contractId: String(purchase.contractId),
          } as any, { onSuccess: () => tradesQuery.refetch() });
          derivWS.clearContractMeta(purchase.contractId);
        }
      });
    } catch (e: any) {
      addTradeLog("err", "Trade failed: " + (e?.message || e));
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
  useEffect(() => {
    const unsub = derivWS.onSymbols((syms) => {
      setSymbols(syms);
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
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <PageContainer className="page-container">
      <PageSection>
      <div className="flex flex-col gap-3 mb-6">
          {/* Top row: balance + buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg panel-secondary">
            <Wallet className="w-4 h-4 text-[var(--green)]" />
            <span className="text-xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
              <CurrencyStat value={balance} /> {balanceInfo?.currency || "USD"}
            </span>
            {balanceInfo?.accountType ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{
                background: balanceInfo.accountType === "demo" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                color: balanceInfo.accountType === "demo" ? "var(--accent)" : "var(--red)"
              }}>
                {balanceInfo.accountType}
              </span>
            ) : tokenStatus === "invalid" ? (
              <span className="inline-flex items-center px-[6px] py-[2px] rounded text-xs font-semibold" style={{background: "rgba(239,68,68,0.15)", color: "var(--red)"}}>
                {tokenError?.includes("invalid") || tokenError?.includes("expired") ? "BAD TOKEN" : "NOT CONNECTED"}
              </span>
            ) : tokenStatus === "none" ? (
              <span className="inline-flex items-center px-[6px] py-[2px] rounded text-xs font-semibold" style={{background: "rgba(107,114,128,0.15)", color: "var(--text-disabled)"}}>
                no token
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{background: "rgba(34,197,94,0.15)", color: "var(--green)"}}>
                connected
              </span>
            )}
          </div>
          <Button onClick={() => setShowTokenModal(true)} className="btn btn-primary gap-2 w-full sm:w-auto">
            <Zap className="w-4 h-4 shrink-0" /> <span className="sm:inline">Connect</span>
          </Button>
          <Button onClick={() => setShowSymbolPicker(s => !s)} className="btn btn-outline gap-2 w-full sm:w-auto">
            <Activity className="w-4 h-4 shrink-0" /> <span className="truncate max-w-[100px] sm:max-w-none">{selectedDisplay}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button onClick={() => navigate("/bots")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-all text-caption text-[var(--text-secondary)] hover:text-white cursor-pointer">
            <Bot className="w-5 h-5 text-[var(--accent)]" />
            <span className="hidden sm:inline text-[13px] font-medium">Bots</span>
          </button>
          <button onClick={() => navigate("/backtesting")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-all text-caption text-[var(--text-secondary)] hover:text-white cursor-pointer">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <span className="hidden sm:inline text-[13px] font-medium">Backtest</span>
          </button>
          <button onClick={() => navigate("/journal")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-all text-caption text-[var(--text-secondary)] hover:text-white cursor-pointer">
            <BookOpen className="w-5 h-5 text-[var(--green)]" />
            <span className="hidden sm:inline text-[13px] font-medium">Journal</span>
          </button>
          <button onClick={() => navigate("/ai-assistant")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-all text-caption text-[var(--text-secondary)] hover:text-white cursor-pointer">
            <Brain className="w-5 h-5 text-[var(--accent)]" />
            <span className="hidden sm:inline text-[13px] font-medium">AI</span>
          </button>
        </div>
      </div>
      </PageSection>



      {tokenError && (
      <PageSection>
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
      </PageSection>
      )}

      <PageSection>
      {/* Workstation grid: watchlist | chart+history | order+intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-6">
        {/* Watchlist column — dense, sticky on desktop, hidden on mobile (sheet available) */}
        <div className="hidden lg:block lg:col-span-3 xl:col-span-2 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-120px)]">
          <WatchlistPanel
            compact
            header={false}
            selectedSymbol={selectedSymbol}
            onSelect={(s) => { setSelectedSymbol(s); setShowSymbolPicker(false); }}
          />
        </div>

        {/* Chart & History — the workspace */}
        <div className="lg:col-span-9 xl:col-span-7 space-y-4 xl:space-y-6">

          {/* Chart workspace — the heart of the OS */}
          <div className={showSymbolPicker ? "bg-[var(--card)] rounded-xl p-4 elevation-1" : "chart-workspace"}>
            {showSymbolPicker ? (              <div className="max-h-[300px] md:max-h-[420px] overflow-y-auto space-y-5">
                <div className="sticky top-0 z-10 pb-2 -mt-2 pt-2">
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
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
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
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
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
                                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
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
              <div className="chart-plot" style={{ minHeight: "520px" }}>
                {(() => {
                  const ticks = displayTicks;
                  const last = ticks[0];
                  const prev = ticks[1] || ticks[0];
                  const price = last?.price;
                  const digits = ticks.filter((t: any) => typeof t.lastDigit === "number").map((t: any) => t.lastDigit);
                  const digitCounts: Record<number, number> = {};
                  for (const d of digits) digitCounts[d] = (digitCounts[d] || 0) + 1;
                  const hottest = digits.length >= 10 ? Object.entries(digitCounts).sort((a, b) => b[1] - a[1])[0] : null;
                  const hotPct = hottest ? Math.round((Number(hottest[1]) / digits.length) * 100) : 0;
                  const up = prev && price !== undefined ? price >= prev : null;
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border)]">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-live-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Live</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold font-mono tabular-nums text-white" style={{ color: up === null ? undefined : up ? "var(--green)" : "var(--red)" }}>
                              {price !== undefined ? Number(price).toFixed(decimalPlaces) : "—"}
                            </span>
                            {up !== null && (
                              <span className={`text-sm font-bold ${up ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                {up ? "▲" : "▼"}
                              </span>
                            )}
                          </div>
                          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-[var(--border)]">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Last Digit</span>
                            <span className="text-sm font-bold font-mono" style={{ color: last?.lastDigit >= 5 ? "var(--green)" : "var(--red)" }}>{last?.lastDigit ?? "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hottest && (
                            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)]">
                              <span className="text-[10px] uppercase tracking-wider text-[var(--accent-hover)] font-bold">Hottest Digit</span>
                              <span className="text-sm font-bold font-mono text-[var(--accent-hover)]">{hottest[0]}</span>
                              <span className="text-xs font-mono text-[var(--accent-hover)]/70">{hotPct}%</span>
                            </div>
                          )}
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${derivStatus === "connected" ? "bg-[var(--green-soft)] border-[var(--green)]/25" : "bg-white/5 border-[var(--border)]"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${derivStatus === "connected" ? "bg-[var(--green)] animate-live-pulse" : "bg-[var(--text-disabled)]"}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${derivStatus === "connected" ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}>
                              {derivStatus === "connected" ? "Feed Connected" : derivStatus === "needs_token" ? "Token Required" : "Reconnecting"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <TickChart symbol={selectedSymbol} maxDataPoints={50} decimalPlaces={decimalPlaces} />
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Session stats strip — dense table-like cells */}
          <div className="panel px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center gap-2 min-w-[140px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Session P&L</span>
                <span className={`font-mono tabular-nums font-bold text-[13px] ${todayPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                  {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-[110px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Win Rate</span>
                <span className="font-mono tabular-nums font-bold text-[13px] text-white">{todaySettled.length ? `${todayWinRate}%` : "—"}</span>
              </div>
              <div className="flex items-center gap-2 min-w-[100px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Trades</span>
                <span className="font-mono tabular-nums font-bold text-[13px] text-white">{todayTrades.length}</span>
              </div>
              <div className="flex items-center gap-2 min-w-[130px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Best Symbol</span>
                <span className="font-mono tabular-nums font-bold text-[13px] text-[var(--accent)]">{bestSymbol ? bestSymbol[0] : "—"}</span>
                {bestSymbol && <span className={`font-mono tabular-nums ${Number(bestSymbol[1]) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>({Number(bestSymbol[1]).toFixed(1)})</span>}
              </div>
              <div className="flex items-center gap-2 min-w-[120px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Best Type</span>
                <span className="font-mono tabular-nums font-bold text-[13px] text-white">{bestType ? bestType[0] : "—"}</span>
              </div>
              <div className="flex items-center gap-2 min-w-[120px]">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Avg W/L</span>
                <span className="font-mono tabular-nums font-bold text-[13px]">
                  <span className="text-[var(--green)]">+{avgWin.toFixed(2)}</span>
                  <span className="text-[var(--text-muted)]"> / </span>
                  <span className="text-[var(--red)]">{avgLoss.toFixed(2)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Positions / Trades / Price panel */}
          <div className="panel">
            <div className="panel-header">
              <h2 className="text-lg font-bold">Positions</h2>
              <div className="tabs">
                <button onClick={() => setHistoryTab("positions")} className={`tab ${historyTab === "positions" ? "active" : ""}`}>Positions</button>
                <button onClick={() => setHistoryTab("trades")} className={`tab ${historyTab === "trades" ? "active" : ""}`}>History</button>
                <button onClick={() => setHistoryTab("prices")} className={`tab ${historyTab === "prices" ? "active" : ""}`}>Price History</button>
              </div>
            </div>
            {historyTab === "positions" ? (
              <div>
                {(() => {
                  const allTrades = tradesQuery.data || [];
                  const open = allTrades.filter((t: any) => t.result === "pending");
                  if (open.length === 0) {
                    return <div className="p-4"><div className="empty-state"><p className="empty-state-desc">No open positions. Place a trade to see it live here.</p></div></div>;
                  }
                  return (
                    <div>
                      {open.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] last:border-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate">{t.symbol} <span className="text-[var(--text-muted)] font-medium">{t.contractType}</span></p>
                              <p className="text-xs text-[var(--text-muted)]">#{t.contractId} · {new Date(t.entryTime).toLocaleTimeString()}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-[var(--accent)] font-mono tabular-nums">${Number(t.stake).toFixed(2)}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">entry {Number(t.entryPrice).toFixed(decimalPlaces)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : historyTab === "trades" ? (
              <div>
                {/* Live trade activity log */}
                <div className="p-4 border-b border-[var(--border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-wider">Live Activity</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse-dot" />
                      <span className="text-[10px] text-[var(--text-muted)]">realtime</span>
                    </span>
                  </div>
                  {tradeLogs.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No trade activity yet. Place a trade to see live logs here.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                      {tradeLogs.map((log, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${log.kind === "ok" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                          <span className="text-[var(--text-muted)] shrink-0">{log.time.toLocaleTimeString()}</span>
                          <span className={`truncate ${log.kind === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{log.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(() => {
                  const allTrades = tradesQuery.data || [];
                  const wins = allTrades.filter((t: any) => t.result === "win").length;
                  const losses = allTrades.filter((t: any) => t.result === "loss").length;
                  const net = allTrades.reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
                  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
                  return (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 border-b border-[var(--border)]">
                      <div className="kpi-card">
                        <div className="kpi-label">Trades</div>
                        <div className="kpi-value text-lg"><IntegerStat value={allTrades.length} /></div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">Win Rate</div>
                        <div className="kpi-value text-lg"><PercentStat value={winRate} /></div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">P&L</div>
                        <div className={`kpi-value text-lg ${net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          <SignedCurrencyStat value={net} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div className="table-container border-0 rounded-none">
                  {(() => {
                    const rows = allTrades.slice(0, 20);
                    if (rows.length === 0) {
                      return <div className="empty-state"><p className="empty-state-desc">No trades yet. Place a trade to build your history.</p></div>;
                    }
                    return (
                      <table className="table">
                        <thead>
                          <tr><th>TIME</th><th>SYMBOL</th><th>TYPE</th><th className="text-right">STAKE</th><th className="text-right">ENTRY</th><th>RESULT</th><th className="text-right">P&L</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((trade: any) => {
                            const pl = parseFloat(trade.profitLoss?.toString() || "0");
                            return (
                              <tr key={trade.id}>
                                <td className="tabular-nums text-[var(--text-muted)]">
                                  {trade.entryTime ? new Date(trade.entryTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                </td>
                                <td className={`font-mono font-bold ${(trade.symbol || "") === selectedSymbol ? "text-[var(--accent)]" : "text-white"}`}>{trade.symbol || "—"}</td>
                                <td><span className="tag">{trade.contractType || "-"}</span></td>
                                <td className="text-right tabular-nums">${parseFloat(trade.stake || "0").toFixed(2)}</td>
                                <td className="text-right font-mono tabular-nums">{parseFloat(trade.entryPrice || "0").toFixed(decimalPlaces)}</td>
                                <td>
                                  <span className={`badge ${trade.result === "win" ? "badge-green" : trade.result === "loss" ? "badge-red" : "badge-gray"}`}>
                                    {trade.result?.toUpperCase() || "-"}
                                  </span>
                                </td>
                                <td className={`text-right font-bold font-mono tabular-nums ${pl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                  {pl >= 0 ? "+" : ""}{pl.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-4">
                {priceQuery.isLoading ? (
                    <div className="flex items-center justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
                ) : priceQuery.data?.ticks?.length ? (
                  <div className="table-container border-0 rounded-none">
                    <table className="table">
                      <thead>
                        <tr><th>#</th><th>TIME</th><th className="text-right">PRICE</th><th className="text-right">LAST DIGIT</th></tr>
                      </thead>
                      <tbody>
                        {displayTicks.map((t: any, i: number) => {
                          const prevPrice = i < displayTicks.length - 1 ? displayTicks[i + 1]?.price : t.price;
                          const dir = t.price > prevPrice ? "up" : t.price < prevPrice ? "down" : null;
                          const isLatest = i === 0;
                          return (
                          <tr
                            key={`${t.epoch}-${i}`}
                            className="transition-colors duration-300"
                            style={{
                              background: isLatest && dir === "up" ? "rgba(var(--green-rgb), 0.06)" : isLatest && dir === "down" ? "rgba(var(--red-rgb), 0.06)" : "transparent",
                            }}
                          >
                            <td className="text-[var(--text-muted)] font-mono">{i + 1}</td>
                            <td className="tabular-nums">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                            <td className="text-right text-white font-mono tabular-nums">
                              {dir === "up" ? <span className="text-[var(--green)]">▲ </span> : dir === "down" ? <span className="text-[var(--red)]">▼ </span> : null}
                              {Number(t.price).toFixed(decimalPlaces)}
                            </td>
                            <td className="text-right font-mono" style={{ color: t.lastDigit >= 5 ? "var(--green)" : "var(--red)" }}>{t.lastDigit}</td>
                          </tr>
                          );
                        })}
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

        {/* Order column - Trade Studio, AI, Alerts */}
        <div className="space-y-4 xl:space-y-6 lg:col-span-12 xl:col-span-3 xl:sticky xl:top-4 xl:self-start">

          {/* Trade Studio */}
          <div className="trade-studio flex flex-col max-h-[calc(100vh-120px)]">
            <div className="p-4 pb-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-caption font-semibold">Trade Studio</h3>
                <span className={`badge ${accountType === "real" ? "badge-red" : accountType === "demo" ? "badge-green" : tokenStatus === "invalid" ? "badge-red" : "badge-gray"}`}>
                  {accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : tokenStatus === "invalid" ? "UNAUTHORIZED" : "NO TOKEN"}
                </span>
              </div>
              <div className="input-group mb-3">
                <label className="input-label">Symbol</label>
                <div className="input bg-[var(--surface-secondary)] cursor-default">{selectedDisplay}</div>
              </div>
              <ContractTypeSelector selection={contract} onChange={setContract} />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-3">
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

              {/* Risk settings — collapsed by default */}
              {!showRiskSettings && (stopLoss > 0 || takeProfit > 0) ? (
                <div className="flex items-center gap-3 text-xs">
                  {stopLoss > 0 && <span className="text-[var(--red)]">SL: ${stopLoss.toFixed(2)}</span>}
                  {takeProfit > 0 && <span className="text-[var(--green)]">TP: ${takeProfit.toFixed(2)}</span>}
                  <button onClick={() => setShowRiskSettings(true)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Edit</button>
                </div>
              ) : showRiskSettings ? (
                <div className="space-y-3">
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
                  <button onClick={() => setShowRiskSettings(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Hide risk settings</button>
                </div>
              ) : (
                <button onClick={() => setShowRiskSettings(true)} className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
                  + Add stop loss / take profit
                </button>
              )}

              {!derivWS.isAuthorized() && (
                <p className="text-xs text-[var(--text-muted)]">Connect a Deriv token in Settings to enable trading.</p>
              )}            </div>

            {/* Sticky Buy button */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2 max-md:fixed max-md:bottom-16 max-md:left-0 max-md:right-0 max-md:z-40 max-md:bg-[var(--card)] max-md:border-t max-md:border-[var(--border)] max-md:p-3">
              <Button
                onClick={handleQuickTrade}
                disabled={tradeBusy}
                className="w-full flex items-center justify-center gap-2 h-[52px] text-sm font-bold rounded-lg transition-all"
                style={{
                  background: contract.direction === "fall"
                    ? "linear-gradient(180deg, var(--red) 0%, color-mix(in srgb, var(--red) 85%, black) 100%)"
                    : "linear-gradient(180deg, var(--green) 0%, color-mix(in srgb, var(--green) 85%, black) 100%)",
                  color: "white",
                }}
              >
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (contract.direction === "fall" ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />)}
                {tradeBusy ? "Placing..." : contract.direction === "fall" ? "Sell" : "Buy"}
              </Button>
            </div>

            <div className="px-4 pb-4">
              <div className="pt-4 border-t border-[var(--border)]">
                <DigitProbability symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
              </div>
            </div>
          </div>

          {/* 369AI Insight */}
          <div className="ai-panel p-6 ai-alive">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[var(--accent)] animate-breathe" />
              <h3 className="text-caption font-semibold">369AI Insight</h3>
            </div>
            {(() => {
              const sigs = Array.isArray(signalsQuery.data) ? signalsQuery.data : [];
              const forSymbol = sigs.filter((s: any) => s.symbol === selectedSymbol);
              const latest = forSymbol[0] || sigs[0];
              if (!latest) {
                return <div className="empty-state py-6"><p className="empty-state-desc">No signals for {selectedDisplay} yet. Ask 369AI to watch a market, or wait for the always-on scanner to surface a pattern.</p></div>;
              }
              return (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="ai-badge">{latest.symbol}</span>
                    {latest.symbol === selectedSymbol && (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">● Live context</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{latest.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <span className="text-[var(--text-muted)]">win rate <b className="text-[var(--green)]">{latest.winRate}%</b></span>
                    <span className="text-[var(--text-muted)]">{new Date((latest.discoveredAt || 0) * 1000).toLocaleString()}</span>
                  </div>
                  <button onClick={() => navigate("/marketplace")} className="mt-3 text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors flex items-center gap-1">
                    View all signals <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })()}
          </div>

          <SymbolInsights symbol={selectedSymbol} ticks={displayTicks} trades={tradesQuery.data || []} decimalPlaces={decimalPlaces} />

          {/* Price Alerts */}
          <div className="panel">
            <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none max-md:-mx-4 max-md:px-4">
                <Bell className="w-3.5 h-3.5 text-[var(--accent)]" />
                <h3 className="text-micro">Price Alerts</h3>
              </div>
              <button onClick={() => setAlertsOpen(!alertsOpen)} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                {alertsOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>
            {alertsOpen && (
              <div className="p-4 border-b border-[var(--border)] space-y-3">
                <input
                  type="text" value={newAlertSym || selectedSymbol} onChange={(e) => setNewAlertSym(e.target.value)}
                  placeholder="Symbol (e.g. R_100)" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                />
                <div className="flex rounded-lg bg-[var(--card)] p-0.5">
                  <button onClick={() => setNewAlertDir("above")} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)]" : "text-[var(--text-muted)] hover:text-white"}`}>Above</button>
                  <button onClick={() => setNewAlertDir("below")} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--text-muted)] hover:text-white"}`}>Below</button>
                </div>
                <input
                  type="number" value={newAlertPrice} onChange={(e) => setNewAlertPrice(e.target.value)}
                  placeholder="Target price" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                />
                <Button onClick={() => {
                  if (!newAlertPrice) return;
                  createAlertMutation.mutate({ symbol: newAlertSym || selectedSymbol, direction: newAlertDir, targetPrice: Number(newAlertPrice) });
                }} disabled={createAlertMutation.isPending} className="w-full text-xs font-bold bg-[var(--cta-fill)] text-[var(--cta-text)] py-2 rounded-lg">
                  {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
                </Button>
              </div>
            )}
            <div className="p-4 space-y-2">
              {alertsQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
              ) : (alertsQuery.data || []).length === 0 ? (
                <div className="empty-state"><p className="empty-state-desc">No price alerts set.</p></div>
              ) : (
                (alertsQuery.data || []).slice(0, 5).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                    <div>
                      <span className="text-xs font-bold text-white">{a.symbol}</span>
                      <span className={`text-caption ml-2 ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                        {a.direction === "above" ? "↑" : "↓"} {a.targetPrice}
                      </span>
                      <span className={`text-caption ml-2 ${a.status === "triggered" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
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
        </div>
      </div>
      </PageSection>

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </PageContainer>
  );
}
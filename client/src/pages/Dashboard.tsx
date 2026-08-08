import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CurrencyStat } from "@/components/LiveStat";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { PageSection } from "@/components/PageSection";
import { Loader2, Activity, Zap, ChevronDown, Wallet, BarChart3, Bot, Brain, Star, Search, Clock, History } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
import MobileTerminal from "@/pages/MobileTerminal";
import TickChart from "@/components/TickChart";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import { ContractSelection } from "@/components/ContractTypeSelector";
import { VOLATILITY_SYMBOLS, getSymbolDisplayName } from "@/lib/symbols";
import { getDecimalPlaces, lastDigitOf } from "@shared/lastDigit";
import TerminalContextPanel from "@/components/TerminalContextPanel";
import { toast } from "@/components/Toast";
import InsightsPopup from "@/components/InsightsPopup";
import PopupPanel from "@/components/PopupPanel";
import WatchlistPanel from "@/components/WatchlistPanel";

const ALL_FALLBACK: DerivSymbol[] = VOLATILITY_SYMBOLS.map((s) => ({ ...s, decimalPlaces: 2 }));

const contractLabels: Record<string, string> = {
  rise_fall: "Rise / Fall",
  over_under: "Over / Under",
  even_odd: "Even / Odd",
  digits: "Digits",
  accumulator: "Accumulator",
};

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
  const [marketFilter, setMarketFilter] = useState<"all" | "vol" | "1s" | "boom" | "other">("all");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });
  const [stake, setStake] = useState<number>(1);
  const [duration, setDuration] = useState<number>(5);
  const [durationUnit, setDurationUnit] = useState<"t" | "m">("t");
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeLogs, setTradeLogs] = useState<{ kind: "ok" | "err"; text: string; time: Date }[]>([]);
  const addTradeLog = (kind: "ok" | "err", text: string) => {
    setTradeLogs((prev) => [{ kind, text, time: new Date() }, ...prev].slice(0, 50));
  };
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [newAlertSym, setNewAlertSym] = useState("");
  const [newAlertDir, setNewAlertDir] = useState<"above" | "below">("above");
  const [newAlertPrice, setNewAlertPrice] = useState("");

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 }, { refetchInterval: 5000, refetchIntervalInBackground: true });
  const signalsQuery = trpc.signals.list.useQuery(void 0, { refetchInterval: 30000 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const memoryQuery = trpc.memory.get.useQuery();
  const alertsQuery = trpc.alerts.list.useQuery();
  const createAlertMutation = trpc.alerts.create.useMutation({
    onSuccess: () => {
      alertsQuery.refetch();
      setNewAlertSym("");
      setNewAlertPrice("");
    },
  });
  const disableAlertMutation = trpc.alerts.disable.useMutation({
    onSuccess: () => alertsQuery.refetch(),
  });
  const [historyTab, setHistoryTab] = useState<"positions" | "trades" | "prices">("positions");
  const [dataPopupOpen, setDataPopupOpen] = useState(false);
  const [dataPopupTab, setDataPopupTab] = useState<"watchlist" | "trades" | "prices" | "ohlc">("watchlist");
  const [tradeTypePopupOpen, setTradeTypePopupOpen] = useState(false);
  const [insightPopupOpen, setInsightPopupOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [tradeTypePos, setTradeTypePos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!tradeTypePopupOpen) return;
    const btn = moreBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const w = 320;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setTradeTypePos({ top: Math.min(r.bottom + 4, window.innerHeight - 340), left });
  }, [tradeTypePopupOpen]);

  const urlSearch = useSearch();
  useEffect(() => {
    const sym = new URLSearchParams(urlSearch).get("symbol");
    if (sym) {
      setSelectedSymbol(sym);
      setShowSymbolPicker(false);
    }
  }, [urlSearch]);
  const priceQuery = trpc.market.getHistory.useQuery(
    { symbol: selectedSymbol, limit: 200 },
    { enabled: historyTab === "prices", staleTime: 30000, gcTime: 60000 },
  );

  // Live tick buffer: stream ticks from the Deriv WS so the header price and
  // Price History table update in real time (newest on top).
  const [liveTicks, setLiveTicks] = useState<any[]>([]);
  useEffect(() => {
    derivWS.markBackground(selectedSymbol);
    const subId = derivWS.subscribe(selectedSymbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== selectedSymbol) return;
        const price = Number(tick.price);
        const decimals = derivWS.decimalPlacesFor(selectedSymbol);
        const lastDigit = lastDigitOf(price, decimals);
        setLiveTicks((prev) => [{ symbol: tick.symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 50));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(subId);
    };
  }, [selectedSymbol]);

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
          saveTradeMutation.mutate(
            {
              result: (profit >= 0 ? "win" : "loss") as any,
              stake: meta.stake,
              entryPrice: meta.entryPrice,
              profitLoss: profit.toFixed(2),
              entryTime: new Date(meta.entryTime),
              exitTime: new Date(),
              symbol: meta.symbol,
              contractType: meta.contractType,
              contractId: String(contractId),
            } as any,
            { onSuccess: () => tradesQuery.refetch() },
          );
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
    const ranked =
      Object.entries(byType)
        .filter(([, v]) => v.n >= 2)
        .sort((a, b) => b[1].pnl - a[1].pnl)[0] || null;
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

  const handleQuickTrade = async (dir?: "rise" | "fall") => {
    const direction = dir || contract.direction;
    if (!derivWS.isAuthorized()) {
      addTradeLog("err", "Connect a Deriv token first (Settings).");
      return;
    }
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
      rise_fall: direction === "fall" ? "PUT" : "CALL",
      over_under: contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
      even_odd: contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
      digits: contract.digitMatch === "differ" ? "DIGITDIFF" : "DIGITMATCH",
      accumulator: "ACCU",
    };
    const contractType = map[contract.category];
    if (!contractType) {
      addTradeLog("err", "Unsupported contract type.");
      return;
    }
    setTradeBusy(true);
    try {
      const isAccumulator = contract.category === "accumulator";
      const purchase = await derivWS.purchaseContract({
        symbol: selectedSymbol,
        contractType: contractType as any,
        amount: stake,
        ...(isAccumulator ? { growthRate: contract.growthRate ?? 1 } : { duration, durationUnit }),
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
      saveTradeMutation.mutate(
        {
          result: "pending" as any,
          stake: String(stake),
          entryPrice,
          entryTime,
          symbol: selectedSymbol,
          contractType: contractType,
          contractId: String(purchase.contractId),
        } as any,
        { onSuccess: () => tradesQuery.refetch() },
      );

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
          addTradeLog(profit >= 0 ? "ok" : "err", `Contract #${purchase.contractId} settled — ${resultLabel} ${formatSignedMoney(profit)}`);
          saveTradeMutation.mutate(
            {
              result: (profit >= 0 ? "win" : "loss") as any,
              stake: String(stake),
              entryPrice,
              profitLoss: profit.toFixed(2),
              entryTime,
              exitTime: new Date(),
              symbol: selectedSymbol,
              contractType: contractType,
              contractId: String(purchase.contractId),
            } as any,
            { onSuccess: () => tradesQuery.refetch() },
          );
          derivWS.clearContractMeta(purchase.contractId);
        }
      });
    } catch (e: any) {
      addTradeLog("err", "Trade failed: " + (e?.message || e));
    } finally {
      setTradeBusy(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
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
      const running = botRunsQuery.data.some((run) => run.status === "running");
      setBotRunning(running);
    }
  }, [botRunsQuery.data]);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : b.accounts || [b];
      const acct = list[0] || b;
      setBalance(parseFloat(acct?.balance != null ? acct.balance : acct?.display_balance || "0") || 0);
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
  const tokenStatus: "none" | "invalid" | "connected" = !tokenSaved ? "none" : tokenError || !derivWS.isAuthorized() ? "invalid" : "connected";

  useEffect(() => {
    const unsub = derivWS.onTokenError((msg) => setTokenError(msg));
    const interval = setInterval(() => {
      if (derivWS.isAuthorized() && tokenError) setTokenError(null);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
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

  useEffect(() => {
    if (!tradeTypePopupOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-trade-type-popup]')) setTradeTypePopupOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tradeTypePopupOpen]);

  const symbolList = symbols.length > 0 ? symbols : ALL_FALLBACK;
  const pickerSymbols = symbols.length > 0 ? symbols : ALL_FALLBACK;
  const vol1sSymbols = pickerSymbols.filter((s) => /^1HZ/i.test(s.symbol) || /\(1s\)/i.test(s.displayName));
  const volRegularSymbols = pickerSymbols.filter((s) => /volatility/i.test(s.displayName) && !/\(1s\)/i.test(s.displayName) && !/^1HZ/i.test(s.symbol));
  const boomCrashSymbols = pickerSymbols.filter((s) => /boom|crash/i.test(s.market) || /boom|crash/i.test(s.displayName));
  const otherSymbols = pickerSymbols.filter(
    (s) => !/volatility/i.test(s.displayName) && !/^1HZ/i.test(s.symbol) && !/\(1s\)/i.test(s.displayName) && !(/boom|crash/i.test(s.market) || /boom|crash/i.test(s.displayName)),
  );

  const selectedDisplay = symbolList.find((s) => s.symbol === selectedSymbol)?.displayName || selectedSymbol;
  const decimalPlaces = derivWS.decimalPlacesFor(selectedSymbol);
  const { status: derivStatus, accountType } = useDerivStatus();

  const isMobile = useIsMobile();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (isMobile) {
    return <MobileTerminal />;
  }

  return (
    <div className="terminal-page h-full">
      <PageSection className="h-full">
        {/* Compact Terminal Layout: Chart + Trade Panel */}
        <div className="terminal-layout">
          {/* Left: Chart area */}
          <div className="terminal-chart-area">
            {/* Chart Header: Symbol + Price + Balance + Status */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.08)] shrink-0" style={{ background: 'transparent' }}>
              <div className="flex items-center gap-3">
                {/* Symbol Picker */}
                <div className="relative">
                  <button
                    onClick={() => setShowSymbolPicker((s) => !s)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)] transition-colors text-sm font-semibold text-white"
                  >
                    <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="truncate max-w-[120px]">{selectedDisplay}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
                  </button>
                  {/* Symbol Picker Dropdown */}
                  {showSymbolPicker && (
                    <div className="symbol-picker-dropdown rounded-lg p-2 shadow-2xl">
                      <div className="relative mb-2">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          value={symbolSearch}
                          onChange={(e) => setSymbolSearch(e.target.value)}
                          placeholder="Search symbols..."
                          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-[var(--text-muted)]"
                        />
                      </div>
                      <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-none">
                        {([
                          ["all", "All"],
                          ["vol", "Vol"],
                          ["1s", "1s"],
                          ["boom", "B&C"],
                          ["other", "Other"],
                        ] as [typeof marketFilter, string][]).map(([key, label]) => (
                          <button key={key} onClick={() => setMarketFilter(key)} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap transition-colors ${marketFilter === key ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-white"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="max-h-[240px] overflow-y-auto space-y-2">
                        {(() => {
                          const q = symbolSearch.toLowerCase().trim();
                          const filter = (s: DerivSymbol) => !q || s.symbol.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q);
                          const inFilter = (s: DerivSymbol) =>
                            marketFilter === "all" ||
                            (marketFilter === "1s" && vol1sSymbols.some((x) => x.symbol === s.symbol)) ||
                            (marketFilter === "vol" && volRegularSymbols.some((x) => x.symbol === s.symbol)) ||
                            (marketFilter === "boom" && boomCrashSymbols.some((x) => x.symbol === s.symbol)) ||
                            (marketFilter === "other" && otherSymbols.some((x) => x.symbol === s.symbol));
                          const sections: [string, DerivSymbol[]][] = [
                            ["Volatility 1s", vol1sSymbols.filter((s) => filter(s) && inFilter(s))],
                            ["Volatility", volRegularSymbols.filter((s) => filter(s) && inFilter(s))],
                            ["Boom & Crash", boomCrashSymbols.filter((s) => filter(s) && inFilter(s))],
                            ["Other", otherSymbols.filter((s) => filter(s) && inFilter(s))],
                          ];
                          return sections.map(([title, list]) =>
                            list.length > 0 ? (
                              <div key={title}>
                                <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold px-1 mb-1">{title}</div>
                                <div className="grid grid-cols-2 gap-1">
                                  {list.map((s) => (
                                    <button
                                      key={s.symbol}
                                      onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); setSymbolSearch(""); }}
                                      className={`text-left px-2 py-1 rounded text-[11px] font-semibold truncate transition-all ${selectedSymbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-secondary)] hover:bg-white/5"}`}
                                    >
                                      {s.displayName || s.symbol}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null,
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                {/* Live Price */}
                {(() => {
                  const ticks = displayTicks;
                  const last = ticks[0];
                  const prev = ticks[1] || ticks[0];
                  const price = last?.price;
                  const up = prev && price !== undefined ? price >= prev : null;
                  return (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-lg font-bold font-mono tabular-nums text-white"
                        style={{ color: up === null ? undefined : up ? "var(--green)" : "var(--red)" }}
                      >
                        {price !== undefined ? Number(price).toFixed(decimalPlaces) : "—"}
                      </span>
                      {up !== null && <span className={`text-xs font-bold ${up ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{up ? "▲" : "▼"}</span>}
                    </div>
                  );
                })()}
                {/* Last Digit */}
                {(() => {
                  const last = displayTicks[0];
                  return last?.lastDigit !== undefined ? (
                    <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-[var(--border)]">
                      <span className="text-[9px] uppercase text-[var(--text-muted)] font-bold">D</span>
                      <span className="text-xs font-bold font-mono" style={{ color: last.lastDigit >= 5 ? "var(--green)" : "var(--red)" }}>
                        {last.lastDigit}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Session Stats (compact inline) */}
                <div className="hidden lg:flex items-center gap-2 text-[11px] shrink-0">
                  <span className="text-[var(--text-muted)]">P&L <span className={`font-mono font-bold ${todayPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{formatSignedMoney(todayPnl)}</span></span>
                  <span className="text-[var(--text-muted)]">WR <span className="font-mono font-bold text-white">{todaySettled.length ? `${todayWinRate}%` : "—"}</span></span>
                  <span className="text-[var(--text-muted)]">N <span className="font-mono font-bold text-white">{todayTrades.length}</span></span>
                </div>
                {/* Balance */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-[var(--border)] shrink-0">
                  <Wallet className="w-3.5 h-3.5 text-[var(--green)]" />
                  <span className="text-sm font-bold font-mono tabular-nums text-white">
                    <CurrencyStat value={balance} currency={balanceInfo?.currency || "USD"} />
                  </span>
                </div>
                {/* Connection Status */}
                <div className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded shrink-0 ${derivStatus === "connected" ? "bg-[var(--green-soft)]" : "bg-white/5 border border-[var(--border)]"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${derivStatus === "connected" ? "bg-[var(--green)] animate-live-pulse" : "bg-[var(--text-disabled)]"}`} />
                  <span className={`text-[10px] font-bold uppercase ${derivStatus === "connected" ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}>
                    {derivStatus === "connected" ? "Live" : "Offline"}
                  </span>
                </div>
                {/* Quick Access Popups — single toggle */}
                <div className="hidden md:flex items-center gap-0.5 shrink-0">
                  <button onClick={() => { setDataPopupTab("watchlist"); setDataPopupOpen(true); }} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors" title="Data: Watchlist, Trade History, Prices">
                    <Star className="w-3 h-3" />
                  </button>
                  <button onClick={() => setInsightPopupOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors text-black hover:brightness-110" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple), var(--aurora-magenta))" }} title="Insights — Digit Frequency, AI Insight, 369AI Verdicts, Risk Controls">
                    <Brain className="w-3 h-3" />
                    <span className="hidden lg:inline">Insights</span>
                  </button>
                </div>
                {/* Connect button */}
                <button onClick={() => setShowTokenModal(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent)] text-black text-[11px] font-bold hover:brightness-110 transition-all shrink-0">
                  <Zap className="w-3 h-3" /> Connect
                </button>
              </div>
            </div>

            {/* Trade Type Pill Row — always visible above chart */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[rgba(255,255,255,0.08)] shrink-0 overflow-x-auto scrollbar-none" style={{ background: 'transparent' }}>
              {([
                { id: "rise_fall", label: "Rise/Fall" },
                { id: "over_under", label: "Over/Under" },
                { id: "even_odd", label: "Even/Odd" },
                { id: "digits", label: "Digits" },
                { id: "accumulator", label: "Accumulators" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    const base: ContractSelection = { category: t.id };
                    if (t.id === "rise_fall") base.direction = "rise";
                    if (t.id === "over_under") { base.overUnder = "over"; base.barrier = 5; }
                    if (t.id === "even_odd") base.digitMatch = "match";
                    if (t.id === "digits") { base.digitMatch = "match"; base.digit = 0; }
                    if (t.id === "accumulator") base.growthRate = 1;
                    setContract(base);
                  }}
                  className={`trade-type-tab shrink-0 ${contract.category === t.id ? "active" : ""}`}
                >
                  {t.label}
                </button>
              ))}
              <button
                ref={moreBtnRef}
                onClick={() => setTradeTypePopupOpen((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors shrink-0"
                title="All Trade Types"
                data-trade-type-popup
              >
                <Zap className="w-3 h-3" />
                <span>More</span>
              </button>
            </div>

            {/* Chart Plot */}
            <div className="flex-1 min-h-0 relative terminal-chart-panel">
              <div className="chart-plot h-full" style={{ background: 'transparent', minHeight: 0 }}>
                <TickChart symbol={selectedSymbol} maxDataPoints={50} decimalPlaces={decimalPlaces} fillHeight />
              </div>
            </div>
          </div>

          {/* Right: Trade Panel */}
          <div className="terminal-trade-panel" style={{ background: 'transparent' }}>
            <TerminalContextPanel
              selectedSymbol={selectedSymbol}
              selectedDisplay={selectedDisplay}
              decimalPlaces={decimalPlaces}
              accountType={accountType}
              tokenStatus={tokenStatus}
              isAuthorized={derivWS.isAuthorized()}
              contract={contract}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              durationUnit={durationUnit}
              onDurationChange={(n, u) => { setDuration(n); setDurationUnit(u); }}
              onContractChange={setContract}
              onQuickTrade={handleQuickTrade}
              tradeBusy={tradeBusy}
              tokenError={tokenError}
              onOpenToken={() => setShowTokenModal(true)}
              openPositions={(tradesQuery.data || []).filter((t: any) => t.result === "pending")}
              onSelectSymbol={(s) => setSelectedSymbol(s)}
            />
          </div>
        </div>
      </PageSection>

      {/* Consolidated Data Popup: Watchlist / Trades / Prices */}
      <PopupPanel
        open={dataPopupOpen}
        onClose={() => setDataPopupOpen(false)}
        title="Data"
        icon={<Star className="w-4 h-4 text-[var(--accent)]" />}
        width="420px"
      >
        <div className="flex border-b border-[rgba(255,255,255,0.08)]">
          {([
            { id: "watchlist" as const, label: "Watchlist", icon: <Star className="w-3 h-3" /> },
            { id: "trades" as const, label: "Trades", icon: <History className="w-3 h-3" /> },
            { id: "prices" as const, label: "Prices", icon: <Clock className="w-3 h-3" /> },
            { id: "ohlc" as const, label: "OHLC", icon: <BarChart3 className="w-3 h-3" /> },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDataPopupTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors ${dataPopupTab === tab.id ? "text-[var(--accent)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {dataPopupTab === "watchlist" && (
            <div className="p-2">
              <WatchlistPanel
                selectedSymbol={selectedSymbol}
                onSelect={(s) => { setSelectedSymbol(s); setShowSymbolPicker(false); setDataPopupOpen(false); }}
              />
            </div>
          )}
          {dataPopupTab === "trades" && (
            <div className="p-3">
              {allTrades.slice(0, 30).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-6">No trades yet.</p>
              ) : (
                <div className="space-y-1">
                  {allTrades.slice(0, 30).map((trade: any) => {
                    const pl = parseFloat(trade.profitLoss?.toString() || "0");
                    return (
                      <div key={trade.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${trade.result === "win" ? "bg-[var(--green)]" : trade.result === "loss" ? "bg-[var(--red)]" : "bg-[var(--accent)]"}`} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">{getSymbolDisplayName(trade.symbol)}</p>
                            <p className="text-[9px] text-[var(--text-muted)]">{trade.contractType} · {trade.entryTime ? new Date(trade.entryTime).toLocaleTimeString() : "—"}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[11px] font-bold font-mono tabular-nums ${pl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {formatSignedMoney(pl)}
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)]">{formatMoney(trade.stake)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {dataPopupTab === "prices" && (
            <div className="p-3">
              {displayTicks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-6">No price data.</p>
              ) : (
                <div className="space-y-0.5">
                  {displayTicks.slice(0, 50).map((t: any, i: number) => {
                    const prevPrice = i < displayTicks.length - 1 ? displayTicks[i + 1]?.price : t.price;
                    const dir = t.price > prevPrice ? "up" : t.price < prevPrice ? "down" : null;
                    return (
                      <div key={`${t.epoch}-${i}`} className="flex items-center justify-between py-1 px-2 rounded text-[11px]">
                        <span className="text-[var(--text-muted)] font-mono text-[10px]">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</span>
                        <span className="flex items-center gap-1">
                          {dir === "up" && <span className="text-[var(--green)]">▲</span>}
                          {dir === "down" && <span className="text-[var(--red)]">▼</span>}
                          <span className="font-mono tabular-nums text-white">{Number(t.price).toFixed(decimalPlaces)}</span>
                        </span>
                        <span className="font-mono text-[10px] font-bold" style={{ color: t.lastDigit >= 5 ? "var(--green)" : "var(--red)" }}>
                          {t.lastDigit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {dataPopupTab === "ohlc" && (
            <div className="p-3">
              {(() => {
                const ticks = displayTicks;
                const prices = ticks.map((t: any) => t.price).filter(Boolean);
                if (prices.length < 2) return <p className="text-xs text-[var(--text-muted)] text-center py-6">Awaiting OHLC data.</p>;
                const open = prices[prices.length - 1];
                const high = Math.max(...prices);
                const low = Math.min(...prices);
                const close = prices[0];
                const range = high - low;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Open", value: open, color: "text-white" },
                        { label: "High", value: high, color: "text-[var(--green)]" },
                        { label: "Low", value: low, color: "text-[var(--red)]" },
                        { label: "Close", value: close, color: "text-white" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border border-[rgba(255,255,255,0.08)] p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">{item.label}</div>
                          <div className={`text-sm font-bold font-mono tabular-nums ${item.color}`}>{Number(item.value).toFixed(decimalPlaces)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-[rgba(255,255,255,0.08)] p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">Range</div>
                      <div className="text-sm font-bold font-mono tabular-nums text-[var(--accent)]">{Number(range).toFixed(decimalPlaces)}</div>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">Based on last {prices.length} ticks</div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </PopupPanel>

      {/* Insights Drawer — Digit Frequency, AI Insight, 369AI Verdicts, Risk Controls, Positions, Alerts */}
      <InsightsPopup
        open={insightPopupOpen}
        onClose={() => setInsightPopupOpen(false)}
        symbol={selectedSymbol}
        displayName={selectedDisplay}
        decimalPlaces={decimalPlaces}
        stopLoss={stopLoss}
        takeProfit={takeProfit}
        onStopLossChange={setStopLoss}
        onTakeProfitChange={setTakeProfit}
        openPositions={(tradesQuery.data || []).filter((t: any) => t.result === "pending")}
        onSelectSymbol={(s) => {
          setSelectedSymbol(s);
          setShowSymbolPicker(false);
        }}
        signals={signalsQuery.data || []}
        ticks={displayTicks}
        trades={(tradesQuery.data || []) as any}
        onViewSignals={() => navigate("/marketplace")}
        alerts={alertsQuery.data || []}
        alertsLoading={alertsQuery.isLoading}
        alertsOpen={alertsOpen}
        onToggleAlerts={() => setAlertsOpen((v) => !v)}
        newAlertSym={newAlertSym}
        newAlertDir={newAlertDir}
        newAlertPrice={newAlertPrice}
        onNewAlertSym={setNewAlertSym}
        onNewAlertDir={setNewAlertDir}
        onNewAlertPrice={setNewAlertPrice}
        onCreateAlert={() => {
          if (!newAlertPrice || Number(newAlertPrice) <= 0) { toast("Enter a valid price", "error"); return; }
          createAlertMutation.mutate(
            { symbol: newAlertSym || selectedSymbol, direction: newAlertDir, targetPrice: Number(newAlertPrice) },
            { onError: () => toast("Failed to create alert", "error") }
          );
        }}
        createAlertPending={createAlertMutation.isPending}
        onDisableAlert={(id) => disableAlertMutation.mutate({ id })}
      />

      {/* All Trade Types popup — anchored to the "More" button, portal to body to avoid row overflow clipping */}
      {tradeTypePopupOpen &&
        tradeTypePos &&
        createPortal(
          <div
            data-trade-type-popup
            className="aurora-glass-panel rounded-lg p-3 shadow-2xl"
            style={{ position: "fixed", top: tradeTypePos.top, left: tradeTypePos.left, width: 320, zIndex: 70 }}
          >
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">All Trade Types</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "rise_fall", label: "Rise / Fall", desc: "Predict if price goes up or down" },
                { id: "over_under", label: "Over / Under", desc: "Last digit above or below barrier" },
                { id: "even_odd", label: "Even / Odd", desc: "Last digit is even or odd" },
                { id: "digits", label: "Matches / Differs", desc: "Last digit matches or differs" },
                { id: "accumulator", label: "Accumulator", desc: "Compounding tick trades" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    const base: ContractSelection = { category: t.id };
                    if (t.id === "rise_fall") base.direction = "rise";
                    if (t.id === "over_under") { base.overUnder = "over"; base.barrier = 5; }
                    if (t.id === "even_odd") base.digitMatch = "match";
                    if (t.id === "digits") { base.digitMatch = "match"; base.digit = 0; }
                    if (t.id === "accumulator") base.growthRate = 1;
                    setContract(base);
                    setTradeTypePopupOpen(false);
                  }}
                  className={`text-left p-2 rounded-lg transition-colors ${contract.category === t.id ? "bg-[var(--accent)]/10 border border-[var(--accent)]/20" : "hover:bg-white/5 border border-transparent"}`}
                >
                  <span className={`text-[11px] font-bold block ${contract.category === t.id ? "text-[var(--accent)]" : "text-white"}`}>{t.label}</span>
                  <span className="text-[9px] text-[var(--text-muted)] leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </div>
  );
}

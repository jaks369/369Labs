import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronDown, TrendingUp, TrendingDown, Zap, Wallet, ShieldCheck, X, Activity, Search, History, AlertTriangle } from "lucide-react";
import { FilterPill } from "@/components/ui/filter-pill";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import DurationSelector from "@/components/DurationSelector";
import type { DurationUnit } from "@/components/DurationSelector";
import TickChart from "@/components/TickChart";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useTradeExecution } from "@/hooks/useTradeExecution";
import { usePayoutQuote } from "@/hooks/usePayoutQuote";
import { VOLATILITY_SYMBOLS, getSymbolDisplayName } from "@/lib/symbols";
import { getDecimalPlaces, lastDigitOf } from "@shared/lastDigit";
import { validateTrade } from "@shared/tradeValidation";
import { isSyntheticIndexSymbol } from "@shared/symbols";
import { formatMoney, formatNumber } from "@/lib/format";
import { toast } from "@/components/Toast";

const ALL_FALLBACK: DerivSymbol[] = VOLATILITY_SYMBOLS.map((s) => ({ ...s, decimalPlaces: 2 }));
const TIMEFRAMES: { label: string; points: number }[] = [
  { label: "1m", points: 25 },
  { label: "5m", points: 50 },
  { label: "15m", points: 100 },
  { label: "1h", points: 200 },
  { label: "4h", points: 300 },
];

export default function MobileTerminal() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = usePersistentState<string>("369labs.terminal.symbol", ALL_FALLBACK[0]?.symbol || "R_100");
  const [liveSymbols, setLiveSymbols] = useState<DerivSymbol[]>([]);
  const symbols: DerivSymbol[] = liveSymbols.length > 0 ? liveSymbols : ALL_FALLBACK;
  const [timeframe, setTimeframe] = usePersistentState<number>("369labs.terminal.timeframe", 1);
  const [ticks, setTicks] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<{ currency: string; accountType: string } | null>(null);
  const [contract, setContract] = usePersistentState<ContractSelection>("369labs.terminal.contract", { category: "rise_fall", direction: "rise" });
  const [stake, setStake] = usePersistentState<number>("369labs.terminal.stake", 1);
  const [duration, setDuration] = usePersistentState<number>("369labs.terminal.duration", 5);
  const [durationUnit, setDurationUnit] = usePersistentState<DurationUnit>("369labs.terminal.durationUnit", "t");
  const [stopLoss, setStopLoss] = usePersistentState<number>("369labs.terminal.stopLoss", 0);
  const [takeProfit, setTakeProfit] = usePersistentState<number>("369labs.terminal.takeProfit", 0);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<"all" | "vol" | "1s" | "boom">("all");
  const [showPositions, setShowPositions] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [showTiltDetail, setShowTiltDetail] = useState(false);

  // Auto-switch duration unit: tick duration is only offered on synthetic
  // indices. Forex/crypto/stock indices are time-only — tick duration there
  // gets rejected by Deriv ("Trading is not offered for this duration").
  useEffect(() => {
    if (!isSyntheticIndexSymbol(symbol) && durationUnit === "t") {
      setDuration(5);
      setDurationUnit("m");
    }
  }, [symbol, durationUnit, setDuration, setDurationUnit]);

  const tradesQuery = trpc.trades.list.useQuery({ limit: 50 });
  const saveTradeMutation = trpc.trades.save.useMutation();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const memoryQuery = trpc.memory.get.useQuery();
  const healthQuery = trpc.trades.health.useQuery(void 0, { refetchInterval: 30000 });
  // Risk awareness where auto-exec users actually live: tilt state and
  // aggregate portfolio heat, both computed server-side.
  const tiltQuery = trpc.tilt.check.useQuery(undefined, { refetchInterval: 60000 });
  const heatQuery = trpc.portfolio.heat.useQuery(undefined, { refetchInterval: 30000 });
  // Heat proximity chip: amber when within 75% of the aggregate cap.
  const heatPct = heatQuery.data?.gateable ? heatQuery.data.heatPct ?? 0 : 0;
  const capPct = heatQuery.data?.capPct ?? 20;
  const heatHot = heatPct >= capPct * 0.75;
  const historyQuery = trpc.market.getHistory.useQuery(
    { symbol, limit: 200 },
    { enabled: showPriceHistory && Boolean(symbol), staleTime: 30000, gcTime: 120000 },
  );
  const { accountType, status: derivStatus } = useDerivStatus();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Persist a trade record with bounded retry so a transient reject (dropped
  // session, rate limit, cold-connecting DB) never silently loses a trade that
  // Deriv already executed. On final failure the error is shown to the user.
  const persistTrade = async (payload: any, label: string): Promise<boolean> => {
    const attempts = 3;
    for (let i = 1; i <= attempts; i++) {
      try {
        await saveTradeMutation.mutateAsync(payload);
        tradesQuery.refetch();
        setSaveError(null);
        return true;
      } catch (e: any) {
        const msg = `${e?.message || String(e || "")}`;
        if (i < attempts) {
          await new Promise((r) => setTimeout(r, 450 * i));
          continue;
        }
        setSaveError(`${label} still not saved: ${msg.slice(0, 140)}`);
      }
    }
    return false;
  };

  const openPositions = (tradesQuery.data || []).filter((t: any) => t.result === "pending");

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (tokenQuery.data?.token) derivWS.setApiToken(tokenQuery.data.token).catch(console.error);
  }, [tokenQuery.data]);

  useEffect(() => {
    const unsub = derivWS.onSymbols((syms) => {
      if (syms.length > 0) setLiveSymbols(syms);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : b.accounts || [b];
      const acct = list[0] || b;
      setBalance(parseFloat(acct?.balance != null ? acct.balance : acct?.display_balance || "0") || 0);
      setBalanceInfo({ currency: acct?.currency || "USD", accountType: (acct?.account_type || b.account_type || "").toString().toLowerCase() });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = derivWS.onTokenError((msg) => setTokenError(msg));
    return unsub;
  }, []);

  const subRef = useRef<number | null>(null);
  useEffect(() => {
    if (subRef.current != null) {
      derivWS.unsubscribe(subRef.current);
      subRef.current = null;
    }
    setTicks([]);
    derivWS.markBackground(symbol);
    subRef.current = derivWS.subscribe(symbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== symbol) return;
        const price = Number(tick.price);
        const decimals = derivWS.decimalPlacesFor(symbol);
        const lastDigit = lastDigitOf(price, decimals);
        setTicks((prev) => [{ symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 320));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => {
      derivWS.removeListener(listener);
      if (subRef.current != null) derivWS.unsubscribe(subRef.current);
    };
  }, [symbol]);

  const decimalPlaces = derivWS.decimalPlacesFor(symbol);
  const windowTicks = ticks.slice(0, TIMEFRAMES[timeframe].points);
  // Merge server tick history with live ticks (deduped by epoch, newest first)
  // so the Price History sheet is populated even before the WS reconnects.
  const historyTicks = useMemo(() => {
    const hist = (historyQuery.data?.ticks || []).slice().reverse();
    if (ticks.length === 0) return hist.slice(0, 60);
    const seen = new Set<number>();
    return [...ticks, ...hist].filter((t: any) => {
      const k = t.epoch;
      if (k == null || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 60);
  }, [ticks, historyQuery.data]);
  const last = windowTicks[0];
  const price = last?.price;
  const open = windowTicks[windowTicks.length - 1]?.price;
  const high = windowTicks.length ? Math.max(...windowTicks.map((t: any) => Number(t.price))) : undefined;
  const low = windowTicks.length ? Math.min(...windowTicks.map((t: any) => Number(t.price))) : undefined;
  const prev = windowTicks[1]?.price ?? price;
  const up = prev !== undefined && price !== undefined ? price >= prev : null;

  const health = useMemo(() => {
    if (windowTicks.length < 10) return null;
    let ups = 0,
      downs = 0;
    for (let i = 1; i < windowTicks.length; i++) {
      if (windowTicks[i].price > windowTicks[i - 1].price) ups++;
      else if (windowTicks[i].price < windowTicks[i - 1].price) downs++;
    }
    const total = ups + downs || 1;
    const bias = ((ups - downs) / total) * 100;
    const counts: Record<number, number> = {};
    for (const t of windowTicks) if (typeof t.lastDigit === "number") counts[t.lastDigit] = (counts[t.lastDigit] || 0) + 1;
    const digits = Object.entries(counts);
    const hottest = digits.length ? digits.sort((a, b) => b[1] - a[1])[0] : null;
    const score = Math.max(5, Math.min(95, Math.round(50 + bias * 0.5)));
    return {
      score,
      dir: bias > 8 ? "Bullish" : bias < -8 ? "Bearish" : "Neutral",
      bias,
      hottest: hottest ? hottest[0] : null,
      hotPct: hottest && windowTicks.length ? Math.round((Number(hottest[1]) / windowTicks.length) * 100) : 0,
    };
  }, [windowTicks]);

  // Shared execution core (same logic as the desktop Dashboard purchase flow):
  // type mapping, REAL confirm, daily-loss guard, Deriv buy, settlement subscribe.
  const { busy: tradeBusy, placeTrade } = useTradeExecution(
    { symbol, contract, stake, duration, durationUnit, stopLoss, takeProfit },
    {
      accountType,
      onRequireToken: () => setShowTokenModal(true),
      dailyLossLimit: (() => {
        const limit = (memoryQuery.data?.memory as any)?.dailyLossLimit || 0;
        if (limit <= 0) return undefined;
        const today = new Date().toDateString();
        const todayPnl = (tradesQuery.data || []).filter((t: any) => new Date(t.entryTime).toDateString() === today).reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
        return { limit, todayPnl };
      })(),
      onError: (msg) => toast(msg || "Trade failed", "error"),
      onFill: async (fill) => {
        if (typeof fill.balanceAfter === "number") setBalance(fill.balanceAfter);
        persistTrade(
          {
            result: "pending" as any,
            stake: String(fill.stake),
            entryPrice: fill.entryPrice,
            entryTime: fill.entryTime,
            symbol: fill.symbol,
            contractType: fill.contractType,
            contractId: fill.contractId,
          } as any,
          `Save trade #${fill.contractId}`,
        );
      },
      onSettle: (fill, profit) => {
        persistTrade(
          {
            result: (profit >= 0 ? "win" : "loss") as any,
            stake: String(fill.stake),
            entryPrice: fill.entryPrice,
            profitLoss: profit.toFixed(2),
            entryTime: fill.entryTime,
            exitTime: new Date(),
            symbol: fill.symbol,
            contractType: fill.contractType,
            contractId: fill.contractId,
          } as any,
          `Settle #${fill.contractId}`,
        );
      },
      onOpenPositions: () => setShowPositions(true),
    },
  );

  const { payoutLabel, payoutError } = usePayoutQuote(symbol, contract, stake, duration, durationUnit, derivWS.isAuthorized());
  const tradeWarnings = validateTrade(contract, duration, durationUnit, symbol);
  const hasBlockingWarning = tradeWarnings.some((w) => w.field === "barrier" || w.field === "digit");

  const tradeHealth = healthQuery.data;
  const healthPnl = tradeHealth?.overall.totalPnl ?? 0;
  const healthSettled = tradeHealth?.settled ?? 0;
  const healthWinRate = healthSettled ? Math.round(((tradeHealth?.wins ?? 0) / healthSettled) * 100) : 0;

  const selectedDisplay = symbols.find((s) => s.symbol === symbol)?.displayName || symbol;
  const isRiseFall = contract.category === "rise_fall" || contract.category === "higher_lower";
  const accountBadge = accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : !derivWS.isAuthorized() ? "NO TOKEN" : "LIVE";

  const buyLabel = (() => {
    switch (contract.category) {
      case "rise_fall": return "Buy";
      case "over_under": return "Buy";
      case "even_odd": return "Buy";
      case "digits": return "Buy";
      case "accumulator": return "Buy";
      default: return "Buy";
    }
  })();

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text-primary)] lg:hidden pb-[calc(56px+env(safe-area-inset-bottom,0px))]">
      {/* Tilt warning — compact, above everything tradeable. */}
      {tiltQuery.data?.severity === "warning" && (
        <button
          onClick={() => setShowTiltDetail((v) => !v)}
          className="w-full text-left px-4 py-2 bg-[var(--red)]/15 border-b border-[var(--red)]/40 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0" />
          <span className="text-[11px] font-bold text-[var(--red)]">Tilt pattern detected — tap for details</span>
        </button>
      )}
      {showTiltDetail && tiltQuery.data?.severity === "warning" && (
        <div className="px-4 py-3 bg-[var(--red)]/10 border-b border-[var(--red)]/30 space-y-1">
          {tiltQuery.data.messages.map((m: string, i: number) => (
            <p key={i} className="text-[11px] text-[var(--text-secondary)]">{m}</p>
          ))}
          <p className="text-[10px] text-[var(--text-disabled)]">Advisory only — nothing is blocked (last {tiltQuery.data.evidence.tradesAnalyzed} settled trades).</p>
        </div>
      )}
      {/* Header: symbol · live price · LIVE */}
      <div className="sticky top-0 z-30 bg-[var(--bg)] border-b border-[var(--border)] px-4 pt-3 pb-2 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setShowSymbolPicker((v) => !v)} className="flex items-center gap-2 min-w-0 cursor-pointer">
            <span className="font-bold text-lg text-[var(--text-primary)] truncate">{selectedDisplay}</span>
            <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform shrink-0 ${showSymbolPicker ? "rotate-180" : ""}`} />
          </button>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div
                className={`text-xl font-bold font-mono tabular-nums leading-none ${up === null ? "text-[var(--text-primary)]" : up ? "text-[var(--green)]" : "text-[var(--red)]"}`}
              >
                {price !== undefined ? Number(price).toFixed(decimalPlaces) : "—"}
                {up !== null && <span className="text-sm ml-0.5">{up ? "▲" : "▼"}</span>}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center justify-end gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${derivWS.isAuthorized() ? "bg-[var(--green)] animate-live-pulse" : "bg-[var(--text-disabled)]"}`} />
                {derivWS.isAuthorized() ? "LIVE" : "OFFLINE"}
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md aurora-glass text-[var(--green)]">
              {accountBadge}
            </span>
            {heatHot && (
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--amber)]/15 text-[var(--amber)] border border-[var(--amber)]/40"
                title={`Portfolio heat ${heatPct}% of ${capPct}% cap`}
              >
                HEAT {heatPct}%
              </span>
            )}
            <button
              onClick={() => setShowPriceHistory((v) => !v)}
              className="p-2 rounded-md aurora-glass text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
              title="Price History"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Price hierarchy: Current / Open / High / Low */}
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {(
            [
              ["Current", price],
              ["Open", open],
              ["High", high],
              ["Low", low],
            ] as [string, number | undefined][]
          ).map(([label, v]) => (
            <div key={label} className="text-center rounded-md bg-[var(--surface-dim)] border border-[var(--border)] py-1">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</div>
              <div className="text-xs font-mono tabular-nums font-bold text-[var(--text-primary)] truncate min-w-0">{v !== undefined ? Number(v).toFixed(Math.min(decimalPlaces, 3)) : "—"}</div>
            </div>
          ))}
        </div>
        {/* Compact stats: P&L / WR / N — mirrors desktop header strip */}
        {healthSettled > 0 && (
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
            <span className="text-[var(--text-muted)]">P&L <span className={`font-mono font-bold ${healthPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{healthPnl >= 0 ? "+" : ""}${healthPnl.toFixed(2)}</span></span>
            <span className="text-[var(--text-muted)]">WR <span className="font-mono font-bold text-white">{healthWinRate}%</span></span>
            <span className="text-[var(--text-muted)]">N <span className="font-mono font-bold text-white">{healthSettled}</span></span>
          </div>
        )}
        {/* Timeframes */}
        <div className="flex gap-1.5 mt-2">
          {TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.label}
              onClick={() => setTimeframe(i)}
              className={`flex-1 py-3 rounded-md text-[11px] font-bold transition-colors cursor-pointer min-h-[44px] ${timeframe === i ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "bg-white/5 text-[var(--text-muted)]"}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {showSymbolPicker && (
        <div className="fixed inset-0 z-[100] bg-[var(--bg)] flex flex-col animate-modal-backdrop" onClick={() => setShowSymbolPicker(false)}>
          <div
            className="w-full flex-1 flex flex-col bg-[var(--bg)] overflow-y-auto animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--bg)] z-10">
              <h3 className="text-base font-bold text-[var(--text-primary)]">Select Market</h3>
              <button onClick={() => setShowSymbolPicker(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Search symbols..."
                  className="input w-full text-sm pl-9"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {(
                  [
                    ["all", "All"],
                    ["vol", "Volatility"],
                    ["1s", "1s Indices"],
                    ["boom", "Boom & Crash"],
                  ] as [typeof marketFilter, string][]
                ).map(([key, label]) => (
                  <FilterPill key={key} active={marketFilter === key} onClick={() => setMarketFilter(key)} label={label} />
                ))}
              </div>
              {(() => {
                const q = symbolSearch.toLowerCase().trim();
                const matches = (s: DerivSymbol) =>
                  !q || s.symbol.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q);
                const is1s = (s: DerivSymbol) => /^1HZ/i.test(s.symbol) || /\(1s\)/i.test(s.displayName);
                const isVol = (s: DerivSymbol) => /volatility/i.test(s.displayName) && !is1s(s);
                const isBoom = (s: DerivSymbol) => /boom|crash/i.test(s.market) || /boom|crash/i.test(s.displayName);
                const visible = (s: DerivSymbol) =>
                  marketFilter === "all" ||
                  (marketFilter === "vol" && isVol(s)) ||
                  (marketFilter === "1s" && is1s(s)) ||
                  (marketFilter === "boom" && isBoom(s));
                const list = symbols.filter((s) => matches(s) && visible(s));
                if (list.length === 0) {
                  return <p className="text-sm text-[var(--text-muted)] text-center py-8">No symbols match "{symbolSearch}"</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    {list.map((s) => (
                      <button
                        key={s.symbol}
                        onClick={() => {
                          setSymbol(s.symbol);
                          setShowSymbolPicker(false);
                          setSymbolSearch("");
                        }}
                        className={`text-left px-2.5 py-3 rounded-lg cursor-pointer min-h-[44px] ${symbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-transparent" : "bg-white/5 text-[var(--text-secondary)] border border-transparent"}`}
                      >
                        <span className="block font-semibold text-xs truncate" title={s.displayName}>{s.displayName}</span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">{s.symbol}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-0 pt-1 pb-0">
        <TickChart symbol={symbol} maxDataPoints={TIMEFRAMES[timeframe].points} decimalPlaces={decimalPlaces} compact connected={derivStatus === "connected"} />
      </div>

      {/* Balance — near trade controls */}
      <div className="mx-4 mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl aurora-glass border border-[var(--border)] shadow-md">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-[var(--green)]" /> Balance
        </span>
        <span className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)]">
          {formatMoney(balance, balanceInfo?.currency || "USD")} <span className="text-[10px] text-[var(--text-muted)]">{balanceInfo?.currency || "USD"}</span>
        </span>
      </div>

      {/* Execution */}
      <div className="px-4 mt-2">
        <div className="rounded-xl aurora-glass p-3 space-y-3">
          <ContractTypeSelector selection={contract} onChange={setContract} symbol={symbol} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStake(Math.max(0.35, Math.round((stake - 0.5) * 100) / 100))}
              className="w-12 h-12 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-xl font-bold cursor-pointer"
            >
              −
            </button>
            <div className="flex-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Stake ($)</div>
              <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">{formatNumber(stake)}</div>
              <div className="text-[10px] text-[var(--green)] font-mono">{payoutLabel}</div>
              {payoutError && (
                <div className="text-[9px] text-[var(--red)] font-mono mt-0.5 truncate" title={payoutError}>{payoutError}</div>
              )}
            </div>
            <button
              onClick={() => setStake(Math.round((stake + 0.5) * 100) / 100)}
              className="w-12 h-12 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-xl font-bold cursor-pointer"
            >
              +
            </button>
          </div>
          <div className="flex gap-1.5">
            {[1, 5, 10].map((p) => (
              <button
                key={p}
                onClick={() => setStake(p)}
                className={`flex-1 py-3 rounded-md text-caption font-bold cursor-pointer min-h-[44px] ${stake === p ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "bg-[var(--surface-secondary)] text-[var(--text-muted)]"}`}
              >
                ${p}
              </button>
            ))}
          </div>
          {contract.category !== "accumulator" && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">Duration</div>
              <DurationSelector
                value={duration}
                unit={durationUnit}
                onChange={(n, u) => { setDuration(n); setDurationUnit(u); }}
                symbol={symbol}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] font-bold text-[var(--red)] uppercase">Stop Loss ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={stopLoss || ""}
                onChange={(e) => setStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white/5 border border-[var(--red)]/30 rounded px-2.5 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="text-[9px] font-bold text-[var(--green)] uppercase">Take Profit ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={takeProfit || ""}
                onChange={(e) => setTakeProfit(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white/5 border border-[var(--green)]/30 rounded px-2.5 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--green)] focus:outline-none"
                placeholder="Optional"
              />
            </label>
          </div>
          {tradeWarnings.length > 0 && (
            <div className="space-y-1">
              {tradeWarnings.map((w, i) => (
                <div key={i} className="px-2 py-1 rounded bg-[var(--amber)]/10 border border-[var(--amber)]/30 text-[9px] font-bold text-[var(--amber)]">
                  {w.message}
                </div>
              ))}
            </div>
          )}
          {isRiseFall ? (
            <button
              onClick={() => placeTrade(contract.direction === "fall" ? "fall" : "rise")}
              disabled={tradeBusy || hasBlockingWarning}
              className={`w-full h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all disabled:opacity-60 ${
                contract.direction === "fall" ? "bg-[var(--red)]" : "bg-[var(--green)]"
              }`}
            >
              {tradeBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : contract.direction === "fall" ? (
                <TrendingDown className="w-4 h-4" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
              {contract.category === "higher_lower"
                ? (contract.direction === "fall" ? "Buy Lower" : "Buy Higher")
                : buyLabel}
            </button>
          ) : (
            <button
              onClick={() => placeTrade()}
              disabled={tradeBusy || hasBlockingWarning}
              className="w-full h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(180deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 85%, black) 100%)" }}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {buyLabel}
            </button>
          )}
        </div>
      </div>

      {/* AI Market Health strip */}
      <div className="px-4 mt-3">
        <div className="rounded-xl aurora-glass px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">AI Market Health</span>
            </div>
            {health && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-[var(--accent)]">{health.score}</span>
                <span
                  className={`font-bold ${health.dir === "Bullish" ? "text-[var(--green)]" : health.dir === "Bearish" ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}
                >
                  {health.dir}
                </span>
              </div>
            )}
          </div>
          {health && (
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
              <span>
                Momentum{" "}
                <b className={health.bias > 5 ? "text-[var(--green)]" : health.bias < -5 ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}>
                  {health.bias > 5 ? "▲" : health.bias < -5 ? "▼" : "●"} {Math.abs(health.bias).toFixed(0)}
                </b>
              </span>
              {health.hottest != null && (
                <span>
                  Hot digit{" "}
                  <b className="text-[var(--accent)]">
                    #{health.hottest} ({health.hotPct}%)
                  </b>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Positions bar */}
      {saveError && (
        <div className="mx-4 mt-3 rounded-xl bg-[var(--red-soft)] border border-[var(--red)]/30 px-3 py-2">
          <p className="text-[11px] font-bold text-[var(--red)]">Trade record not saved — refresh to sync</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 break-words">{saveError}</p>
        </div>
      )}

      {/* Positions bar */}
      <button
        onClick={() => setShowPositions(true)}
        className="mx-4 mt-3 w-[calc(100%-32px)] flex items-center justify-between rounded-xl aurora-glass px-3 py-3 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Positions {openPositions.length > 0 && <span className="text-[var(--accent)]">({openPositions.length})</span>}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{openPositions.length === 0 ? "No open positions" : "Tap to view"} ›</span>
      </button>

      {/* Positions bottom sheet */}
      {showPositions && (
        <div className="fixed inset-0 z-[95] bg-black/60 flex items-end animate-modal-backdrop" onClick={() => setShowPositions(false)}>
          <div
            className="w-full aurora-glass border-t border-[var(--border)] rounded-t-2xl max-h-[70vh] overflow-y-auto pb-6 animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 aurora-glass px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Open Positions</h3>
              <button onClick={() => setShowPositions(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 divide-y divide-[var(--border)]">
              {openPositions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-10">No open positions. Place a trade to see it live here.</p>
              ) : (
                openPositions.map((t: any) => (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {getSymbolDisplayName(t.symbol)} <span className="text-[var(--text-muted)] font-medium">{t.contractType}</span>
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          #{t.contractId} · {new Date(t.entryTime).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--accent)] font-mono tabular-nums">{formatMoney(t.stake)}</p>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">entry {formatNumber(t.entryPrice, decimalPlaces)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />

      {/* Price History bottom sheet */}
      {showPriceHistory && (
        <div className="fixed inset-0 z-[95] bg-black/60 flex items-end animate-modal-backdrop" onClick={() => setShowPriceHistory(false)}>
          <div
            className="w-full aurora-glass border-t border-[var(--border)] rounded-t-2xl max-h-[70vh] overflow-y-auto pb-6 animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 aurora-glass px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Price History · {selectedDisplay}</h3>
              <button onClick={() => setShowPriceHistory(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 space-y-0.5">
              {historyTicks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-10">No price data yet. Waiting for live ticks…</p>
              ) : (
                historyTicks.slice(0, 60).map((t: any, i: number) => {
                  const prevPrice = i < historyTicks.length - 1 ? historyTicks[i + 1]?.price : t.price;
                  const dir = t.price > prevPrice ? "up" : t.price < prevPrice ? "down" : null;
                  return (
                    <div key={`${t.epoch}-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded text-[11px]">
                      <span className="text-[var(--text-muted)] font-mono text-[10px]">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</span>
                      <span className="flex items-center gap-1">
                        {dir === "up" && <span className="text-[var(--green)]">▲</span>}
                        {dir === "down" && <span className="text-[var(--red)]">▼</span>}
                        <span className="font-mono tabular-nums text-[var(--text-primary)]">{Number(t.price).toFixed(decimalPlaces)}</span>
                      </span>
                      <span className="font-mono text-[10px] font-bold text-[var(--accent)]">{typeof t.lastDigit === "number" ? t.lastDigit : "·"}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

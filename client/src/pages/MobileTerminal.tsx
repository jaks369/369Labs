import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Loader2, ChevronDown, TrendingUp, TrendingDown, Zap, Wallet, ShieldCheck, X, Activity,
} from "lucide-react";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import TickChart from "@/components/TickChart";
import { VOLATILITY_SYMBOLS } from "@/lib/symbols";
import { getDecimalPlaces } from "@shared/lastDigit";

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
  const [symbol, setSymbol] = useState<string>(ALL_FALLBACK[0]?.symbol || "R_100");
  const [symbols] = useState<DerivSymbol[]>(ALL_FALLBACK);
  const [timeframe, setTimeframe] = useState(1);
  const [ticks, setTicks] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<{ currency: string; accountType: string } | null>(null);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });
  const [stake, setStake] = useState<number>(1);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showPositions, setShowPositions] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const tradesQuery = trpc.trades.list.useQuery({ limit: 50 });
  const saveTradeMutation = trpc.trades.save.useMutation();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const memoryQuery = trpc.memory.get.useQuery();
  const { accountType } = useDerivStatus();

  const openPositions = (tradesQuery.data || []).filter((t: any) => t.result === "pending");

  useEffect(() => { if (!isAuthenticated) navigate("/"); }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (tokenQuery.data?.token) derivWS.setApiToken(tokenQuery.data.token).catch(console.error);
  }, [tokenQuery.data]);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : (b.accounts || [b]);
      const acct = list[0] || b;
      setBalance(parseFloat(acct?.balance != null ? acct.balance : (acct?.display_balance || "0")) || 0);
      setBalanceInfo({ currency: acct?.currency || "USD", accountType: (acct?.account_type || b.account_type || "").toString().toLowerCase() });
    });
    return () => {};
  }, []);

  useEffect(() => {
    const unsub = derivWS.onTokenError((msg) => setTokenError(msg));
    return () => {};
  }, []);

  const subRef = useRef<number | null>(null);
  useEffect(() => {
    if (subRef.current != null) { derivWS.unsubscribe(subRef.current); subRef.current = null; }
    setTicks([]);
    subRef.current = derivWS.subscribe(symbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== symbol) return;
        const price = Number(tick.price);
        const decimals = derivWS.decimalPlacesFor(symbol);
        const lastDigit = parseInt(price.toFixed(decimals).slice(-1), 10) || 0;
        setTicks((prev) => [{ symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 320));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); if (subRef.current != null) derivWS.unsubscribe(subRef.current); };
  }, [symbol]);

  const decimalPlaces = derivWS.decimalPlacesFor(symbol);
  const windowTicks = ticks.slice(0, TIMEFRAMES[timeframe].points);
  const last = windowTicks[0];
  const price = last?.price;
  const open = windowTicks[windowTicks.length - 1]?.price;
  const high = windowTicks.length ? Math.max(...windowTicks.map((t: any) => Number(t.price))) : undefined;
  const low = windowTicks.length ? Math.min(...windowTicks.map((t: any) => Number(t.price))) : undefined;
  const prev = windowTicks[1]?.price ?? price;
  const up = prev !== undefined && price !== undefined ? price >= prev : null;

  const health = useMemo(() => {
    if (windowTicks.length < 10) return null;
    let ups = 0, downs = 0;
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
      hotPct: hottest && digits.length ? Math.round((Number(hottest[1]) / digits.length) * 100) : 0,
    };
  }, [windowTicks]);

  const handleQuickTrade = async (dir: "rise" | "fall") => {
    if (!derivWS.isAuthorized()) { setShowTokenModal(true); return; }
    const dailyLossLimit = (memoryQuery.data?.memory as any)?.dailyLossLimit;
    if (dailyLossLimit > 0) {
      const today = new Date().toDateString();
      const todayTrades = (tradesQuery.data || []).filter((t: any) => new Date(t.entryTime).toDateString() === today);
      const todayPnl = todayTrades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
      if (todayPnl <= -dailyLossLimit) return;
    }
    if (accountType === "real") {
      const ok = window.confirm("You are connected to a REAL account. This trade uses real funds. Continue?");
      if (!ok) return;
    }
    const map: Record<string, string> = {
      "rise_fall": dir === "fall" ? "PUT" : "CALL",
      "over_under": contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
      "even_odd": contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
      "digits": "DIGITMATCH",
      "accumulator": "ACCU",
    };
    const contractType = map[contract.category];
    if (!contractType) return;
    setTradeBusy(true);
    try {
      const purchase = await derivWS.purchaseContract({
        symbol, contractType: contractType as any, amount: stake,
        duration: 5, durationUnit: "t",
        ...(contract.category === "over_under" && contract.barrier !== undefined ? { barrier: contract.barrier } : {}),
        ...(contract.category === "digits" && contract.digit !== undefined ? { barrier: contract.digit } : {}),
      });
      if (typeof purchase.balanceAfter === "number") setBalance(purchase.balanceAfter);
      const entryTime = new Date();
      const entryPrice = String(purchase.entrySpot ?? purchase.buyPrice ?? stake);
      saveTradeMutation.mutate({
        result: "pending" as any, stake: String(stake), entryPrice, entryTime,
        symbol, contractType, contractId: String(purchase.contractId),
      } as any, { onSuccess: () => tradesQuery.refetch() });
      derivWS.registerContractMeta(purchase.contractId, { stake: String(stake), entryPrice, entryTime: entryTime.toISOString(), symbol, contractType });
      derivWS.subscribeToContract(purchase.contractId, (c: any) => {
        if (c.status !== "open") {
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          saveTradeMutation.mutate({
            result: (profit >= 0 ? "win" : "loss") as any, stake: String(stake), entryPrice,
            profitLoss: profit.toFixed(2), entryTime, exitTime: new Date(),
            symbol, contractType, contractId: String(purchase.contractId),
          } as any, { onSuccess: () => tradesQuery.refetch() });
          derivWS.clearContractMeta(purchase.contractId);
        }
      });
      setShowPositions(true);
    } catch (e: any) {
      // non-fatal: surfaced via trade activity
    } finally { setTradeBusy(false); }
  };

  const selectedDisplay = symbols.find((s) => s.symbol === symbol)?.displayName || symbol;
  const isRiseFall = contract.category === "rise_fall";
  const accountBadge = accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : !derivWS.isAuthorized() ? "NO TOKEN" : "LIVE";

  return (
    <div className="min-h-screen bg-[var(--card)] pb-20 lg:hidden">
      {/* Header: symbol · live price · LIVE */}
      <div className="sticky top-0 z-30 bg-[var(--card)]/95 backdrop-blur border-b border-[var(--border)] px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setShowSymbolPicker((v) => !v)} className="flex items-center gap-2 min-w-0 cursor-pointer">
            <span className="font-mono font-bold text-lg text-white truncate">{symbol}</span>
            <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform shrink-0 ${showSymbolPicker ? "rotate-180" : ""}`} />
          </button>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className={`text-xl font-bold font-mono tabular-nums leading-none ${up === null ? "text-white" : up ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                {price !== undefined ? Number(price).toFixed(decimalPlaces) : "—"}
                {up !== null && <span className="text-sm ml-0.5">{up ? "▲" : "▼"}</span>}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center justify-end gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${derivWS.isAuthorized() ? "bg-[var(--green)] animate-live-pulse" : "bg-[var(--text-disabled)]"}`} />
                {derivWS.isAuthorized() ? "LIVE" : "OFFLINE"}
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 border border-[var(--border)] text-[var(--text-secondary)]">{accountBadge}</span>
          </div>
        </div>
        {/* Price hierarchy: Current / Open / High / Low */}
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {([["Current", price], ["Open", open], ["High", high], ["Low", low]] as [string, number | undefined][]).map(([label, v]) => (
            <div key={label} className="text-center rounded-md bg-black/20 border border-[var(--border)] py-1">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</div>
              <div className="text-xs font-mono tabular-nums font-bold text-white">{v !== undefined ? Number(v).toFixed(decimalPlaces) : "—"}</div>
            </div>
          ))}
        </div>
        {/* Timeframes */}
        <div className="flex gap-1.5 mt-2">
          {TIMEFRAMES.map((tf, i) => (
            <button key={tf.label} onClick={() => setTimeframe(i)} className={`flex-1 py-3 rounded-md text-[11px] font-bold transition-colors cursor-pointer min-h-[44px] ${timeframe === i ? "bg-[var(--accent)] text-black" : "bg-white/5 text-[var(--text-muted)]"}`}>{tf.label}</button>
          ))}
        </div>
      </div>

      {showSymbolPicker && (
        <div className="px-4 py-2 bg-black/20 border-b border-[var(--border)] max-h-56 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1.5">
            {symbols.map((s) => (
              <button key={s.symbol} onClick={() => { setSymbol(s.symbol); setShowSymbolPicker(false); }} className={`text-left px-2.5 py-3 rounded-lg text-xs font-bold cursor-pointer min-h-[44px] ${symbol === s.symbol ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "bg-white/5 text-[var(--text-secondary)] border border-transparent"}`}>
                <span className="block font-mono">{s.symbol}</span>
                <span className="text-[9px] text-[var(--text-muted)] truncate">{s.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-0 py-2">
        <TickChart symbol={symbol} maxDataPoints={TIMEFRAMES[timeframe].points} decimalPlaces={decimalPlaces} />
      </div>

      {/* AI Market Health strip */}
      <div className="px-4 mt-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">AI Market Health</span>
            </div>
            {health && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-[var(--accent)]">{health.score}</span>
                <span className={`font-bold ${health.dir === "Bullish" ? "text-[var(--green)]" : health.dir === "Bearish" ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}>{health.dir}</span>
              </div>
            )}
          </div>
          {health && (
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
              <span>Momentum <b className={health.bias > 5 ? "text-[var(--green)]" : health.bias < -5 ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}>{health.bias > 5 ? "▲" : health.bias < -5 ? "▼" : "●"} {Math.abs(health.bias).toFixed(0)}</b></span>
              {health.hottest != null && <span>Hot digit <b className="text-[var(--accent)]">#{health.hottest} ({health.hotPct}%)</b></span>}
              <span className="ml-auto">{selectedDisplay}</span>
            </div>
          )}
        </div>
      </div>

      {/* Execution */}
      <div className="px-4 mt-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-3">
          <ContractTypeSelector selection={contract} onChange={setContract} />
          <div className="flex items-center gap-2">
            <button onClick={() => setStake(Math.max(0.35, Math.round((stake - 0.5) * 100) / 100))} className="w-12 h-12 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-xl font-bold cursor-pointer">−</button>
            <div className="flex-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Stake ($)</div>
              <div className="text-lg font-bold font-mono tabular-nums text-white">{stake.toFixed(2)}</div>
              <div className="text-[10px] text-[var(--green)] font-mono">≈ ${(stake * 1.95).toFixed(2)} est.</div>
            </div>
            <button onClick={() => setStake(Math.round((stake + 0.5) * 100) / 100)} className="w-12 h-12 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-xl font-bold cursor-pointer">+</button>
          </div>
          <div className="flex gap-1.5">
            {[1, 5, 10].map((p) => (
              <button key={p} onClick={() => setStake(p)} className={`flex-1 py-3 rounded-md text-caption font-bold cursor-pointer min-h-[44px] ${stake === p ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-secondary)] text-[var(--text-muted)]"}`}>${p}</button>
            ))}
          </div>
          {isRiseFall ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleQuickTrade("fall")} disabled={tradeBusy} className="h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(180deg, var(--red) 0%, color-mix(in srgb, var(--red) 85%, black) 100%)" }}>
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />} SELL
              </button>
              <button onClick={() => handleQuickTrade("rise")} disabled={tradeBusy} className="h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(180deg, var(--green) 0%, color-mix(in srgb, var(--green) 85%, black) 100%)" }}>
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} BUY
              </button>
            </div>
          ) : (
            <button onClick={() => handleQuickTrade("rise")} disabled={tradeBusy} className="w-full h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(180deg, var(--green) 0%, color-mix(in srgb, var(--green) 85%, black) 100%)" }}>
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} BUY {contract.category.replace("_", " ").toUpperCase()}
            </button>
          )}
        </div>
      </div>

      {/* Positions bar */}
      <button onClick={() => setShowPositions(true)} className="mx-4 mt-3 w-[calc(100%-32px)] flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 cursor-pointer">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-bold text-white">Positions {openPositions.length > 0 && <span className="text-[var(--accent)]">({openPositions.length})</span>}</span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{openPositions.length === 0 ? "No open positions" : "Tap to view"} ›</span>
      </button>

      {/* Balance footer */}
      <div className="mx-4 mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-black/20 border border-[var(--border)]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-[var(--green)]" /> Balance</span>
        <span className="text-sm font-bold font-mono tabular-nums text-white">${balance.toFixed(2)} <span className="text-[10px] text-[var(--text-muted)]">{balanceInfo?.currency || "USD"}</span></span>
      </div>

      {/* Positions bottom sheet */}
      {showPositions && (
        <div className="fixed inset-0 z-[95] bg-black/60 flex items-end" onClick={() => setShowPositions(false)}>
          <div className="w-full bg-[var(--card)] border-t border-[var(--border)] rounded-t-2xl max-h-[70vh] overflow-y-auto pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[var(--card)] px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Open Positions</h3>
              <button onClick={() => setShowPositions(false)} className="text-[var(--text-muted)] hover:text-white"><X className="w-4 h-4" /></button>
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
                        <p className="text-sm font-bold text-white truncate">{t.symbol} <span className="text-[var(--text-muted)] font-medium">{t.contractType}</span></p>
                        <p className="text-xs text-[var(--text-muted)]">#{t.contractId} · {new Date(t.entryTime).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--accent)] font-mono tabular-nums">${Number(t.stake).toFixed(2)}</p>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">entry {Number(t.entryPrice).toFixed(decimalPlaces)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </div>
  );
}

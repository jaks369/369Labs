import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Star, Plus, X, Loader2, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";
import { getValidSymbols, STANDARD_SYMBOLS, getSymbolDisplayName } from "@/lib/symbols";

const WATCHLIST_KEY = "369labs_watchlist";
const VALID_SYMBOLS = getValidSymbols();

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="w-20 h-6" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const step = w / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={color} opacity="0.08" />
    </svg>
  );
}

export default function Watchlist() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbols, setSymbols] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || JSON.stringify([STANDARD_SYMBOLS[3], STANDARD_SYMBOLS[4]])); }
    catch { return [STANDARD_SYMBOLS[3], STANDARD_SYMBOLS[4]]; }
  });
  const [prices, setPrices] = useState<Record<string, { price: number; change: number; spark: number[] }>>({});
  const [adding, setAdding] = useState(false);
  const [newSym, setNewSym] = useState(STANDARD_SYMBOLS[0]);
  const openPriceRef = useRef<Record<string, number>>({});

  useEffect(() => { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols)); }, [symbols]);

  useEffect(() => {
    const subs = symbols.map((sym) => derivWS.subscribe(sym));
    const listener = {
      onTick: (tick: any) => {
        const sym = tick.symbol;
        const price = Number(tick.price);
        setPrices((prev) => {
          if (openPriceRef.current[sym] === undefined) openPriceRef.current[sym] = price;
          const openPrice = openPriceRef.current[sym];
          const change = openPrice ? ((price - openPrice) / openPrice) * 100 : 0;
          return {
            ...prev,
            [sym]: { price, change, spark: [...(prev[sym]?.spark || []).slice(-24), price] },
          };
        });
      },
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); subs.forEach((id) => derivWS.unsubscribe(id)); };
  }, [symbols]);

  const addSymbol = () => {
    if (!newSym || symbols.includes(newSym)) return;
    setSymbols((prev) => [...prev, newSym]);
    setAdding(false);
  };

  const removeSymbol = (sym: string) => {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setPrices((prev) => { const n = { ...prev }; delete n[sym]; return n; });
    delete openPriceRef.current[sym];
  };

  const openInTerminal = (sym: string) => navigate(`/dashboard?symbol=${encodeURIComponent(sym)}`);

  const available = useMemo(() => VALID_SYMBOLS.filter((s) => !symbols.includes(s)), [symbols]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="h-full p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-[var(--accent)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Watchlist</h1>
              <p className="text-xs text-[var(--text-muted)]">Monitor your favorite symbols in real time</p>
            </div>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold hover:bg-[var(--accent-hover)] cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Symbol
          </button>
        </div>

        {adding && (
          <div className="panel p-3 flex flex-col sm:flex-row gap-2">
            <select value={newSym} onChange={(e) => setNewSym(e.target.value)} className="flex-1 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
              {available.map((s) => (<option key={s} value={s}>{getSymbolDisplayName(s)}</option>))}
            </select>
            <div className="flex gap-2">
              <button onClick={addSymbol} disabled={available.length === 0} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-40">Add</button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        {symbols.length === 0 ? (
          <div className="panel p-12 text-center">
            <Star className="w-8 h-8 text-[var(--text-disabled)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Watchlist is empty. Add a symbol to start monitoring live prices.</p>
            <button onClick={() => setAdding(true)} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold hover:bg-[var(--accent-hover)] cursor-pointer">
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Add your first symbol
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {symbols.map((sym) => {
              const p = prices[sym];
              const up = (p?.change ?? 0) >= 0;
              return (
                <div key={sym} className="panel p-4 flex flex-col gap-3 hover:border-[var(--accent-border)] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate" title={getSymbolDisplayName(sym)}>{getSymbolDisplayName(sym)}</p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)]">{sym}</p>
                    </div>
                    <button
                      onClick={() => removeSymbol(sym)}
                      className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors cursor-pointer shrink-0"
                      title="Remove from watchlist"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    {p ? (
                      <>
                        <div>
                          <p className="font-mono tabular-nums text-lg font-bold text-white leading-none">{Number(p.price).toFixed(derivWS.decimalPlacesFor(sym))}</p>
                          <p className={`mt-1 flex items-center gap-1 text-xs font-bold tabular-nums ${up ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {p.change >= 0.05 ? <TrendingUp className="w-3 h-3" /> : p.change <= -0.05 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {up ? "+" : ""}{Number(p.change).toFixed(2)}%
                          </p>
                        </div>
                        <Sparkline points={p.spark} up={up} />
                      </>
                    ) : (
                      <div className="flex items-center gap-2 py-1">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Connecting…</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => openInTerminal(sym)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent-border)] text-xs font-bold hover:bg-[var(--accent)]/25 transition-colors cursor-pointer"
                  >
                    Open in Terminal <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-[var(--text-muted)]">Prices stream live from Deriv. Add or remove symbols to customize your watchlist.</p>
      </div>
    </div>
  );
}

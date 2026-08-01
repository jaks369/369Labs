import { useEffect, useMemo, useRef, useState } from "react";
import { Star, Plus, X, Loader2 } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";
import { toast } from "@/components/Toast";
import { getValidSymbols, STANDARD_SYMBOLS } from "@/lib/symbols";

const WATCHLIST_KEY = "369labs_watchlist";
const VALID_SYMBOLS = getValidSymbols();

interface WatchlistPanelProps {
  selectedSymbol?: string;
  onSelect?: (symbol: string) => void;
  compact?: boolean;
  header?: boolean;
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="w-16 h-5" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 64;
  const h = 20;
  const step = w / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={color} opacity="0.08" />
    </svg>
  );
}

export default function WatchlistPanel({ selectedSymbol, onSelect, compact, header = true }: WatchlistPanelProps) {
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
          // Initialize open price on first tick of session
          if (openPriceRef.current[sym] === undefined) {
            openPriceRef.current[sym] = price;
          }
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
    toast(`Added ${newSym} to watchlist`, "success");
  };

  const removeSymbol = (sym: string) => {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setPrices((prev) => { const n = { ...prev }; delete n[sym]; return n; });
    delete openPriceRef.current[sym];
  };

  return (
    <div className={compact ? "watchlist-terminal flex flex-col h-full min-h-0" : "panel"}>
      {header && (
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold">Watchlist</h2>
          </div>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 text-[11px] font-bold hover:bg-[var(--accent)]/25 transition-colors cursor-pointer">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      )}

      {adding && (
        <div className="p-2 border-b border-[var(--border)] flex gap-2">
          <select value={newSym} onChange={(e) => setNewSym(e.target.value)} className="flex-1 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
            {VALID_SYMBOLS.filter((s) => !symbols.includes(s)).map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <button onClick={addSymbol} className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-black text-xs font-bold cursor-pointer">Add</button>
          <button onClick={() => setAdding(false)} className="px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-white cursor-pointer">Cancel</button>
        </div>
      )}

      {compact && !header && (
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Watchlist</span>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 text-[10px] font-bold hover:bg-[var(--accent)]/25 transition-colors cursor-pointer">
            <Plus className="w-2.5 h-2.5" /> Add
          </button>
        </div>
      )}

      <div className={compact ? "flex-1 overflow-y-auto scrollbar-none" : "space-y-1 p-2"}>
        {symbols.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">Watchlist is empty.</p>
        ) : (
          symbols.map((sym) => {
            const p = prices[sym];
            const active = selectedSymbol === sym;
            return (
              <div
                key={sym}
                onClick={() => onSelect?.(sym)}
                className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg transition-all duration-150 cursor-pointer ${
                  active ? "bg-[var(--accent-soft)] border border-[var(--accent-border)]" : "hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Star className={`w-3 h-3 shrink-0 ${active ? "text-[var(--accent)] fill-[var(--accent)]" : "text-[var(--text-disabled)]"}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${active ? "text-[var(--accent-hover)]" : "text-[var(--text-primary)]"}`}>{sym}</p>
                    {p && (
                      <p className={`text-[10px] font-mono tabular-nums ${p.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                        {p.change >= 0 ? "+" : ""}{Number(p.change).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p ? (
                    <>
                      <Sparkline points={p.spark} up={p.change >= 0} />
                      <span className="text-xs font-bold font-mono tabular-nums text-[var(--text-primary)]">{Number(p.price).toFixed(derivWS.decimalPlacesFor(sym))}</span>
                    </>
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                    className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] transition-colors cursor-pointer"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

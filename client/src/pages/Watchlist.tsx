import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Star, TrendingUp, TrendingDown, Plus, X, Loader2 } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";
import { toast } from "@/components/Toast";
import { ALL_VOLATILITY_SYMBOLS, STANDARD_SYMBOLS } from "@/lib/symbols";

const WATCHLIST_KEY = "369labs_watchlist";
const VALID_SYMBOLS = ALL_VOLATILITY_SYMBOLS;

export default function Watchlist() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbols, setSymbols] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || JSON.stringify([STANDARD_SYMBOLS[3], STANDARD_SYMBOLS[4]])); } catch { return [STANDARD_SYMBOLS[3], STANDARD_SYMBOLS[4]]; } });
  const [prices, setPrices] = useState<Record<string, { price: number; change: number }>>({});
  const [adding, setAdding] = useState(false);
  const [newSym, setNewSym] = useState(STANDARD_SYMBOLS[0]);

  useEffect(() => { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols)); }, [symbols]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const subs = symbols.map((sym) => derivWS.subscribe(sym));
    const listener = { onTick: (tick: any) => setPrices((prev) => ({ ...prev, [tick.symbol]: { price: Number(tick.price), change: prev[tick.symbol] ? ((Number(tick.price) - prev[tick.symbol].price) / prev[tick.symbol].price) * 100 : 0 } })) };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); subs.forEach((id) => derivWS.unsubscribe(id)); };
  }, [isAuthenticated, symbols]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const addSymbol = () => {
    if (!newSym || symbols.includes(newSym)) return;
    setSymbols((prev) => [...prev, newSym]);
    setAdding(false);
    toast(`Added ${newSym} to watchlist`, "success");
  };

  const removeSymbol = (sym: string) => {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setPrices((prev) => { const n = { ...prev }; delete n[sym]; return n; });
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-[var(--amber)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Watchlist</h1>
              <p className="text-xs text-[var(--text-muted)]">Monitor your favorite symbols in real time</p>
            </div>
          </div>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/30 text-xs font-bold hover:bg-[var(--amber)]/30">
            <Plus className="w-3.5 h-3.5" /> Add Symbol
          </button>
        </div>

        {adding && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex gap-2">
            <select value={newSym} onChange={(e) => setNewSym(e.target.value)} className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white">
              {VALID_SYMBOLS.filter((s) => !symbols.includes(s)).map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <button onClick={addSymbol} className="px-4 py-2 rounded-lg bg-[var(--amber)] text-black text-xs font-bold">Add</button>
            <button onClick={() => setAdding(false)} className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-white">Cancel</button>
          </div>
        )}

        {symbols.length === 0 ? (
          <div className="text-center py-16">
            <Star className="w-10 h-10 text-[var(--border)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)] text-sm">Your watchlist is empty. Add symbols to track live prices.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {symbols.map((sym) => {
              const p = prices[sym];
              return (
                <div key={sym} className="flex items-center justify-between bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--amber)]/30 transition-all">
                  <div className="flex items-center gap-3">
                    <Star className="w-4 h-4 text-[var(--amber)] fill-[var(--amber)]" />
                    <span className="text-sm font-bold text-white">{sym}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {p ? (
                      <>
                        <span className="text-lg font-bold text-white font-mono">{p.price.toFixed(4)}</span>
                        <span className={`flex items-center gap-1 text-xs font-bold ${p.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {p.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {p.change >= 0 ? "+" : ""}{p.change.toFixed(2)}%
                        </span>
                      </>
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                    )}
                    <button onClick={() => removeSymbol(sym)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

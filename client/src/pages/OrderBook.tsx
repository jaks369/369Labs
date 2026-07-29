import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Book, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { getValidSymbols } from "@/lib/symbols";
import { derivWS, Tick } from "@/services/derivWebSocket";

interface Level {
  price: string;
  volume: number;
  count: number;
}

export default function OrderBook() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_100");
  const [levels, setLevels] = useState<{ bids: Level[]; asks: Level[]; maxVol: number; spread: number }>({ bids: [], asks: [], maxVol: 1, spread: 0 });
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const ticksRef = useRef<Tick[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        ticksRef.current.push(tick);
        if (ticksRef.current.length > 500) ticksRef.current = ticksRef.current.slice(-500);
        setCurrentPrice(tick.price);
        const all = ticksRef.current;
        const step = tick.price * 0.001;
        const depth = 10;
        const bids: Level[] = [];
        const asks: Level[] = [];
        let max = 1;
        for (let i = 0; i < depth; i++) {
          const bidPx = Number(tick.price - step * (i + 1)).toFixed(3);
          const askPx = Number(tick.price + step * (i + 1)).toFixed(3);
          const bidCount = all.filter(t => t.price > tick.price - step * (i + 1) - step / 2 && t.price <= tick.price - step * i).length;
          const askCount = all.filter(t => t.price >= tick.price + step * i && t.price < tick.price + step * (i + 1) + step / 2).length;
          const bidVol = Math.max(bidCount * 10, 1);
          const askVol = Math.max(askCount * 10, 1);
          bids.push({ price: bidPx, volume: bidVol, count: bidCount });
          asks.push({ price: askPx, volume: askVol, count: askCount });
          if (bidVol > max) max = bidVol;
          if (askVol > max) max = askVol;
        }
        const sp = tick.ask && tick.bid ? +Number(tick.ask - tick.bid).toFixed(3) : +Number(step * 2).toFixed(3);
        setLevels({ bids, asks, maxVol: max, spread: sp });
      },
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    };
    derivWS.addListener(listener);
    const subId = derivWS.subscribe(symbol);
    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(subId);
      ticksRef.current = [];
    };
  }, [isAuthenticated, symbol]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Book className="w-7 h-7 text-[var(--cyan)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Order Book</h1>
              <p className="text-xs text-[var(--text-muted)]">Theoretical depth estimate from tick distribution{!connected && <span className="text-[var(--amber)]"> (connecting...)</span>}</p>
            </div>
          </div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[#1a1a2e] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--amber)] outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white">
            {getValidSymbols().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {currentPrice && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-center">
            <span className="text-xs text-[var(--text-muted)]">Current Price</span>
            <p className="text-2xl font-bold text-white font-mono">{Number(currentPrice).toFixed(3)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-xs font-bold text-[var(--green)] mb-3 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Bids</h2>
            {levels.bids.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-[var(--text-muted)] text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Waiting for ticks...</div>
            ) : (
              <div className="space-y-0.5">
                {levels.bids.map((b, i) => (
                  <div key={i} className="flex items-center text-xs py-1 px-2 rounded hover:bg-white/5 relative">
                    <div className="absolute right-0 top-0 bottom-0 bg-[var(--green)]/10 rounded" style={{ width: `${(b.volume / levels.maxVol) * 100}%` }} />
                    <span className="w-20 text-[var(--green)] font-mono relative z-10">{b.price}</span>
                    <span className="w-20 text-right text-white relative z-10">{b.volume.toLocaleString()}</span>
                    <span className="w-12 text-right text-[var(--text-muted)] relative z-10">{b.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-xs font-bold text-[var(--red)] mb-3 flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" /> Asks</h2>
            {levels.asks.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-[var(--text-muted)] text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Waiting for ticks...</div>
            ) : (
              <div className="space-y-0.5">
                {levels.asks.map((a, i) => (
                  <div key={i} className="flex items-center text-xs py-1 px-2 rounded hover:bg-white/5 relative">
                    <div className="absolute right-0 top-0 bottom-0 bg-[var(--red)]/10 rounded" style={{ width: `${(a.volume / levels.maxVol) * 100}%` }} />
                    <span className="w-20 text-[var(--red)] font-mono relative z-10">{a.price}</span>
                    <span className="w-20 text-right text-white relative z-10">{a.volume.toLocaleString()}</span>
                    <span className="w-12 text-right text-[var(--text-muted)] relative z-10">{a.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Depth Chart</h2>
            <span className="text-xs text-[var(--text-muted)] font-mono">Spread: {Number(levels.spread).toFixed(3)}</span>
          </div>
          <div className="h-48 flex items-end gap-[2px]">
            {Array.from({ length: 50 }, (_, i) => {
              const cp = currentPrice || 50;
              const bidVol = levels.bids.reduce((s, b) => s + (parseFloat(b.price) > cp - 0.5 + (i / 50) * 1 ? b.volume : 0), 0);
              const askVol = levels.asks.reduce((s, a) => s + (parseFloat(a.price) < cp + 0.5 + (i / 50) * 1 ? a.volume : 0), 0);
              const maxDepth = Math.max(bidVol, askVol, 1);
              return (
                <div key={i} className="flex-1 flex flex-col justify-end gap-px">
                  <div className="bg-[var(--red)]/40 rounded-t" style={{ height: `${(askVol / maxDepth) * 100}%` }} />
                  <div className="bg-[var(--green)]/40 rounded-b" style={{ height: `${(bidVol / maxDepth) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
            <span>{currentPrice ? Number(currentPrice - 0.5).toFixed(3) : "—"}</span>
            <span>{currentPrice ? Number(currentPrice + 0.5).toFixed(3) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Book, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

const mockBids = Array.from({ length: 12 }, (_, i) => ({
  price: (50 + Math.random() * 5).toFixed(4),
  volume: Math.floor(Math.random() * 10000),
  count: Math.floor(Math.random() * 50),
}));
const mockAsks = Array.from({ length: 12 }, (_, i) => ({
  price: (55 + Math.random() * 5).toFixed(4),
  volume: Math.floor(Math.random() * 10000),
  count: Math.floor(Math.random() * 50),
}));
const sortedBids = [...mockBids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
const sortedAsks = [...mockAsks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
const maxVol = Math.max(...[...mockBids, ...mockAsks].map((o) => o.volume));

export default function OrderBook() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_50");

  if (!isAuthenticated) { navigate("/login"); return null; }

  const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ50V", "1HZ100V"];

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Book className="w-7 h-7 text-[var(--cyan)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Order Book</h1>
              <p className="text-xs text-[var(--text-muted)]">Live market depth visualization</p>
            </div>
          </div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white">
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-xs font-bold text-[var(--green)] mb-3 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Bids</h2>
            <div className="space-y-0.5">
              {sortedBids.map((b, i) => (
                <div key={i} className="flex items-center text-xs py-1 px-2 rounded hover:bg-white/5 relative">
                  <div className="absolute right-0 top-0 bottom-0 bg-[var(--green)]/10 rounded" style={{ width: `${(b.volume / maxVol) * 100}%` }} />
                  <span className="w-20 text-[var(--green)] font-mono relative z-10">{b.price}</span>
                  <span className="w-20 text-right text-white relative z-10">{b.volume.toLocaleString()}</span>
                  <span className="w-12 text-right text-[var(--text-muted)] relative z-10">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-xs font-bold text-[var(--red)] mb-3 flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" /> Asks</h2>
            <div className="space-y-0.5">
              {sortedAsks.map((a, i) => (
                <div key={i} className="flex items-center text-xs py-1 px-2 rounded hover:bg-white/5 relative">
                  <div className="absolute right-0 top-0 bottom-0 bg-[var(--red)]/10 rounded" style={{ width: `${(a.volume / maxVol) * 100}%` }} />
                  <span className="w-20 text-[var(--red)] font-mono relative z-10">{a.price}</span>
                  <span className="w-20 text-right text-white relative z-10">{a.volume.toLocaleString()}</span>
                  <span className="w-12 text-right text-[var(--text-muted)] relative z-10">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4">Depth Chart</h2>
          <div className="h-48 flex items-end gap-[2px]">
            {Array.from({ length: 50 }, (_, i) => {
              const bidVol = sortedBids.reduce((s, b) => s + (parseFloat(b.price) > 50 + (i / 50) * 10 ? b.volume : 0), 0);
              const askVol = sortedAsks.reduce((s, a) => s + (parseFloat(a.price) < 55 + (i / 50) * 10 ? a.volume : 0), 0);
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
            <span>50.00</span>
            <span>Spread: 5.00</span>
            <span>60.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

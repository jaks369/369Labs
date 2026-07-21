import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { derivWS } from "@/services/derivWebSocket";
import { useLocation } from "wouter";
import { Play, Pause, RotateCcw, FastForward, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import Sparkline from "@/components/Sparkline";

type Tick = { epoch: number; price: number; lastDigit: number };

export default function Replay() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_100");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4); // ticks per second
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trade, setTrade] = useState<{ type: "rise" | "fall"; entryIdx: number; entryPrice: number } | null>(null);
  const [results, setResults] = useState<{ type: string; pnl: number; at: string }[]>([]);
  const timer = useRef<number | null>(null);

  const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ50V", "1HZ100V"];

  const load = useCallback(async () => {
    setLoading(true); setError(null); setTicks([]); setIdx(0); setPlaying(false);
    try {
      const start = Math.floor(Date.now() / 1000) - 3 * 24 * 3600;
      const end = Math.floor(Date.now() / 1000);
      const raw = await derivWS.fetchTickHistory(symbol, start, end);
      if (!raw || raw.length < 50) throw new Error("Not enough historical ticks for this symbol.");
      setTicks(raw.map((t: any) => ({ epoch: t.epoch, price: Number(t.price), lastDigit: t.lastDigit })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ticks");
    } finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { if (!isAuthenticated) navigate("/login"); }, [isAuthenticated, navigate]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!playing) { if (timer.current) { clearInterval(timer.current); timer.current = null; } return; }
    timer.current = window.setInterval(() => {
      setIdx((i) => {
        if (i >= ticks.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 1000 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, ticks.length]);

  const cur = ticks[idx];
  const windowTicks = ticks.slice(Math.max(0, idx - 80), idx + 1);

  const takeTrade = (type: "rise" | "fall") => {
    if (!cur) return;
    if (trade) { scoreTrade(type); return; }
    setTrade({ type, entryIdx: idx, entryPrice: cur.price });
  };

  const scoreTrade = (closeType: "rise" | "fall") => {
    if (!trade || !cur) return;
    const win = (closeType === "rise" && cur.price > trade.entryPrice) || (closeType === "fall" && cur.price < trade.entryPrice);
    const pnl = win ? 0.95 : -1;
    setResults((r) => [{ type: `${trade.type} â†’ close ${closeType}`, pnl, at: new Date(cur.epoch * 1000).toLocaleTimeString() }, ...r].slice(0, 20));
    setTrade(null);
  };

  return (
    <div className="min-h-screen bg-[#151B23] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <RotateCcw className="w-7 h-7 text-[#F5B80B]" /> Replay Mode
            </h1>
            <p className="text-[#94A3B8] text-sm mt-1">Replay historical ticks. Trade manually and let 369AI score your decision.</p>
          </div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[#151B23] border border-[#252B35] rounded-lg px-3 py-2 text-white text-sm">
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-xl p-4 text-sm text-[#DC3545]">{error}</div>}
        {loading && <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#E8A20E]" /></div>}

        {!loading && ticks.length > 0 && (
          <>
            <div className="bg-[#151B23] border border-[#252B35] rounded-xl p-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs text-[#64748B] uppercase">Replaying</p>
                  <p className="text-3xl font-bold text-white">{cur?.price?.toFixed(4)}</p>
                  <p className="text-xs text-[#64748B]">{cur ? new Date(cur.epoch * 1000).toLocaleString() : ""} Â· tick {idx + 1}/{ticks.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#64748B] uppercase">Last digit</p>
                  <p className="text-4xl font-bold text-[#E8A20E]">{cur?.lastDigit}</p>
                </div>
              </div>

              <Sparkline data={windowTicks.map((t) => ({ value: t.price }))} />

              <div className="flex items-center gap-3 mt-4">
                <button onClick={() => { setIdx(0); setPlaying(false); }} className="p-2 rounded-lg bg-white/5 text-[#94A3B8] hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-lg bg-[#E8A20E] text-white hover:bg-[#E8A20E]">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input type="range" min={0} max={ticks.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="flex-1" />
                <div className="flex items-center gap-1">
                  <FastForward className="w-4 h-4 text-[#64748B]" />
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-[#151B23] border border-[#252B35] rounded px-2 py-1 text-xs text-white">
                    {[1, 2, 4, 8, 16].map((s) => <option key={s} value={s}>{s}x</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#151B23] border border-[#252B35] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Manual Trade</h2>
                <div className="flex gap-3">
                  <button onClick={() => takeTrade("rise")} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${trade?.type === "rise" ? "bg-[#28A745] text-white" : "bg-[#28A745]/10 text-[#28A745] border border-[#28A745]/30"}`}>
                    <TrendingUp className="w-4 h-4" /> {trade ? "Close" : "Buy Rise"}
                  </button>
                  <button onClick={() => takeTrade("fall")} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${trade?.type === "fall" ? "bg-[#DC3545] text-white" : "bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/30"}`}>
                    <TrendingDown className="w-4 h-4" /> {trade ? "Close" : "Buy Fall"}
                  </button>
                </div>
                {trade && <p className="text-xs text-[#94A3B8] mt-3">Open {trade.type} at {trade.entryPrice.toFixed(4)}. Press again to close and score.</p>}
              </div>

              <div className="bg-[#151B23] border border-[#252B35] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Your Decisions</h2>
                {results.length === 0 ? <p className="text-sm text-[#64748B]">No trades yet â€” replay and take a position.</p> : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-xs">
                    {results.map((r, i) => (
                      <div key={i} className="flex justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-[#94A3B8]">{r.type} <span className="text-[#64748B]">@ {r.at}</span></span>
                        <span className={r.pnl >= 0 ? "text-[#28A745]" : "text-[#DC3545]"}>{r.pnl >= 0 ? "+" : ""}{r.pnl.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

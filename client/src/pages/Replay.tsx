import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { derivWS } from "@/services/derivWebSocket";
import { useLocation } from "wouter";
import { Play, Pause, RotateCcw, FastForward, TrendingUp, TrendingDown, Loader2, GanttChartSquare, ArrowRightLeft, Bell } from "lucide-react";
import Sparkline from "@/components/Sparkline";
import { STANDARD_SYMBOLS } from "@/lib/symbols";

type Tick = { epoch: number; price: number; lastDigit: number };
type CondOrder = { id: string; type: "stop" | "limit" | "oco_buy" | "oco_sell"; price: number; triggered: boolean };
type TrailingStop = { active: boolean; distance: number; activationPrice: number | null };

export default function Replay() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_100");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trade, setTrade] = useState<{ type: "rise" | "fall"; entryIdx: number; entryPrice: number } | null>(null);
  const [results, setResults] = useState<{ type: string; pnl: number; at: string }[]>([]);
  const [condOrders, setCondOrders] = useState<CondOrder[]>([]);
  const [trailing, setTrailing] = useState<TrailingStop>({ active: false, distance: 10, activationPrice: null });
  const [showOrders, setShowOrders] = useState(false);
  const timer = useRef<number | null>(null);

  const SYMBOLS = STANDARD_SYMBOLS;

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
    setResults((r) => [{ type: `${trade.type} → close ${closeType}`, pnl, at: new Date(cur.epoch * 1000).toLocaleTimeString() }, ...r].slice(0, 20));
    setTrade(null);
  };

  const addCondOrder = (type: CondOrder["type"]) => {
    if (!cur) return;
    const price = type === "stop" ? cur.price * 0.98 : type === "limit" ? cur.price * 1.02 : cur.price;
    setCondOrders((o) => [...o, { id: Math.random().toString(36).slice(2, 9), type, price: Math.round(price * 10000) / 10000, triggered: false }]);
  };

  useEffect(() => {
    if (!cur) return;
    let updated = false;
    setCondOrders((prev) =>
      prev.map((o) => {
        if (o.triggered) return o;
        if ((o.type === "stop" || o.type === "oco_sell") && cur.price <= o.price) {
          updated = true;
          const pnl = -1;
          setResults((r) => [{ type: `⚠ Stop triggered @ ${o.price}`, pnl, at: new Date(cur.epoch * 1000).toLocaleTimeString() }, ...r].slice(0, 20));
          setTrade(null);
          return { ...o, triggered: true };
        }
        if ((o.type === "limit" || o.type === "oco_buy") && cur.price >= o.price) {
          updated = true;
          const pnl = 0.95;
          setResults((r) => [{ type: `✓ Limit triggered @ ${o.price}`, pnl, at: new Date(cur.epoch * 1000).toLocaleTimeString() }, ...r].slice(0, 20));
          setTrade(null);
          return { ...o, triggered: true };
        }
        return o;
      })
    );
    if (updated) setCondOrders((o) => o.filter((x) => !x.triggered));
  }, [cur]);

  useEffect(() => {
    if (!trailing.active || !cur || !trade) return;
    if (trailing.activationPrice === null) {
      setTrailing((t) => ({ ...t, activationPrice: cur.price }));
      return;
    }
    const direction = trade.type === "rise" ? 1 : -1;
    const bestPrice = direction > 0 ? Math.max(trailing.activationPrice, cur.price) : Math.min(trailing.activationPrice, cur.price);
    const stopPrice = direction > 0 ? bestPrice - trailing.distance / 10000 : bestPrice + trailing.distance / 10000;
    if ((direction > 0 && cur.price <= stopPrice) || (direction < 0 && cur.price >= stopPrice)) {
      const pnl = -0.5;
      setResults((r) => [{ type: `🔄 Trailing stop closed @ ${cur.price.toFixed(4)}`, pnl, at: new Date(cur.epoch * 1000).toLocaleTimeString() }, ...r].slice(0, 20));
      setTrade(null);
      setTrailing({ active: false, distance: 10, activationPrice: null });
    }
  }, [cur, trailing.active, trade]);

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <RotateCcw className="w-7 h-7 text-[var(--amber-hover)]" /> Replay Mode
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Replay historical ticks. Trade manually and let 369AI score your decision.</p>
          </div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm">
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && <div className="bg-[var(--red-soft)] border border-[var(--red)]/30 rounded-xl p-4 text-sm text-[var(--red)]">{error}</div>}
        {loading && <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" /></div>}

        {!loading && ticks.length > 0 && (
          <>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase">Replaying</p>
                  <p className="text-3xl font-bold text-white">{cur?.price?.toFixed(4)}</p>
                  <p className="text-xs text-[var(--text-muted)]">{cur ? new Date(cur.epoch * 1000).toLocaleString() : ""} Â· tick {idx + 1}/{ticks.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] uppercase">Last digit</p>
                  <p className="text-4xl font-bold text-[var(--amber)]">{cur?.lastDigit}</p>
                </div>
              </div>

              <Sparkline data={windowTicks.map((t) => ({ value: t.price }))} />

              <div className="flex items-center gap-3 mt-4">
                <button onClick={() => { setIdx(0); setPlaying(false); }} className="p-2 rounded-lg bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-lg bg-[var(--amber)] text-white hover:bg-[var(--amber)]">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input type="range" min={0} max={ticks.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="flex-1" />
                <div className="flex items-center gap-1">
                  <FastForward className="w-4 h-4 text-[var(--text-muted)]" />
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white">
                    {[1, 2, 4, 8, 16].map((s) => <option key={s} value={s}>{s}x</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Manual Trade</h2>
                <div className="flex gap-3">
                  <button onClick={() => takeTrade("rise")} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${trade?.type === "rise" ? "bg-[var(--green)] text-white" : "bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/30"}`}>
                    <TrendingUp className="w-4 h-4" /> {trade ? "Close" : "Buy Rise"}
                  </button>
                  <button onClick={() => takeTrade("fall")} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${trade?.type === "fall" ? "bg-[var(--red)] text-white" : "bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30"}`}>
                    <TrendingDown className="w-4 h-4" /> {trade ? "Close" : "Buy Fall"}
                  </button>
                </div>
                {trade && <p className="text-xs text-[var(--text-secondary)] mt-3">Open {trade.type} at {trade.entryPrice.toFixed(4)}. Press again to close and score.</p>}

                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <button onClick={() => setShowOrders((s) => !s)} className="flex items-center gap-2 text-xs text-[var(--amber)] hover:text-[var(--amber-hover)]">
                    <GanttChartSquare className="w-3.5 h-3.5" /> {showOrders ? "Hide" : "Show"} Conditional Orders
                  </button>
                  {showOrders && (
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-2">
                        <button onClick={() => addCondOrder("stop")} className="flex-1 py-2 rounded-lg text-xs font-bold bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30 hover:bg-[var(--red)]/20">
                          Add Stop Loss
                        </button>
                        <button onClick={() => addCondOrder("limit")} className="flex-1 py-2 rounded-lg text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/30 hover:bg-[var(--green)]/20">
                          Add Take Profit
                        </button>
                        <button onClick={() => addCondOrder("oco_buy")} className="flex-1 py-2 rounded-lg text-xs font-bold bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/30 hover:bg-[var(--amber)]/30">
                          <ArrowRightLeft className="w-3 h-3 inline mr-1" />OCO
                        </button>
                      </div>
                      {condOrders.length > 0 && (
                        <div className="space-y-1">
                          {condOrders.map((o) => (
                            <div key={o.id} className="flex justify-between text-xs p-2 bg-black/20 rounded-lg">
                              <span className="text-[var(--text-secondary)]">{o.type.toUpperCase()} @ {o.price.toFixed(4)}</span>
                              <span className={o.triggered ? "text-[var(--green)]" : "text-[var(--text-muted)]"}>{o.triggered ? "Triggered" : "Active"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={trailing.active} onChange={(e) => setTrailing((t) => ({ ...t, active: e.target.checked, activationPrice: null }))} className="accent-[var(--cyan)]" />
                    <Bell className="w-3 h-3 text-[var(--cyan)]" /> Trailing Stop
                  </label>
                  {trailing.active && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Distance:</span>
                      <input type="range" min={1} max={100} value={trailing.distance} onChange={(e) => setTrailing((t) => ({ ...t, distance: Number(e.target.value) }))} className="flex-1" />
                      <span className="text-xs text-[var(--cyan)] font-bold">{trailing.distance} pts</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Your Decisions</h2>
                {results.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No trades yet â€” replay and take a position.</p> : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-xs">
                    {results.map((r, i) => (
                      <div key={i} className="flex justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-[var(--text-secondary)]">{r.type} <span className="text-[var(--text-muted)]">@ {r.at}</span></span>
                        <span className={r.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{r.pnl >= 0 ? "+" : ""}{r.pnl.toFixed(2)}</span>
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

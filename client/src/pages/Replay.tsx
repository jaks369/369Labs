import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { derivWS } from "@/services/derivWebSocket";
import { useLocation } from "wouter";
import { Play, Pause, RotateCcw, FastForward, TrendingUp, TrendingDown, Loader2, GraduationCap } from "lucide-react";
import Sparkline from "@/components/Sparkline";
import PageBackButton from "@/components/PageBackButton";
import { getValidSymbols, getSymbolDisplayName } from "@/lib/symbols";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";

type Tick = { epoch: number; price: number; lastDigit: number; timestamp?: number };
type Decision = { type: "rise" | "fall"; entryIdx: number; entryPrice: number; duration: number };
type Result = { type: string; win: boolean; at: string };

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
  const [duration, setDuration] = useState(5);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const timer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const SYMBOLS = getValidSymbols();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTicks([]);
    setIdx(0);
    setPlaying(false);
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const start = Math.floor(Date.now() / 1000) - 3 * 24 * 3600;
      const end = Math.floor(Date.now() / 1000);
      const raw = await derivWS.fetchTickHistory(symbol, start, end);
      if (!raw || raw.length === 0) throw new Error("No historical ticks returned for this symbol.");
      if (raw.length < 50) console.warn(`Only ${raw.length} ticks returned; may be insufficient.`);
      // Normalize: derivWS returns {price, timestamp(ms)} — convert to epoch(seconds) + compute lastDigit
      const normalized = raw.map((t: any) => {
        const ts = t.timestamp ?? t.epoch ?? Date.now();
        const epochSec = typeof ts === "number" && ts > 1e12 ? ts / 1000 : ts; // handle ms or sec
        return { epoch: epochSec, price: Number(t.price), lastDigit: t.lastDigit ?? lastDigitOf(Number(t.price), getDecimalPlaces(symbol)), timestamp: ts };
      });
      setTicks(normalized);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // ignore cancelled
      setError(e instanceof Error ? e.message : "Failed to load ticks");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (!isAuthenticated) navigate("/login");
  }, [isAuthenticated, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!playing) {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }
    timer.current = window.setInterval(() => {
      setIdx((i) => {
        if (i >= ticks.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, ticks.length]);

  const cur = ticks[idx];
  const windowTicks = ticks.slice(Math.max(0, idx - 80), idx + 1);

  const predict = (type: "rise" | "fall") => {
    if (!cur) return;
    if (decision) {
      // Cancel the open prediction and score it against the current tick
      const win = (decision.type === "rise" && cur.price > decision.entryPrice) || (decision.type === "fall" && cur.price < decision.entryPrice);
      setResults((r) =>
        [
          { type: `${decision.type} — ${idx - decision.entryIdx} ticks`, win, at: cur.timestamp ? new Date(cur.timestamp).toLocaleTimeString() : "—" },
          ...r,
        ].slice(0, 20),
      );
      setDecision(null);
      return;
    }
    setDecision({ type, entryIdx: idx, entryPrice: cur.price, duration });
  };

  // Auto-score when the prediction horizon expires
  useEffect(() => {
    if (!decision || !cur) return;
    if (idx >= decision.entryIdx + decision.duration) {
      const win = (decision.type === "rise" && cur.price > decision.entryPrice) || (decision.type === "fall" && cur.price < decision.entryPrice);
      setResults((r) =>
        [{ type: `${decision.type} — ${decision.duration} ticks`, win, at: cur.timestamp ? new Date(cur.timestamp).toLocaleTimeString() : "—" }, ...r].slice(
          0,
          20,
        ),
      );
      setDecision(null);
    }
  }, [idx, decision, cur]);

  return (
    <div className="h-full p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <PageBackButton fallback="/backtesting" label="Backtesting" />
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <GraduationCap className="w-7 h-7 text-[var(--accent-hover)]" /> Replay Mode
              </h1>
              <p className="text-[var(--text-secondary)] text-sm mt-1">
                Replay historical ticks and practice reading the tape. Predictions are scored, but no real orders are placed.
              </p>
            </div>
          </div>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {getSymbolDisplayName(s)}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="bg-[var(--red-soft)] border border-[var(--red)]/30 rounded-xl p-4 text-sm text-[var(--red)]">{error}</div>}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {!loading && ticks.length > 0 && (
          <>
            <div className="bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-xl p-3 text-xs text-[var(--accent)] flex items-center gap-2">
              <GraduationCap className="w-4 h-4 shrink-0" />
              Practice mode only — nothing here buys or sells. Use Dashboard / Terminal for real trading.
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase">Replaying</p>
                  <p className="text-3xl font-bold text-white">{cur?.price?.toFixed(getDecimalPlaces(symbol))}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {cur?.epoch ? new Date(cur.epoch * 1000).toLocaleString() : ""} · tick {idx + 1}/{ticks.length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] uppercase">Last digit</p>
                  <p className="text-4xl font-bold text-[var(--accent)]">{cur?.lastDigit}</p>
                </div>
              </div>

              <Sparkline data={windowTicks.map((t) => ({ value: t.price }))} />

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => {
                    setIdx(0);
                    setPlaying(false);
                  }}
                  className="min-w-[44px] min-h-[44px] p-3 rounded-lg bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="min-w-[44px] min-h-[44px] p-3 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent)]"
                >
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={ticks.length - 1}
                  value={idx}
                  onChange={(e) => {
                    setPlaying(false);
                    setIdx(Number(e.target.value));
                  }}
                  className="flex-1 min-h-[44px]"
                />
                <div className="flex items-center gap-1">
                  <FastForward className="w-5 h-5 text-[var(--text-muted)]" />
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="min-h-[44px] min-w-[80px] bg-[var(--card)] border border-[var(--border)] rounded px-3 py-1 text-sm text-white"
                  >
                    {[1, 2, 4, 8, 16].map((s) => (
                      <option key={s} value={s}>
                        {s}x
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-1">Make a Prediction</h2>
                <p className="text-xs text-[var(--text-muted)] mb-4">Guess the direction over the next few ticks and get scored — no real orders.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => predict("rise")}
                    className={`flex-1 min-h-[44px] py-4 rounded-lg flex items-center justify-center gap-2 font-bold ${decision?.type === "rise" ? "bg-[var(--green)] text-white" : "bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/30"}`}
                  >
                    <TrendingUp className="w-5 h-5" /> {decision ? "Score Now" : "Predict Rise"}
                  </button>
                  <button
                    onClick={() => predict("fall")}
                    className={`flex-1 min-h-[44px] py-4 rounded-lg flex items-center justify-center gap-2 font-bold ${decision?.type === "fall" ? "bg-[var(--red)] text-white" : "bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30"}`}
                  >
                    <TrendingDown className="w-5 h-5" /> {decision ? "Score Now" : "Predict Fall"}
                  </button>
                </div>
                {decision && (
                  <p className="text-xs text-[var(--text-secondary)] mt-3">
                    Predicted {decision.type} at {decision.entryPrice.toFixed(getDecimalPlaces(symbol))}. Press again to score early, or wait {decision.duration} ticks.
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)]">Horizon:</span>
                  <input type="range" min={1} max={20} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="flex-1" />
                  <span className="text-xs text-[var(--accent)] font-bold">{duration} ticks</span>
                </div>
              </div>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Your Decisions</h2>
                {(() => {
                  const wins = results.filter((r) => r.win).length;
                  const loss = results.length - wins;
                  const net = wins - loss;
                  const wr = results.length ? Math.round((wins / results.length) * 100) : 0;
                  return results.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs mb-3 px-2 py-2 bg-black/20 rounded-lg border border-[var(--border)]">
                      <span className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Score</span>
                        <span className={`font-mono tabular-nums font-bold text-[13px] ${net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {net >= 0 ? "+" : ""}
                          {net}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Win Rate</span>
                        <span className="font-mono tabular-nums font-bold text-[13px] text-white">{wr}%</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Decisions</span>
                        <span className="font-mono tabular-nums font-bold text-[13px] text-white">
                          {wins}W / {loss}L
                        </span>
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)] ml-auto">
                        {wr >= 60
                          ? "▲ 369AI: disciplined play — keep it."
                          : wr >= 40
                            ? "◉ 369AI: average — tighten entries."
                            : "▼ 369AI: negative edge — reduce size."}
                      </span>
                    </div>
                  ) : null;
                })()}
                {results.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-state-desc">No predictions yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-xs">
                    {results.map((r, i) => (
                      <div key={i} className="flex justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-[var(--text-secondary)]">
                          {r.type} <span className="text-[var(--text-muted)]">@ {r.at}</span>
                        </span>
                        <span className={r.win ? "text-[var(--green)]" : "text-[var(--red)]"}>{r.win ? "+1" : "-1"}</span>
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

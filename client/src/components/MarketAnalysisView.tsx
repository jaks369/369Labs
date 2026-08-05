import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, Flame, Snowflake, Loader2, ChevronDown } from "lucide-react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import { getSymbolDisplayName, ALL_VOLATILITY_SYMBOLS } from "@/lib/symbols";
import { formatPrice } from "@/lib/format";
import TickChart from "@/components/TickChart";

interface MarketAnalysisViewProps {
  symbol: string;
  onSymbolChange: (s: string) => void;
}

const DIGIT_COUNT = 10;
const WINDOW = 250;

function lastDigitOf(price: number): number {
  return ((Math.floor(Math.abs(price)) % 10) + 10) % 10;
}

export default function MarketAnalysisView({ symbol, onSymbolChange }: MarketAnalysisViewProps) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const tickRef = useRef<Tick[]>([]);
  const [connected, setConnected] = useState(derivWS.isConnected());

  const aiStateQuery = trpc.aiLive.state.useQuery(undefined, { refetchInterval: 15000 });
  const aiState = aiStateQuery.data;
  const health = aiState?.health?.find((h: any) => h.symbol === symbol);
  const advisory = aiState?.riskAdvisories?.find((r: any) => r.symbol === symbol);

  // Maintain a rolling tick buffer for the selected symbol.
  useEffect(() => {
    tickRef.current = [];
    setTicks([]);
    derivWS.markBackground(symbol);
    const buffered = derivWS.getRecentTicks(symbol, WINDOW * 2);
    if (buffered.length) {
      tickRef.current = buffered;
      setTicks(buffered);
    }
    setConnected(derivWS.isConnected());

    const listener = {
      onTick: (t: Tick) => {
        if (t.symbol !== symbol) return;
        const next = [...tickRef.current, t].slice(-Math.max(WINDOW * 2, 400));
        tickRef.current = next;
        setTicks(next);
      },
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    };

    const id = derivWS.subscribe(symbol);
    derivWS.addListener(listener);

    const timer = setInterval(() => setConnected(derivWS.isConnected()), 3000);

    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(id);
      clearInterval(timer);
    };
  }, [symbol]);

  const stats = useMemo(() => {
    const windowTicks = ticks.slice(-WINDOW);
    if (windowTicks.length < 2) return null;
    const first = windowTicks[0].price;
    const last = windowTicks[windowTicks.length - 1].price;
    const change = last - first;
    const changePct = (change / (first || 1)) * 100;
    const high = Math.max(...windowTicks.map((t) => t.price));
    const low = Math.min(...windowTicks.map((t) => t.price));
    const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const digits = new Array<number>(DIGIT_COUNT).fill(0);
    for (const t of windowTicks) digits[lastDigitOf(t.price)]++;
    const total = windowTicks.length;
    let hottest = 0;
    let coldest = 0;
    for (let d = 1; d < DIGIT_COUNT; d++) {
      if (digits[d] > digits[hottest]) hottest = d;
      if (digits[d] < digits[coldest]) coldest = d;
    }
    // ~% of ticks that ended up or down vs the prior tick.
    let upMoves = 0;
    for (let i = 1; i < windowTicks.length; i++) {
      if (windowTicks[i].price > windowTicks[i - 1].price) upMoves++;
    }
    const upRatio = (upMoves / (windowTicks.length - 1)) * 100;
    return {
      first,
      last,
      change,
      changePct,
      high,
      low,
      direction,
      digits,
      hottest,
      coldest,
      upRatio,
      sample: total,
    };
  }, [ticks]);

  const symbolOptions = useMemo(() => {
    const active = derivWS.activeSymbols;
    const available = new Set(
      active.length
        ? active.filter((s) => s.market === "volatility" || s.symbol.startsWith("R_") || s.symbol.startsWith("1HZ")).map((s) => s.symbol)
        : ALL_VOLATILITY_SYMBOLS,
    );
    const ordered = ALL_VOLATILITY_SYMBOLS.filter((s) => available.has(s));
    return [...new Set([...ordered, ...ALL_VOLATILITY_SYMBOLS])];
  }, []);

  const decimals = derivWS.decimalPlacesFor(symbol);

  return (
    <div className="space-y-4">
      {/* Header row: symbol picker + feed state */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-bold text-white focus:border-[var(--accent)] focus:outline-none cursor-pointer"
          >
            {symbolOptions.map((s) => (
              <option key={s} value={s} className="bg-[var(--bg-base-2)] text-white">
                {getSymbolDisplayName(s)} ({s})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 ${connected ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--red-soft)] text-[var(--red)]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[var(--green)] animate-live-pulse" : "bg-[var(--red)]"}`} />
            {connected ? "LIVE FEED" : "RECONNECTING"}
          </span>
          {health?.score != null && (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
              HEALTH {health.score}/100
            </span>
          )}
        </div>
      </div>

      {/* Live chart */}
      <div className="aurora-glass-panel p-3">
        <TickChart symbol={symbol} decimalPlaces={decimals} />
      </div>

      {/* Trend + digit stats */}
      {stats ? (
        <div className="grid gap-4 md:grid-cols-5">
          {/* Trend column */}
          <div className="md:col-span-2 aurora-glass-panel p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Trend</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Price</span>
                <p className="text-base font-bold text-white font-mono tabular-nums">{formatPrice(stats.last, symbol)}</p>
              </div>
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Window Δ</span>
                <p className={`text-base font-bold font-mono tabular-nums flex items-center gap-1 ${stats.direction === "up" ? "text-[var(--green)]" : stats.direction === "down" ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}>
                  {stats.direction === "up" ? <TrendingUp className="w-4 h-4" /> : stats.direction === "down" ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {stats.change > 0 ? "+" : ""}{formatPrice(stats.change, symbol)}
                </p>
                <p className={`text-[10px] font-mono tabular-nums ${stats.change > 0 ? "text-[var(--green)]" : stats.change < 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>
                  {stats.change > 0 ? "+" : ""}{stats.changePct.toFixed(3)}%
                </p>
              </div>
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">High</span>
                <p className="text-sm font-bold text-[var(--green)] font-mono tabular-nums">{formatPrice(stats.high, symbol)}</p>
              </div>
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Low</span>
                <p className="text-sm font-bold text-[var(--red)] font-mono tabular-nums">{formatPrice(stats.low, symbol)}</p>
              </div>
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Up moves</span>
                <p className="text-sm font-bold text-white font-mono tabular-nums">{stats.upRatio.toFixed(1)}%</p>
              </div>
              <div className="bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Samples</span>
                <p className="text-sm font-bold text-white font-mono tabular-nums">{stats.sample}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/20">
                <Flame className="w-3 h-3" /> Hot {stats.hottest} · {((stats.digits[stats.hottest] / stats.sample) * 100).toFixed(1)}%
              </span>
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/20">
                <Snowflake className="w-3 h-3" /> Cold {stats.coldest} · {((stats.digits[stats.coldest] / stats.sample) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Digit heatmap column */}
          <div className="md:col-span-3 aurora-glass-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Last-digit frequency</span>
              <span className="text-[9px] text-[var(--text-muted)]">last {stats.sample} ticks</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {stats.digits.map((count, d) => {
                const pct = (count / stats.sample) * 100;
                const max = Math.max(...stats.digits);
                const barH = count === 0 ? 3 : Math.max(8, Math.round((count / max) * 72));
                const isHot = d === stats.hottest;
                const isCold = d === stats.coldest;
                return (
                  <div
                    key={d}
                    className={`rounded-lg p-2 flex flex-col items-center border transition-all ${isHot ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : isCold ? "border-[var(--red-border)] bg-[var(--red-soft)]" : "bg-[var(--card)] border-[var(--border-subtle)]"}`}
                  >
                    <span className={`text-sm font-bold font-mono tabular-nums ${isHot ? "text-[var(--accent)]" : isCold ? "text-[var(--red)]" : "text-white"}`}>{d}</span>
                    <div className="w-full h-[72px] flex items-end justify-center my-1">
                      <div
                        className="w-4 rounded-full"
                        style={{
                          height: `${barH}px`,
                          background: isHot
                            ? "linear-gradient(180deg, var(--aurora-teal), var(--aurora-purple))"
                            : isCold
                              ? "linear-gradient(180deg, var(--aurora-magenta), var(--aurora-purple))"
                              : "linear-gradient(180deg, var(--aurora-purple), rgba(167,139,250,0.35))",
                          opacity: count === 0 ? 0.35 : 1,
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="aurora-glass-panel p-6 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          <p className="text-xs text-[var(--text-muted)]">Collecting ticks for {getSymbolDisplayName(symbol)}…</p>
        </div>
      )}

      {/* 369AI assessment */}
      {(health || advisory) && (
        <div className="aurora-glass-panel p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" />
            <span className="text-xs font-bold text-[var(--accent)]">369AI Assessment</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {health && (
              <div className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Market health</span>
                  <span className={`text-sm font-bold font-mono ${(health.score ?? 0) >= 60 ? "text-[var(--green)]" : (health.score ?? 0) >= 40 ? "text-[var(--accent)]" : "text-[var(--red)]"}`}>{health.score}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--border)] mb-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--aurora-teal)] via-[var(--aurora-purple)] to-[var(--aurora-magenta)]" style={{ width: `${Math.min(100, Math.max(0, health.score ?? 0))}%` }} />
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{health.recommendation}</p>
                {health.trend != null && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">Trend {health.trend > 5 ? "↑" : health.trend < -5 ? "↓" : "→"}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">Volatility {health.volatility}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">Noise {health.noise}</span>
                  </div>
                )}
              </div>
            )}
            {advisory && (
              <div className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Risk advisory</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${advisory.riskLevel === "CRITICAL" || advisory.riskLevel === "HIGH" ? "bg-[var(--red-soft)] text-[var(--red)]" : advisory.riskLevel === "MEDIUM" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--green-soft)] text-[var(--green)]"}`}>
                    {advisory.riskLevel}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{advisory.recommendation}</p>
                {(advisory.factors?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-1">
                    {advisory.factors.slice(0, 3).map((f: string, i: number) => (
                      <li key={i} className="text-[10px] text-[var(--text-muted)] flex items-start gap-1">
                        <span className="text-[var(--accent)]">•</span> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

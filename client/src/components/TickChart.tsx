import { useState, useEffect, useRef, useCallback } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import { LineChart, AreaChart, Maximize, Minimize } from "lucide-react";

interface ChartData {
  time: string;
  price: number;
}

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
  decimalPlaces?: number;
}

function niceScale(min: number, max: number, ticks: number) {
  const range = max - min || max * 0.01 || 1;
  const rough = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1.5 ? 1 : norm <= 3.5 ? 2 : norm <= 7.5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  return { start, end, step };
}

export default function TickChart({ symbol, maxDataPoints = 100, decimalPlaces = 3 }: TickChartProps) {
  const n = maxDataPoints;
  const [data, setData] = useState<ChartData[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 320 });
  const [mode, setMode] = useState<"line" | "area">("area");
  const [fullscreen, setFullscreen] = useState(false);
  const [timeframe, setTimeframe] = useState<number>(50);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: timeframe }, { enabled: Boolean(symbol) });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length) return;
    const hist = ticks.slice(-timeframe).map((t) => ({
      time: new Date((t.epoch || 0) * 1000).toLocaleTimeString(),
      price: Number(t.price),
    }));
    if (hist.length) setData(hist);
  }, [historyQuery.data, symbol, timeframe]);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceColor, setPriceColor] = useState<"up" | "down">("up");

  useEffect(() => {
    const buffered = derivWS.getRecentTicks(symbol, timeframe);
    if (buffered.length) {
      setData(buffered.slice(-timeframe).map((t) => ({
        time: new Date(t.timestamp).toLocaleTimeString(),
        price: t.price,
      })));
      const last = buffered[buffered.length - 1];
      setCurrentPrice(last.price);
    } else {
      setData([]);
      setCurrentPrice(null);
      setPriceColor("up");
    }
    setError(null);

    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        setData((prev) => {
          const next = [
            ...prev,
            {
              time: new Date(tick.timestamp).toLocaleTimeString(),
              price: tick.price,
            },
          ].slice(-timeframe);
          return next;
        });
        setCurrentPrice((prev) => {
          if (prev !== null) {
            setPriceColor(tick.price >= prev ? "up" : "down");
          }
          return tick.price;
        });
        setError(null);
      },
      onError: (err: Error, sym?: string) => {
        if (!sym || sym === symbol) setError(err.message);
      },
    };

    const id = derivWS.subscribe(symbol);
    const cachedErr = derivWS.getSubError(symbol);
    if (cachedErr) setError(cachedErr);
    derivWS.addListener(listener);

    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(id);
    };
  }, [symbol, timeframe]);

  const prices = data.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.001;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  const padX = 48;
  const padTop = 12;
  const padBottom = 28;
  const chartW = dims.w - padX;
  const chartH = dims.h - padTop - padBottom;

  const scale = niceScale(yMin, yMax, 5);
  const yRange = scale.end - scale.start || 1;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? padX + (i / (data.length - 1)) * chartW : padX;
    const y = padTop + chartH - ((d.price - scale.start) / yRange) * chartH;
    return { x, y };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${padX + chartW},${padTop + chartH} L${padX},${padTop + chartH} Z`;

  const gridLines: { value: number; y: number }[] = [];
  for (let v = scale.start; v <= scale.end + scale.step * 0.01; v += scale.step) {
    const y = padTop + chartH - ((v - scale.start) / yRange) * chartH;
    gridLines.push({ value: v, y });
  }

  const lastPrice = prices.length ? prices[prices.length - 1] : null;
  const lastY = lastPrice != null ? padTop + chartH - ((lastPrice - scale.start) / yRange) * chartH : 0;

  const ohlc = (() => {
    if (!data.length) return null;
    const first = data[0].price;
    const open = first;
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const close = data[data.length - 1].price;
    return { open, high, low, close };
  })();

  const uniqueTimes = new Set(data.map((d) => d.time));
  const timeLabels: { label: string; x: number }[] = [];
  if (data.length > 1 && uniqueTimes.size > 1) {
    const step = Math.max(1, Math.floor(data.length / 4));
    for (let i = 0; i < data.length; i += step) {
      const x = padX + (i / (data.length - 1)) * chartW;
      timeLabels.push({ label: data[i].time, x });
    }
  }

  return (
    <div className="w-full">
      {/* Chart toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-1">
          {[25, 50, 100, 200].map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                timeframe === t ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("line")}
            title="Line"
            className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "line" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
          >
            <LineChart className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMode("area")}
            title="Area"
            className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "area" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
          >
            <AreaChart className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="p-1.5 rounded transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div ref={containerRef} className={`w-full relative rounded-xl overflow-hidden border border-[var(--border-subtle)] ${fullscreen ? "h-full min-h-[80vh]" : "h-[280px] md:h-[340px]"}`}
        style={{ background: "linear-gradient(180deg, rgba(45,217,196,0.04) 0%, rgba(45,217,196,0.01) 60%, transparent 100%)" }}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-[var(--red)] text-sm text-center">Connection Error: {error}</p>
            <p className="text-[var(--text-muted)] text-xs text-center max-w-md">The symbol <span className="font-mono text-[var(--accent)]">{symbol}</span> may not be available. Try selecting a different symbol.</p>
          </div>
        ) : data.length > 1 ? (
          <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                <stop offset="70%" stopColor="var(--accent)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
              </linearGradient>
              <filter id="chartGlow" x="-10%" y="-30%" width="120%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid lines */}
            {gridLines.map((gl, i) => (
              <line
                key={`grid-${i}`}
                x1={padX} y1={gl.y} x2={padX + chartW} y2={gl.y}
                stroke="var(--border-subtle)"
                strokeWidth="1"
                opacity="0.6"
              />
            ))}

            {/* Area fill */}
            {mode === "area" && <path d={areaD} fill="url(#chartAreaGrad)" />}

            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#chartGlow)"
            />

            {/* Current price dashed line */}
            {lastPrice != null && (
              <line
                x1={padX} y1={lastY}
                x2={padX + chartW} y2={lastY}
                stroke="var(--accent)"
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity="0.4"
              />
            )}

            {/* Last point dot + price label */}
            {points.length > 0 && (() => {
              const last = points[points.length - 1];
              const label = lastPrice?.toFixed(decimalPlaces) ?? "";
              const tagW = Math.max(52, label.length * 7 + 16);
              const placeLeft = last.x + tagW > padX + chartW - 4;
              const tx = placeLeft ? last.x - tagW - 8 : last.x + 8;
              const ty = Math.min(Math.max(last.y - 11, padTop + 2), padTop + chartH - 22);
              return (
                <g>
                  <circle cx={last.x} cy={last.y} r="4" fill="var(--accent)" filter="url(#chartGlow)" />
                  <rect x={tx} y={ty} width={tagW} height={20} rx="4" fill="var(--accent)" />
                  <text x={tx + tagW / 2} y={ty + 14} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--bg)" fontFamily="JetBrains Mono, monospace">
                    {label}
                  </text>
                </g>
              );
            })()}

            {/* Y-axis labels */}
            {gridLines.map((gl, i) => (
              <text
                key={`ylbl-${i}`}
                x={padX - 8} y={gl.y + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {gl.value.toFixed(decimalPlaces)}
              </text>
            ))}

            {/* Time labels */}
            {timeLabels.map((tl, i) => (
              <text
                key={`time-${i}`}
                x={tl.x} y={padTop + chartH + 20}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {tl.label}
              </text>
            ))}
          </svg>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[var(--border-subtle)] shimmer" />
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Awaiting ticks</p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-4 gap-2 md:gap-3">
        <div className="bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Open</span>
          <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{ohlc ? ohlc.open.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">High</span>
          <p className="text-sm font-bold text-[var(--green)] tabular-nums">{ohlc ? ohlc.high.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Low</span>
          <p className="text-sm font-bold text-[var(--red)] tabular-nums">{ohlc ? ohlc.low.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Close</span>
          <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{ohlc ? ohlc.close.toFixed(decimalPlaces) : "—"}</p>
        </div>
      </div>
    </div>
  );
}

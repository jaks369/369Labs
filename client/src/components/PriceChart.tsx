import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, AreaChart, Maximize, Minimize, RotateCcw } from "lucide-react";
import { getSymbolDisplayName } from "@/lib/symbols";

export interface PriceChartPoint {
  time: string;
  price: number;
}

interface PriceChartProps {
  data: PriceChartPoint[];
  error?: string | null;
  symbol?: string;
  decimalPlaces?: number;
  compact?: boolean;
  color?: string;
  mode?: "line" | "area";
  timeframes?: number[];
  timeframe?: number;
  onTimeframeChange?: (t: number) => void;
  fitOnDataChange?: boolean;
  heightClass?: string;
  showStats?: boolean;
  followLabel?: string;
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

export default function PriceChart({
  data,
  error = null,
  symbol,
  decimalPlaces = 3,
  compact = false,
  color = "var(--accent)",
  mode: initialMode = "area",
  timeframes,
  timeframe,
  onTimeframeChange,
  fitOnDataChange = false,
  heightClass,
  showStats = !compact,
  followLabel = "Return to live",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 320 });
  const [mode, setMode] = useState<"line" | "area">(initialMode);
  const [fullscreen, setFullscreen] = useState(false);

  // Viewport state (lightweight-charts-style logical range model):
  // - visibleBars: how many bars fit in the plot
  // - rightOffset: empty space reserved to the right of the latest tick so the
  //   line ends short of the grid edge — a visual cue that price continues.
  // - scrollBack: bars the right edge is scrolled back from the live edge (0 = follow latest)
  const MIN_BARS = 10;
  const [visibleBars, setVisibleBars] = useState<number>(Math.max(MIN_BARS, data.length || 1));
  const [scrollBack, setScrollBack] = useState<number>(0);
  const [dragging, setDragging] = useState<{ startX: number; startScroll: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number; time: string; barIdx: number } | null>(null);

  // Reserve ~18% of the visible window as continuation space on the right.
  const rightOffset = Math.max(8, Math.round((visibleBars || 1) * 0.2));

  // Controlled timeframe: reseed viewport when the parent changes the window.
  useEffect(() => {
    if (timeframe != null) {
      setScrollBack(0);
      setVisibleBars(Math.max(MIN_BARS, timeframe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  // Static datasets: refit the whole series whenever data length changes.
  useEffect(() => {
    if (fitOnDataChange) {
      setScrollBack(0);
      setVisibleBars(Math.max(MIN_BARS, data.length || 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);

  const isFollowing = scrollBack === 0;
  const liveEdge = data.length - 1;

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

  const uid = useRef(Math.random().toString(36).slice(2)).current;
  const gradId = `pc-${uid}-area`;
  const lineGradId = `pc-${uid}-line`;
  const glowId = `pc-${uid}-glow`;

  // ===== Viewport math (logical range → pixels) =====
  const padX = 48;
  const padTop = 12;
  const padBottom = 28;
  const chartW = dims.w - padX;
  const chartH = dims.h - padTop - padBottom;

  const totalBars = visibleBars + rightOffset;
  const rightIdx = Math.max(0, Math.min(liveEdge - scrollBack, data.length - 1));
  const leftIdx = Math.max(0, rightIdx - visibleBars + 1);

  const visibleSlice = data.slice(leftIdx, rightIdx + 1);
  const prices = visibleSlice.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  // Decimal-focused y-scale: for high-priced indices (e.g. ~6849) the absolute
  // range dwarfs the fractional movement, so plotting against the absolute price
  // renders even real movement as a flat line. Instead we anchor the axis to the
  // window's integer base and scale against the fractional part — a 0.002 move
  // is as visible as a 2-point move on a low-priced asset.
  const tickPad = Math.pow(10, -decimalPlaces);
  const base = Math.floor(minPrice);
  const relPrices = prices.map((p) => p - base);
  const relMin = relPrices.length ? Math.min(...relPrices) : 0;
  const relMax = relPrices.length ? Math.max(...relPrices) : 1;
  const padding = (relMax - relMin) * 0.1 || tickPad;
  const yMin = relMin - padding;
  const yMax = relMax + padding;

  const scale = niceScale(yMin, yMax, 5);
  const yRange = scale.end - scale.start || 1;

  // Precision for the left grid labels: always show at least the symbol's
  // decimals, and extend further when the auto-scaled price step is finer
  // (volatility indices tick in 0.01/0.001) so the movement is readable
  // instead of reading as a flat line. Cap at 6 to keep labels short.
  const stepDecimals = Math.max(0, Math.ceil(-Math.log10(scale.step)));
  const labelDecimals = Math.min(6, Math.max(decimalPlaces, stepDecimals));

  const xOf = (i: number) => padX + ((i - leftIdx) / (totalBars - 1 || 1)) * chartW;

  const points = data
    .map((d, i) => ({ x: xOf(i), y: padTop + chartH - ((d.price - base - scale.start) / yRange) * chartH }))
    .filter((p) => p.x >= padX - 1 && p.x <= padX + chartW + 1);
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${padX + chartW},${padTop + chartH} L${padX},${padTop + chartH} Z`;

  const gridLines: { value: number; y: number }[] = [];
  for (let v = scale.start; v <= scale.end + scale.step * 0.01; v += scale.step) {
    const y = padTop + chartH - ((v - scale.start) / yRange) * chartH;
    gridLines.push({ value: v + base, y });
  }

  const lastPrice = data.length ? data[data.length - 1].price : null;
  const lastY = lastPrice != null ? padTop + chartH - ((lastPrice - base - scale.start) / yRange) * chartH : 0;
  const lastX = data.length ? xOf(data.length - 1) : padX;

  const ohlc = (() => {
    if (!data.length) return null;
    const open = data[0].price;
    const high = Math.max(...data.map((d) => d.price));
    const low = Math.min(...data.map((d) => d.price));
    const close = data[data.length - 1].price;
    return { open, high, low, close };
  })();

  const timeLabels: { label: string; x: number }[] = [];
  const inView = data.filter((_, i) => i >= leftIdx && i <= rightIdx);
  if (inView.length > 1) {
    const step = Math.max(1, Math.floor(inView.length / 4));
    for (let i = 0; i < inView.length; i += step) {
      const gi = leftIdx + i;
      timeLabels.push({ label: data[gi].time, x: xOf(gi) });
    }
  }

  // ===== Interaction handlers =====
  const zoomBy = useCallback((factor: number, anchorX?: number) => {
    setVisibleBars((cur) => {
      const next = Math.round(Math.min(200, Math.max(MIN_BARS, cur * factor)));
      if (anchorX != null && dims.w > padX) {
        const frac = (anchorX - padX) / chartW;
        const anchorIdx = leftIdx + frac * (totalBars - 1);
        const newLeft = anchorIdx - frac * (next + rightOffset - 1);
        setScrollBack(Math.max(0, Math.round(liveEdge - (newLeft + next - 1))));
      } else {
        setScrollBack((s) => (s > 0 ? s : 0));
      }
      return next;
    });
  }, [dims.w, chartW, leftIdx, totalBars, rightOffset, liveEdge]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const anchorX = rect ? e.clientX - rect.left : undefined;
    zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, anchorX);
  }, [zoomBy]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging({ startX: e.clientX, startScroll: scrollBack });
  }, [scrollBack]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || chartW <= 0) return;
    const dx = e.clientX - dragging.startX;
    const barsPerPx = (totalBars - 1) / chartW;
    const delta = Math.round(dx * barsPerPx);
    setScrollBack(Math.max(0, Math.min(liveEdge - 0, dragging.startScroll - delta)));
  }, [dragging, chartW, totalBars, liveEdge]);

  const onCrosshairMove = useCallback((e: React.PointerEvent) => {
    if (dragging || chartW <= 0) { setCrosshair(null); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < padX || mx > padX + chartW || my < padTop || my > padTop + chartH) {
      setCrosshair(null);
      return;
    }
    const frac = (mx - padX) / chartW;
    const barIdx = Math.round(leftIdx + frac * (totalBars - 1));
    const dataIdx = Math.max(0, Math.min(barIdx, data.length - 1));
    const priceFrac = 1 - (my - padTop) / chartH;
    const priceAtCursor = scale.start + priceFrac * yRange + base;
    setCrosshair({
      x: mx,
      y: my,
      price: priceAtCursor,
      time: data[dataIdx]?.time ?? "",
      barIdx: dataIdx,
    });
  }, [dragging, chartW, chartH, padX, padTop, leftIdx, totalBars, scale.start, yRange, base, data]);

  const onCrosshairLeave = useCallback(() => setCrosshair(null), []);

  const onPointerUp = useCallback(() => setDragging(null), []);

  const returnToLive = useCallback(() => {
    setScrollBack(0);
    setVisibleBars((cur) => cur);
  }, []);

  const handleFrameClick = useCallback((t: number) => {
    onTimeframeChange?.(t);
    setScrollBack(0);
    setVisibleBars(Math.max(MIN_BARS, t));
  }, [onTimeframeChange]);

  const defaultHeight = fullscreen ? "h-full min-h-[80vh]" : compact ? "h-[220px]" : "h-[280px] md:h-[340px]";

  return (
    <div className="w-full">
      {/* Chart toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-1">
          {timeframes?.map((t) => (
            <button
              key={t}
              onClick={() => handleFrameClick(t)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                timeframe === t ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMode("line")} title="Line" className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "line" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            <LineChart className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setMode("area")} title="Area" className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "area" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            <AreaChart className="w-3.5 h-3.5" />
          </button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { onPointerMove(e); onCrosshairMove(e); }}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { onPointerUp(); onCrosshairLeave(); }}
        className={`w-full relative rounded-xl overflow-hidden border border-[var(--border-subtle)] select-none ${heightClass || defaultHeight}`}
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 6%, transparent) 0%, color-mix(in srgb, ${color} 1.5%, transparent) 60%, transparent 100%)`, cursor: dragging ? "grabbing" : "grab" }}
      >
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-[var(--red)] text-sm text-center">Connection Error: {error}</p>
            <p className="text-[var(--text-muted)] text-xs text-center max-w-md">The symbol <span className="font-mono text-[var(--accent)]">{symbol}</span> ({getSymbolDisplayName(symbol || "")}) may not be available. Try selecting a different symbol.</p>
          </div>
        ) : data.length > 1 ? (
          <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.06" />
                <stop offset="60%" stopColor={color} stopOpacity="0.02" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
              <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={color} stopOpacity="1" />
              </linearGradient>
              <filter id={glowId} x="-5%" y="-15%" width="110%" height="130%">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid lines */}
            {gridLines.map((gl, i) => (
              <line key={`grid-${i}`} x1={padX} y1={gl.y} x2={padX + chartW} y2={gl.y} stroke="var(--border-subtle)" strokeWidth="1" opacity="0.4" />
            ))}

            {/* Area fill */}
            {mode === "area" && <path d={areaD} fill={`url(#${gradId})`} />}

            {/* Line — thin, Deriv-style */}
            <path d={pathD} fill="none" stroke={`url(#${lineGradId})`} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={`url(#${glowId})`} />

            {/* Current price dashed line */}
            {lastPrice != null && (
              <line x1={padX} y1={lastY} x2={padX + chartW} y2={lastY} stroke={color} strokeWidth="1" strokeDasharray="4,4" opacity="0.4" />
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
                  <circle cx={last.x} cy={last.y} r="4" fill={color} filter={`url(#${glowId})`} />
                  <rect x={tx} y={ty} width={tagW} height={20} rx="4" fill={color} />
                  <text x={tx + tagW / 2} y={ty + 14} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--bg)" fontFamily="JetBrains Mono, monospace">
                    {label}
                  </text>
                </g>
              );
            })()}

            {/* Y-axis labels */}
            {gridLines.map((gl, i) => (
              <text key={`ylbl-${i}`} x={padX - 8} y={gl.y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="10" fontFamily="JetBrains Mono, monospace">
                {gl.value.toFixed(labelDecimals)}
              </text>
            ))}

            {/* Time labels */}
            {timeLabels.map((tl, i) => (
              <text key={`time-${i}`} x={tl.x} y={padTop + chartH + 20} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="JetBrains Mono, monospace">
                {tl.label}
              </text>
            ))}

            {/* Crosshair */}
            {crosshair && (
              <g>
                <line x1={crosshair.x} y1={padTop} x2={crosshair.x} y2={padTop + chartH} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5" />
                <line x1={padX} y1={crosshair.y} x2={padX + chartW} y2={crosshair.y} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5" />
                <circle cx={crosshair.x} cy={crosshair.y} r="3" fill={color} stroke="var(--bg)" strokeWidth="1.5" />
                {/* Price tag on Y axis */}
                <rect x={0} y={crosshair.y - 10} width={padX - 4} height={20} rx="3" fill={color} />
                <text x={(padX - 4) / 2} y={crosshair.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--bg)" fontFamily="JetBrains Mono, monospace">
                  {crosshair.price.toFixed(labelDecimals)}
                </text>
                {/* Time tag on X axis */}
                <rect x={crosshair.x - 30} y={padTop + chartH + 2} width={60} height={16} rx="3" fill={color} />
                <text x={crosshair.x} y={padTop + chartH + 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--bg)" fontFamily="JetBrains Mono, monospace">
                  {crosshair.time}
                </text>
              </g>
            )}
          </svg>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[var(--border-subtle)] shimmer" />
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Awaiting data</p>
          </div>
        )}

        {/* Return-to-latest — shown once the user has panned/zoomed away from the latest edge */}
        {!isFollowing && data.length > 1 && (
          <button
            onClick={returnToLive}
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-[11px] font-bold shadow-lg hover:brightness-110 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> {followLabel}
          </button>
        )}
      </div>

      {/* Stats row */}
      {showStats && (
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
      )}
    </div>
  );
}

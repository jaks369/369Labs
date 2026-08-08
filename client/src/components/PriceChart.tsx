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
  fillHeight?: boolean;
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

// Monotone cubic Hermite path (Fritsch–Carlson), same curve family as
// Recharts' curveMonotoneX: smooth without overshooting the data extremes,
// so spikes in a volatility index stay honest instead of ringing.
function smoothPath(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  const slopes: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    slopes.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
  }
  const tan: number[] = [slopes[0]];
  for (let i = 1; i < slopes.length; i++) {
    const a = slopes[i - 1];
    const b = slopes[i];
    tan.push(a * b <= 0 ? 0 : 2 / (1 / a + 1 / b));
  }
  tan.push(slopes[slopes.length - 1]);
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const cp1x = pts[i].x + dx / 3;
    const cp1y = pts[i].y + (tan[i] * dx) / 3;
    const cp2x = pts[i + 1].x - dx / 3;
    const cp2y = pts[i + 1].y - (tan[i + 1] * dx) / 3;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
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
  fillHeight = false,
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
  const padX = 72;
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

  const scale = niceScale(yMin, yMax, 3);
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
  const pathD = smoothPath(points);
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
  // Keep the current viewport in a ref so the (rAF-throttled) wheel handler can
  // compute the next range atomically instead of nesting a setState inside a
  // setState updater (which misbehaves under React batching and made zooming
  // feel stuck/laggy).
  const viewportRef = useRef({ visibleBars, scrollBack });
  useEffect(() => {
    viewportRef.current = { visibleBars, scrollBack };
  }, [visibleBars, scrollBack]);

  const zoomBy = useCallback((factor: number, anchorX?: number) => {
    const cur = viewportRef.current.visibleBars;
    const next = Math.round(Math.min(200, Math.max(MIN_BARS, cur * factor)));
    if (anchorX != null && dims.w > padX) {
      const frac = (anchorX - padX) / chartW;
      const anchorIdx = leftIdx + frac * (totalBars - 1);
      const newLeft = anchorIdx - frac * (next + rightOffset - 1);
      setScrollBack(Math.max(0, Math.round(liveEdge - (newLeft + next - 1))));
    } else {
      setScrollBack((s) => (s > 0 ? s : 0));
    }
    setVisibleBars(next);
  }, [dims.w, chartW, leftIdx, totalBars, rightOffset, liveEdge]);

  // Native, NON-passive wheel listener. React's synthetic onWheel is attached
  // passively, so preventDefault is ignored there: wheel-scrolling over the
  // chart scrolled the page instead of zooming. We also coalesce wheel events
  // to one zoom step per animation frame so a fast scroll/pinch doesn't issue
  // dozens of full SVG re-renders per second on top of live tick re-renders
  // (which made the line freeze/lag while zooming).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    let pending: WheelEvent | null = null;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ev = pending;
        pending = null;
        if (!ev) return;
        const rect = el.getBoundingClientRect();
        zoomBy(ev.deltaY > 0 ? 1.15 : 1 / 1.15, ev.clientX - rect.left);
      });
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onNativeWheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [zoomBy]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Pan with either the left or right mouse button (button 2 is the classic
    // charting "grab" gesture). Suppress the browser context menu so right-drag
    // moves the chart backward/forward instead of popping up the menu.
    if (e.button === 2) e.preventDefault();
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
    if (dragging || e.button !== 0 || chartW <= 0) { setCrosshair(null); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < padX || mx > padX + chartW || my < padTop || my > padTop + chartH) {
      setCrosshair(null);
      return;
    }
    if (!data.length) { setCrosshair(null); return; }
    // Snap to the nearest actual data point by X (time) — the cursor's Y is only
    // used to decide if we're over the plot; the snapped price is the real tick.
    const frac = (mx - padX) / chartW;
    const barIdx = Math.max(0, Math.min(Math.round(leftIdx + frac * (totalBars - 1)), data.length - 1));
    const point = data[barIdx];
    const px = padX + ((barIdx - leftIdx) / (totalBars - 1 || 1)) * chartW;
    const py = padTop + chartH - ((point.price - base - scale.start) / yRange) * chartH;
    setCrosshair({
      x: px,
      y: py,
      price: point.price,
      time: point.time,
      barIdx,
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
    <div className={`w-full ${fillHeight ? "h-full flex flex-col min-h-0" : ""}`}>
      {/* Chart toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2 shrink-0">
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
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { onPointerMove(e); onCrosshairMove(e); }}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { onPointerUp(); onCrosshairLeave(); }}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full relative select-none ${fillHeight ? "flex-1 min-h-0" : heightClass || defaultHeight}`}
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 6%, transparent) 0%, color-mix(in srgb, ${color} 1.5%, transparent) 60%, transparent 100%)`, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
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
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid lines */}
            {gridLines.map((gl, i) => (
              <line key={`grid-${i}`} x1={padX} y1={gl.y} x2={padX + chartW} y2={gl.y} stroke="var(--border-subtle)" strokeWidth="0.5" opacity="0.15" />
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

            {/* Crosshair — snapped to the nearest actual data point */}
            {crosshair && (() => {
              const tipW = 116;
              const tipH = 22;
              let tipX = crosshair.x + 10;
              if (tipX + tipW > padX + chartW) tipX = crosshair.x - tipW - 10;
              let tipY = crosshair.y - tipH - 10;
              if (tipY < padTop) tipY = crosshair.y + 10;
              return (
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
                  {/* Floating tooltip — the real snapped price and its real timestamp */}
                  <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="4" fill="rgba(10,14,23,0.92)" stroke="rgba(255,255,255,0.12)" />
                  <text x={tipX + 8} y={tipY + 14.5} fontSize="9" fontWeight="bold" fill={color} fontFamily="JetBrains Mono, monospace">
                    {crosshair.price.toFixed(labelDecimals)}
                  </text>
                  <text x={tipX + tipW / 2 + 10} y={tipY + 14.5} textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="JetBrains Mono, monospace">
                    {crosshair.time}
                  </text>
                </g>
              );
            })()}
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
      <div className={`mt-3 grid grid-cols-4 gap-2 md:gap-3 ${fillHeight ? "shrink-0" : ""}`}>
        <div className="p-2.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Open</span>
          <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{ohlc ? ohlc.open.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="p-2.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">High</span>
          <p className="text-sm font-bold text-[var(--green)] tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{ohlc ? ohlc.high.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="p-2.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Low</span>
          <p className="text-sm font-bold text-[var(--red)] tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{ohlc ? ohlc.low.toFixed(decimalPlaces) : "—"}</p>
        </div>
        <div className="p-2.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Close</span>
          <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{ohlc ? ohlc.close.toFixed(decimalPlaces) : "—"}</p>
        </div>
      </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { createChart, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi, type CandlestickData, type LineData, type Time } from "lightweight-charts";
import { CandlestickChart, LineChart, Maximize, Minimize } from "lucide-react";
import { getSymbolDisplayName } from "@/lib/symbols";

export interface PriceChartPoint {
  /** Epoch seconds (e.g. 1712848000) — for chart positioning. */
  epoch: number;
  /** Display time string — for labels. */
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
  mode?: "candle" | "line" | "area";
  /** Default mode for synthetic indices: line (Deriv-style live tick). */
  defaultMode?: "candle" | "line" | "area";
  timeframes?: number[];
  timeframe?: number;
  onTimeframeChange?: (t: number) => void;
  maxBars?: number;
  fitOnDataChange?: boolean;
  heightClass?: string;
  showStats?: boolean;
  followLabel?: string;
  fillHeight?: boolean;
}

/**
 * Aggregate raw ticks into OHLCV candlestick bars using epoch seconds.
 */
function aggregateToCandles(data: PriceChartPoint[], windowSec: number): CandlestickData<Time>[] {
  if (!data.length) return [];
  const buckets = new Map<number, { open: number; high: number; low: number; close: number }>();
  for (const d of data) {
    const bucketKey = Math.floor(d.epoch / windowSec) * windowSec;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.high = Math.max(existing.high, d.price);
      existing.low = Math.min(existing.low, d.price);
      existing.close = d.price;
    } else {
      buckets.set(bucketKey, { open: d.price, high: d.price, low: d.price, close: d.price });
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, bar]) => ({ time: time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close }));
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
  mode: initialModeProp,
  defaultMode = "candle",
  timeframes,
  timeframe,
  onTimeframeChange,
  maxBars = 2000,
  fitOnDataChange = false,
  heightClass,
  showStats = !compact,
  followLabel = "Return to live",
  fillHeight = false,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any, Time> | null>(null);
  const [mode, setMode] = useState<"candle" | "line" | "area">(initialModeProp ?? defaultMode);
  const [fullscreen, setFullscreen] = useState(false);

  const ohlc = (() => {
    if (!data.length) return null;
    const open = data[0].price;
    const high = Math.max(...data.map((d) => d.price));
    const low = Math.min(...data.map((d) => d.price));
    const close = data[data.length - 1].price;
    return { open, high, low, close };
  })();

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

  // Create / destroy chart on mount/unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: "#778196",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 2, labelBackgroundColor: "#2dd4bf" },
        horzLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 2, labelBackgroundColor: "#2dd4bf" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(([entry]) => {
      if (chartRef.current && entry) {
        chartRef.current.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Sync data to chart — incremental updates, not full re-creation
  const prevDataLenRef = useRef(0);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Create series once per mode
    if (!seriesRef.current) {
      if (mode === "candle") {
        const candleData = aggregateToCandles(data, 5);
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#34e0a1",
          downColor: "#f43f5e",
          borderVisible: false,
          wickUpColor: "#34e0a1",
          wickDownColor: "#f43f5e",
        });
        candleSeries.setData(candleData);
        seriesRef.current = candleSeries;
      } else {
        const lineData: LineData<Time>[] = data.map((d) => ({
          time: d.epoch as Time,
          value: d.price,
        }));
        const seen = new Set<number>();
        const deduped = lineData.filter((d) => {
          if (seen.has(d.time as number)) return false;
          seen.add(d.time as number);
          return true;
        });
        const lineSeries = chart.addSeries(LineSeries, {
          color: "#2dd4bf",
          lineWidth: 2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
        });
        lineSeries.setData(deduped);
        seriesRef.current = lineSeries;
      }
      prevDataLenRef.current = data.length;
      chart.timeScale().scrollToRealTime();
      return;
    }

    // Only the last point changed → incrementally update (smooth like Deriv)
    if (data.length === prevDataLenRef.current + 1 && data.length > 0) {
      const latest = data[data.length - 1];
      if (mode === "candle") {
        // Update the latest candle with the current tick price
        const candleData = aggregateToCandles(data.slice(-5), 5);
        if (candleData.length > 0) {
          seriesRef.current.update(candleData[candleData.length - 1]);
        }
      } else {
        seriesRef.current.update({ time: latest.epoch as Time, value: latest.price });
      }
      prevDataLenRef.current = data.length;
      chart.timeScale().scrollToRealTime();
    }

    // Only the last point changed → incrementally update (smooth like Deriv)
    if (data.length === prevDataLenRef.current + 1 && data.length > 0) {
      const latest = data[data.length - 1];
      if (mode === "candle") {
        // Update the latest candle with the current tick price
        const candleData = aggregateToCandles(data.slice(-5), 5); // last few ticks make the last candle
        if (candleData.length > 0) {
          seriesRef.current.update(candleData[candleData.length - 1]);
        }
      } else {
        seriesRef.current.update({ time: latest.epoch as Time, value: latest.price });
      }
      prevDataLenRef.current = data.length;
      chart.timeScale().scrollToRealTime();
    }
  }, [data, mode, decimalPlaces]);

  // Full re-create on mode change (removes all series, starts fresh)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (!data.length) return;
    // Trigger full build via the sync effect above
    prevDataLenRef.current = data.length;
  }, [mode]);

  // Mode toggle
  const handleModeChange = useCallback((newMode: "candle" | "line" | "area") => {
    setMode(newMode);
  }, []);

  const defaultHeight = fullscreen ? "h-full min-h-[80vh]" : compact ? "h-[220px]" : "h-[280px] md:h-[340px]";

  return (
    <div className={`w-full ${fillHeight ? "h-full flex flex-col min-h-0" : ""}`}>
      {/* Chart toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2 shrink-0">
        <div className="flex items-center gap-1">
          {timeframes?.map((t) => (
            <button
              key={t}
              onClick={() => onTimeframeChange?.(t)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                timeframe === t ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => handleModeChange("candle")} title="Candlestick" className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "candle" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            <CandlestickChart className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleModeChange("line")} title="Line" className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "line" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            <LineChart className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleModeChange("area")} title="Area" className={`p-1.5 rounded transition-colors cursor-pointer ${mode === "area" ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14 L5 8 L8 10 L11 4 L14 6 L14 14 Z" fill="currentColor" opacity="0.3" /><path d="M2 14 L5 8 L8 10 L11 4 L14 6" /></svg>
          </button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`w-full relative select-none ${fillHeight ? "flex-1 min-h-0" : heightClass || defaultHeight}`}
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 6%, transparent) 0%, color-mix(in srgb, ${color} 1.5%, transparent) 60%, transparent 100%)` }}
      >
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 bg-background/80">
            <p className="text-[var(--red)] text-sm text-center">Connection Error: {error}</p>
            <p className="text-[var(--text-muted)] text-xs text-center max-w-md">The symbol <span className="font-mono text-[var(--accent)]">{symbol}</span> ({getSymbolDisplayName(symbol || "")}) may not be available. Try selecting a different symbol.</p>
          </div>
        )}
        {!data.length && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[var(--border-subtle)] shimmer" />
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Awaiting data</p>
          </div>
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

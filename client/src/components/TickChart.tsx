import { useState, useEffect, useRef } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";

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

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: n }, { enabled: Boolean(symbol) });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length) return;
    const hist = ticks.slice(-n).map((t) => ({
      time: new Date((t.epoch || 0) * 1000).toLocaleTimeString(),
      price: Number(t.price),
    }));
    if (hist.length) setData(hist);
  }, [historyQuery.data, symbol, n]);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceColor, setPriceColor] = useState<"up" | "down">("up");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const buffered = derivWS.getRecentTicks(symbol, n);
    if (buffered.length) {
      setData(buffered.slice(-n).map((t) => ({
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
          ].slice(-n);
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
  }, [symbol, n]);

  const prices = data.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.001;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  // Layout
  const chartW = 750;
  const chartH = 210;
  const rightMargin = 100;
  const bottomMargin = 80;
  const totalW = chartW + rightMargin;
  const totalH = chartH + bottomMargin;

  // Scale
  const scale = niceScale(yMin, yMax, 6);
  const yRange = scale.end - scale.start || 1;

  // Line points
  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * chartW : 0;
    const y = chartH - ((d.price - scale.start) / yRange) * chartH;
    return `${x},${y}`;
  });

  // Grid lines
  const gridLines: { value: number; y: number }[] = [];
  for (let v = scale.start; v <= scale.end + scale.step * 0.01; v += scale.step) {
    const y = chartH - ((v - scale.start) / yRange) * chartH;
    gridLines.push({ value: v, y });
  }

  // Volume momentum bars
  const numSegs = 10;
  const segs: { up: number; down: number; total: number }[] = [];
  if (data.length >= numSegs) {
    const segLen = Math.floor(data.length / numSegs);
    for (let s = 0; s < numSegs; s++) {
      const startIdx = s * segLen;
      const endIdx = s === numSegs - 1 ? data.length : (s + 1) * segLen;
      let up = 0, down = 0;
      for (let i = startIdx + 1; i < endIdx; i++) {
        if (data[i].price > data[i - 1].price) up++;
        else if (data[i].price < data[i - 1].price) down++;
      }
      segs.push({ up, down, total: endIdx - startIdx });
    }
  }
  const maxSegTicks = segs.length ? Math.max(...segs.map(s => s.total), 1) : 1;

  // Time labels
  const timeLabels: { label: string; x: number }[] = [];
  if (data.length > 1) {
    const indices = [0, Math.floor(data.length / 2), data.length - 1];
    indices.forEach((idx) => {
      const x = (idx / (data.length - 1)) * chartW;
      timeLabels.push({ label: data[idx].time, x });
    });
  }

  // Current price dashed line
  const lastPrice = prices.length ? prices[prices.length - 1] : null;
  const lastY = lastPrice != null ? chartH - ((lastPrice - scale.start) / yRange) * chartH : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-3 py-2 bg-[var(--bg)] rounded border border-[var(--border)]">
        <span className="text-xs font-bold text-white">{symbol}</span>
        <span className={`text-lg font-bold ${priceColor === "up" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {currentPrice !== null ? Number(currentPrice).toFixed(decimalPlaces) : "--"}
        </span>
      </div>

      {error ? (
        <div className="w-full h-64 flex flex-col items-center justify-center gap-3 bg-[var(--bg)] rounded border border-[var(--red)]/30 p-6">
          <p className="text-[var(--red)] text-sm text-center">Connection Error: {error}</p>
          <p className="text-[var(--text-muted)] text-xs text-center max-w-md">The symbol <span className="font-mono text-[var(--accent)]">{symbol}</span> may not be available on your Deriv account or may have been renamed. Try selecting a different symbol from the picker.</p>
        </div>
      ) : data.length > 1 ? (
        <svg ref={svgRef} viewBox={`0 0 ${totalW} ${totalH}`} preserveAspectRatio="none" className="w-full h-[220px]" style={{ maxHeight: "300px" }}>
          <defs>
            <linearGradient id="lineGradUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGradDown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--red)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
            </linearGradient>
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {gridLines.map((gl, i) => (
            <g key={`grid-${i}`}>
              <line
                x1="0" y1={gl.y} x2={chartW} y2={gl.y}
                stroke="rgba(136,150,168,0.08)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <text
                x={chartW + 8} y={gl.y + 4}
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {gl.value.toFixed(decimalPlaces)}
              </text>
            </g>
          ))}

          {/* Vertical grid lines (time markers) */}
          {timeLabels.map((tl, i) => (
            <line
              key={`vgrid-${i}`}
              x1={tl.x} y1="0" x2={tl.x} y2={chartH}
              stroke="rgba(136,150,168,0.05)"
              strokeWidth="1"
              strokeDasharray="2,4"
            />
          ))}

          {/* Area fill */}
          <polyline
            points={`0,${chartH} ${points.join(" ")} ${chartW},${chartH}`}
            fill={`url(#lineGrad${priceColor === "up" ? "Up" : "Down"})`}
            stroke="none"
          />

          {/* Line */}
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={priceColor === "up" ? "var(--green)" : "var(--red)"}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            filter="url(#lineGlow)"
            opacity="0.9"
          />

          {/* Current price dashed line extending to right */}
          <line
            x1={data.length > 1 ? chartW : 0} y1={lastY}
            x2={chartW} y2={lastY}
            stroke={priceColor === "up" ? "var(--green)" : "var(--red)"}
            strokeWidth="1"
            strokeDasharray="6,4"
            opacity="0.6"
          />

          {/* Last point dot + label */}
          {points.length > 0 && (() => {
            const last = points[points.length - 1].split(",");
            const lx = parseFloat(last[0]);
            const ly = parseFloat(last[1]);
            const label = Number(prices[prices.length - 1]).toFixed(decimalPlaces);
            const tagW = Math.max(48, label.length * 8 + 16);
            const placeLeft = lx + tagW > chartW - 4;
            const tx = placeLeft ? lx - tagW - 6 : lx + 6;
            const ty = Math.min(Math.max(ly - 11, 2), chartH - 22);
            const color = priceColor === "up" ? "var(--green)" : "var(--red)";
            return (
              <g>
                <circle cx={lx} cy={ly} r="4" fill={color} />
                <rect x={tx} y={ty} width={tagW} height={22} rx="4" fill={color} />
                <text
                  x={tx + tagW / 2}
                  y={ty + 15}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="bold"
                  fill="var(--bg)"
                >
                  {label}
                </text>
              </g>
            );
          })()}

          {/* Current price label at right end of dashed line */}
          {lastPrice != null && (
            <g>
              <rect x={chartW + 2} y={lastY - 9} width="60" height="18" rx="3" fill={priceColor === "up" ? "var(--green)" : "var(--red)"} opacity="0.9" />
              <text
                x={chartW + 32} y={lastY + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="var(--bg)"
                fontFamily="JetBrains Mono, monospace"
              >
                {lastPrice.toFixed(decimalPlaces)}
              </text>
            </g>
          )}

          {/* Volume momentum bars */}
          {segs.length > 0 && segs.map((seg, i) => {
            const barW = chartW / numSegs;
            const barX = i * barW;
            const barMaxH = 40;
            const barH = (seg.total / maxSegTicks) * barMaxH;
            const barY = chartH + (barMaxH - barH);
            const isUp = seg.up >= seg.down;
            return (
              <rect
                key={`vol-${i}`}
                x={barX + 1}
                y={barY}
                width={Math.max(barW - 2, 1)}
                height={barH}
                fill={isUp ? "var(--green)" : "var(--red)"}
                opacity={0.35 + (barH / barMaxH) * 0.4}
                rx="1"
              />
            );
          })}

          {/* Time labels */}
          {timeLabels.map((tl, i) => (
            <text
              key={`time-${i}`}
              x={tl.x} y={chartH + 56}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              {tl.label}
            </text>
          ))}

          {/* Divider line between chart and volume */}
          <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="var(--border)" strokeWidth="1" opacity="0.5" />
        </svg>
      ) : (
        <div className="w-full h-64 bg-[var(--surface-dim)] rounded overflow-hidden relative">
          <div className="empty-state h-full">
            <div className="w-10 h-10 rounded-full bg-[var(--border-subtle)] shimmer mb-3" />
            <div className="skeleton skeleton-title mb-2" />
            <div className="skeleton skeleton-text w-3/4 mx-auto" />
            <p className="text-micro text-[var(--text-muted)] mt-4 tracking-wider uppercase">Awaiting Tick Data</p>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3 text-body">
        <div className="bg-[var(--surface-secondary)]/50 p-2 rounded border border-[var(--border-subtle)]">
          <span className="text-micro text-[var(--text-muted)]">High</span>
          <p className="text-white font-bold">{maxPrice.toFixed(decimalPlaces)}</p>
        </div>
        <div className="bg-[var(--surface-secondary)]/50 p-2 rounded border border-[var(--border-subtle)]">
          <span className="text-micro text-[var(--text-muted)]">Low</span>
          <p className="text-white font-bold">{minPrice.toFixed(decimalPlaces)}</p>
        </div>
        <div className="bg-[var(--surface-secondary)]/50 p-2 rounded border border-[var(--border-subtle)]">
          <span className="text-micro text-[var(--text-muted)]">Ticks</span>
          <p className="text-white font-bold">{data.length}</p>
        </div>
      </div>
    </div>
  );
}

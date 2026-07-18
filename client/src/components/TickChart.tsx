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

export default function TickChart({ symbol, maxDataPoints = 100, decimalPlaces = 3 }: TickChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [window, setWindow] = useState<number>(maxDataPoints);
  const TIMEFRAMES = [
    { label: "Fast (25)", n: 25 },
    { label: "Normal (50)", n: 50 },
    { label: "Slow (100)", n: 100 },
    { label: "Wide (250)", n: 250 },
    { label: "Ultra (500)", n: 500 },
  ];
  const TIMEFRAME_LABELS: Record<number, string> = {
    25: "Fast (25 ticks)",
    50: "Normal (50 ticks)",
    100: "Slow (100 ticks)",
    250: "Wide (250 ticks)",
    500: "Ultra (500 ticks)",
  };

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: window }, { enabled: Boolean(symbol) });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length) return;
    const hist = ticks.slice(-window).map((t) => ({
      time: new Date((t.epoch || 0) * 1000).toLocaleTimeString(),
      price: Number(t.price),
    }));
    if (hist.length) setData(hist);
  }, [historyQuery.data, symbol, window]);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceColor, setPriceColor] = useState<"up" | "down">("up");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Seed from the in-memory buffer so the chart is continuous even after
    // navigating away and back (Deriv-style persistent line).
    const buffered = derivWS.getRecentTicks(symbol, window);
    if (buffered.length) {
      setData(buffered.slice(-window).map((t) => ({
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

    // Human-friendly timeframe labels for UI
    const TIMEFRAME_LABELS = {
      25: "Fast",
      50: "Normal", 
      100: "Slow",
      250: "Wide",
      500: "Ultra",
    };

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
          ].slice(-window);
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
      onError: (err: Error) => setError(err.message),
        };

    const id = derivWS.subscribe(symbol);
    derivWS.addListener(listener);

    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(id);
    };
  }, [symbol, window]);

  const prices = data.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.001;
  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;

  const width = 800;
  const height = 280;
  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : 0;
    const y = yMax === yMin ? height / 2 : height - ((d.price - yMin) / (yMax - yMin)) * height;
    return `${x},${y}`;
  });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-3 py-2 bg-[#0B0F14] rounded border border-[#252B35]">
        <span className="text-xs font-bold text-white">{symbol}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 bg-[#151B23] rounded border border-[#252B35]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.n}
                onClick={() => setWindow(tf.n)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${window === tf.n ? "bg-[#F59E0B] text-black" : "text-[#64748B] hover:text-white"}`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <span className={`text-lg font-bold ${priceColor === "up" ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
            {currentPrice !== null ? currentPrice.toFixed(decimalPlaces) : "--"}
          </span>
        </div>
      </div>

      {/* Descriptive timeframe labels */}
      <div className="pb-2 px-3 flex items-center gap-2 text-xs text-[#64748B]">
        <span className="uppercase tracking-wider font-medium">View:</span>
        <span className="text-[#F59E0B] font-bold">{TIMEFRAME_LABELS[window] || "Custom"}</span>
        <span className="text-[#64748B]">— shows last {window} tick{window === 1 ? '' : 's'}</span>
        <span className="ml-auto text-[#64748B]/70">
          {window <= 50 ? 'Focuses on recent market dynamics' : window <= 100 ? 'Balanced view of recent activity' : 'Broader market context for trend analysis'}
        </span>
      </div>

      {error ? (
        <div className="w-full h-64 flex items-center justify-center bg-[#0B0F14] rounded border border-[#EF4444]/30">
          <p className="text-[#EF4444] text-sm">Connection Error: {error}</p>
        </div>
      ) : data.length > 1 ? (
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-[280px]">
           <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </linearGradient>
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polyline
            points={`0,${height} ${points.join(" ")} ${width},${height}`}
            fill="url(#lineGrad)"
            stroke="none"
          />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={priceColor === "up" ? "#F59E0B" : "#EF4444"}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            filter="url(#lineGlow)"
            opacity="0.95"
          />
          {points.length > 0 && (() => {
            const last = points[points.length - 1].split(",");
            const lx = parseFloat(last[0]);
            const ly = parseFloat(last[1]);
            const label = prices[prices.length - 1].toFixed(decimalPlaces);
            const tagW = Math.max(48, label.length * 8 + 16);
            const placeLeft = lx + tagW > width - 4;
            const tx = placeLeft ? lx - tagW - 6 : lx + 6;
            const ty = Math.min(Math.max(ly - 11, 2), height - 22);
            const color = priceColor === "up" ? "#F59E0B" : "#EF4444";
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
                  fill="#0B0F14"
                >
                  {label}
                </text>
              </g>
            );
          })()}
        </svg>
      ) : (
        <div className="w-full h-64 flex items-center justify-center bg-[#0B0F14] rounded border border-[#252B35]">
          <p className="text-[#64748B] text-sm">Waiting for tick data...</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="bg-[#0B0F14]/50 p-2 rounded border border-[#0B0F14]">
          <span className="text-[#64748B] text-[10px] uppercase">High</span>
          <p className="text-white font-bold">{maxPrice.toFixed(decimalPlaces)}</p>
        </div>
        <div className="bg-[#0B0F14]/50 p-2 rounded border border-[#0B0F14]">
          <span className="text-[#64748B] text-[10px] uppercase">Low</span>
          <p className="text-white font-bold">{minPrice.toFixed(decimalPlaces)}</p>
        </div>
        <div className="bg-[#0B0F14]/50 p-2 rounded border border-[#0B0F14]">
          <span className="text-[#64748B] text-[10px] uppercase">Ticks</span>
          <p className="text-white font-bold">{data.length}</p>
        </div>
      </div>
    </div>
  );
}

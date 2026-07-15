import { useState, useEffect, useRef } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";

interface ChartData {
  time: string;
  price: number;
}

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
}

export default function TickChart({ symbol, maxDataPoints = 100 }: TickChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceColor, setPriceColor] = useState<"up" | "down">("up");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setData([]);
    setCurrentPrice(null);
    setPriceColor("up");
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
          ].slice(-maxDataPoints);
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
      onConnect: () => setIsConnected(true),
      onDisconnect: () => setIsConnected(false),
    };

    const id = derivWS.subscribe(symbol);
    derivWS.addListener(listener);

    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(id);
    };
  }, [symbol, maxDataPoints]);

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
      <div className="flex items-center justify-between mb-3 px-3 py-2 bg-[#0D1117] rounded border border-[#30363D]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-[10px] text-slate-400">{isConnected ? "CONNECTED" : "DISCONNECTED"}</span>
        </div>
        <span className="text-xs font-bold text-white">{symbol}</span>
        <span className={`text-lg font-bold ${priceColor === "up" ? "text-green-500" : "text-red-500"}`}>
          {currentPrice !== null ? currentPrice.toFixed(4) : "--"}
        </span>
      </div>

      {error ? (
        <div className="w-full h-64 flex items-center justify-center bg-[#0D1117] rounded border border-red-500/30">
          <p className="text-red-500 text-sm">Connection Error: {error}</p>
        </div>
      ) : data.length > 1 ? (
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-[280px]">
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            points={`0,${height} ${points.join(" ")} ${width},${height}`}
            fill="url(#lineGrad)"
            stroke="none"
          />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={priceColor === "up" ? "#00d4ff" : "#ff4d4d"}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {points.length > 0 && (
            <circle
              cx={parseFloat(points[points.length - 1].split(",")[0])}
              cy={parseFloat(points[points.length - 1].split(",")[1])}
              r="4"
              fill={priceColor === "up" ? "#00d4ff" : "#ff4d4d"}
            />
          )}
        </svg>
      ) : (
        <div className="w-full h-64 flex items-center justify-center bg-[#0D1117] rounded border border-[#30363D]">
          <p className="text-slate-500 text-sm">Waiting for tick data...</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">High</span>
          <p className="text-white font-bold">{maxPrice.toFixed(4)}</p>
        </div>
        <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Low</span>
          <p className="text-white font-bold">{minPrice.toFixed(4)}</p>
        </div>
        <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Ticks</span>
          <p className="text-white font-bold">{data.length}</p>
        </div>
      </div>
    </div>
  );
}

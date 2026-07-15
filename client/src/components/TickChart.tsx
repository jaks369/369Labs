import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { derivWS, Tick } from "@/services/derivWebSocket";
import Sparkline from "@/components/Sparkline";

interface ChartData {
  time: string;
  price: number;
  bid?: number;
  ask?: number;
}

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
}

export default function TickChart({ symbol, maxDataPoints = 100 }: TickChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<number>(-1);

  useEffect(() => {
    setData([]);
    setError(null);
    // Subscribe to ticks
    const id = derivWS.subscribe(symbol);
    setSubscriptionId(id);

    // Create listener
    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        setData((prevData) => {
          const newData = [
            ...prevData,
            {
              time: new Date(tick.timestamp).toLocaleTimeString(),
              price: tick.price,
              bid: tick.bid,
              ask: tick.ask,
            },
          ];

          // Keep only the last maxDataPoints
          if (newData.length > maxDataPoints) {
            newData.shift();
          }

          return newData;
        });
        setError(null);
      },
      onError: (err: Error) => {
        setError(err.message);
      },
      onConnect: () => {
        setIsConnected(true);
        setError(null);
      },
      onDisconnect: () => {
        setIsConnected(false);
      },
    };

    derivWS.addListener(listener);

    // Cleanup
    return () => {
      derivWS.removeListener(listener);
      if (id > 0) {
        derivWS.unsubscribe(id);
      }
    };
  }, [symbol, maxDataPoints]);

  return (
    <div className="w-full h-full">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4 px-4 py-2 bg-[#0F1629] rounded border border-[#00FFFF]/30">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-[#00FF00]" : "bg-[#FF0000]"
            }`}
          />
          <span className="text-xs text-[#00FFFF]">
            {isConnected ? "CONNECTED" : "DISCONNECTED"}
          </span>
        </div>
        <span className="text-xs text-[#FF00FF]">{symbol}</span>
        <span className="text-xs text-[#00FFFF]">{data.length} ticks</span>
      </div>

      {/* Sparkline Quick View */}
      <div className="mb-4 px-4 py-3 bg-[#0F1629] rounded border border-[#FF00FF]/30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-[120px]">
            <span className="text-[10px] text-[#FF00FF]/70 uppercase tracking-wider">
              Current Price
            </span>
            <span
              className={`text-xl font-bold ${
                data.length > 1 &&
                data[data.length - 1].price >= data[data.length - 2].price
                  ? "text-[#00FF00]"
                  : "text-[#FF0000]"
              }`}
            >
              {data.length > 0 ? data[data.length - 1].price.toFixed(4) : "--"}
            </span>
            {data.length > 1 && (
              <span className="text-[10px] text-[#00FFFF]/60">
                {(() => {
                  const change =
                    data[data.length - 1].price - data[0].price;
                  const pct = (change / data[0].price) * 100;
                  return `${change >= 0 ? "+" : ""}${change.toFixed(4)} (${pct.toFixed(2)}%)`;
                })()}
              </span>
            )}
          </div>
          <div className="flex-1 h-[50px]">
            <Sparkline
              data={data.map((d) => ({ value: d.price }))}
              height={50}
            />
          </div>
        </div>
      </div>

      {/* Chart */}
      {error ? (
        <div className="w-full h-64 flex items-center justify-center bg-[#0F1629] rounded border border-[#FF0000]/30">
          <div className="text-center">
            <p className="text-[#FF0000] mb-2">Connection Error</p>
            <p className="text-xs text-[#FF0000]/70">{error}</p>
          </div>
        </div>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#00FFFF/20" />
            <XAxis
              dataKey="time"
              stroke="#00FFFF"
              style={{ fontSize: "12px" }}
              tick={{ fill: "#00FFFF" }}
            />
            <YAxis
              stroke="#00FFFF"
              style={{ fontSize: "12px" }}
              tick={{ fill: "#00FFFF" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0A0E27",
                border: "1px solid #00FFFF",
                borderRadius: "4px",
              }}
              labelStyle={{ color: "#FF00FF" }}
              formatter={(value: any) => value.toFixed(4)}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#00FFFF"
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
            />
            {data[data.length - 1]?.bid && (
              <Line
                type="monotone"
                dataKey="bid"
                stroke="#FF00FF"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1}
                strokeDasharray="5 5"
              />
            )}
            {data[data.length - 1]?.ask && (
              <Line
                type="monotone"
                dataKey="ask"
                stroke="#00FF00"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1}
                strokeDasharray="5 5"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-64 flex items-center justify-center bg-[#0F1629] rounded border border-[#00FFFF]/30">
          <p className="text-[#00FFFF]/60">Waiting for tick data...</p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#00FFFF]" />
          <span className="text-[#00FFFF]">Price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#FF00FF]" style={{ backgroundImage: "repeating-linear-gradient(to right, #FF00FF 0, #FF00FF 5px, transparent 5px, transparent 10px)" }} />
          <span className="text-[#FF00FF]">Bid</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#00FF00]" style={{ backgroundImage: "repeating-linear-gradient(to right, #00FF00 0, #00FF00 5px, transparent 5px, transparent 10px)" }} />
          <span className="text-[#00FF00]">Ask</span>
        </div>
      </div>
    </div>
  );
}

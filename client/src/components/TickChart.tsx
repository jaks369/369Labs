import { useState, useEffect } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import PriceChart, { PriceChartPoint } from "@/components/PriceChart";

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
  compact?: boolean;
  fillHeight?: boolean;
}

export default function TickChart({ symbol, maxDataPoints = 100, compact = false, fillHeight = false }: TickChartProps) {
  const [data, setData] = useState<PriceChartPoint[]>([]);
  const [timeframe, setTimeframe] = useState<number>(maxDataPoints || 100);
  const [error, setError] = useState<string | null>(null);
  const [decimalPlaces, setDecimalPlaces] = useState<number>(3);

  // Fetch symbol-specific decimal places from Deriv active_symbols
  useEffect(() => {
    if (!symbol) return;
    const initial = derivWS.decimalPlacesFor(symbol);
    setDecimalPlaces(initial);

    const cleanup = derivWS.onSymbols((symbols: any[]) => {
      const sym = symbols.find((s) => s.symbol === symbol);
      if (sym?.decimalPlaces != null) setDecimalPlaces(sym.decimalPlaces);
    });
    return cleanup;
  }, [symbol]);

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

  useEffect(() => {
    derivWS.markBackground(symbol);
    const buffered = derivWS.getRecentTicks(symbol, timeframe);
    if (buffered.length) {
      setData(buffered.slice(-timeframe).map((t) => ({
        time: new Date(t.timestamp).toLocaleTimeString(),
        price: t.price,
      })));
    } else {
      setData([]);
    }
    setError(null);

    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        setData((prev) => [
          ...prev,
          { time: new Date(tick.timestamp).toLocaleTimeString(), price: tick.price },
        ].slice(-Math.max(timeframe, 200)));
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

  return (
    <PriceChart
      data={data}
      error={error}
      symbol={symbol}
      decimalPlaces={decimalPlaces}
      compact={compact}
      fillHeight={fillHeight}
      timeframes={[25, 50, 100, 200]}
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
      followLabel="Return to live"
    />
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import PriceChart, { PriceChartPoint } from "@/components/PriceChart";

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
  compact?: boolean;
  fillHeight?: boolean;
}

const MAX_BUFFER = 2000;

export default function TickChart({ symbol, maxDataPoints = 100, compact = false, fillHeight = false }: TickChartProps) {
  const [timeframe, setTimeframe] = useState<number>(maxDataPoints || 100);
  const [error, setError] = useState<string | null>(null);
  const [decimalPlaces, setDecimalPlaces] = useState<number>(3);
  const [initialLoad, setInitialLoad] = useState(false);

  // Persistent buffer - only grows, never replaced
  const bufferRef = useRef<PriceChartPoint[]>([]);
  // Visible slice passed to PriceChart
  const [visibleData, setVisibleData] = useState<PriceChartPoint[]>([]);

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

  // Initial history load - prepend to buffer once
  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: maxDataPoints }, { enabled: Boolean(symbol) && !initialLoad });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length || initialLoad) return;
    const hist = ticks.slice(-maxDataPoints).map((t) => ({
      time: new Date((t.epoch || 0) * 1000).toLocaleTimeString(),
      price: Number(t.price),
    }));
    if (hist.length) {
      bufferRef.current = hist;
      setVisibleData(hist.slice(-timeframe));
      setInitialLoad(true);
    }
  }, [historyQuery.data, symbol, maxDataPoints, timeframe, initialLoad]);

  // Live subscription - append to buffer
  useEffect(() => {
    if (!symbol || !initialLoad) return;
    derivWS.markBackground(symbol);
    
    // Prepend buffered ticks from derivWS (older ticks) if buffer is small
    const buffered = derivWS.getRecentTicks(symbol, maxDataPoints);
    if (buffered.length && bufferRef.current.length < maxDataPoints) {
      const hist = buffered.slice(-maxDataPoints).map((t) => ({
        time: new Date(t.timestamp).toLocaleTimeString(),
        price: t.price,
      }));
      bufferRef.current = [...hist, ...bufferRef.current].slice(-MAX_BUFFER);
      setVisibleData(bufferRef.current.slice(-timeframe));
    }
    setError(null);

    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        const point = { time: new Date(tick.timestamp).toLocaleTimeString(), price: tick.price };
        bufferRef.current = [...bufferRef.current, point].slice(-MAX_BUFFER);
        // Only update visibleData if we're at live edge (PriceChart handles viewport)
        // We always update so PriceChart gets fresh data for its calculations
        setVisibleData([...bufferRef.current].slice(-timeframe));
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
  }, [symbol, timeframe, initialLoad]);

  // Update visible slice when timeframe changes
  useEffect(() => {
    if (bufferRef.current.length) {
      setVisibleData(bufferRef.current.slice(-timeframe));
    }
  }, [timeframe]);

  // Reset on symbol change
  useEffect(() => {
    bufferRef.current = [];
    setVisibleData([]);
    setInitialLoad(false);
    setError(null);
  }, [symbol]);

  return (
    <PriceChart
      data={visibleData}
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
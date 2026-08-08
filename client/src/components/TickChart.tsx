import { useState, useEffect, useRef, useCallback } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import PriceChart, { PriceChartPoint } from "@/components/PriceChart";

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
  decimalPlaces?: number; // ignored - fetched from Deriv active_symbols
  compact?: boolean;
  fillHeight?: boolean;
}

const MAX_BUFFER = 2000;

// Module-level rolling cache so price history survives page navigation without
// restarting from scratch. Keyed by symbol, capped at MAX_BUFFER points; once
// full the oldest point is dropped and the new one appended (a running window,
// never a restart). TickChart consumers all share this so switching pages and
// back keeps the exact same rolling history instead of re-fetching a stale
// server snapshot that looks like it "starts from 1" every time.
const rollingCache = new Map<string, PriceChartPoint[]>();

export default function TickChart({ symbol, maxDataPoints = 100, compact = false, fillHeight = false }: TickChartProps) {
  const [timeframe, setTimeframe] = useState<number>(maxDataPoints || 100);
  const [error, setError] = useState<string | null>(null);
  const [decimalPlaces, setDecimalPlaces] = useState<number>(3);
  const [initialLoad, setInitialLoad] = useState(false);

  // Visible buffer handed to PriceChart. Seeded from the module-level rolling
  // cache (and derivWS's live tick buffer) so reopening the page continues the
  // running window instead of restarting.
  const [visibleData, setVisibleData] = useState<PriceChartPoint[]>([]);

  // Working buffer (mirrors the module-level rolling cache)
  const bufferRef = useRef<PriceChartPoint[]>([]);

  const toPoints = useCallback((ticks: any[]): PriceChartPoint[] =>
    ticks
      .filter((t) => t && t.price != null)
      .map((t) => ({
        time: new Date((t.epoch || 0) * 1000 || (t.timestamp || Date.now())).toLocaleTimeString(),
        price: Number(t.price),
      })),
  []);

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

  // Seed from the persistent rolling cache when available so history does not
  // restart on page navigation. Fall back to a one-time server history fetch
  // only when there is nothing cached yet (first visit). Also resets local
  // state on symbol change.
  useEffect(() => {
    bufferRef.current = [];
    setVisibleData([]);
    setInitialLoad(false);
    setError(null);
    const cached = rollingCache.get(symbol);
    if (cached && cached.length) {
      bufferRef.current = cached;
      setVisibleData(cached.slice(-timeframe));
      setInitialLoad(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Initial history load - prepend to buffer once (only when nothing cached)
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
      rollingCache.set(symbol, hist);
      setVisibleData(hist.slice(-timeframe));
      setInitialLoad(true);
    }
  }, [historyQuery.data, symbol, maxDataPoints, timeframe, initialLoad]);

  // Live subscription - append to buffer, rolling window (never restarts)
  useEffect(() => {
    if (!symbol || !initialLoad) return;
    derivWS.markBackground(symbol);

    // If the live service buffer has newer ticks than our cache, adopt them so
    // the rolling window stays contiguous across navigation.
    const buffered = derivWS.getRecentTicks(symbol, MAX_BUFFER);
    if (buffered.length > bufferRef.current.length) {
      const hist = toPoints(buffered);
      if (hist.length) {
        bufferRef.current = hist.slice(-MAX_BUFFER);
        rollingCache.set(symbol, bufferRef.current);
        setVisibleData(bufferRef.current.slice(-timeframe));
      }
    }
    setError(null);

    const listener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        const point = { time: new Date(tick.timestamp).toLocaleTimeString(), price: tick.price };
        bufferRef.current = [...bufferRef.current, point].slice(-MAX_BUFFER);
        rollingCache.set(symbol, bufferRef.current);
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
  }, [symbol, timeframe, initialLoad, toPoints]);

  // Update visible slice when timeframe changes
  useEffect(() => {
    if (bufferRef.current.length) {
      setVisibleData(bufferRef.current.slice(-timeframe));
    }
  }, [timeframe]);

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
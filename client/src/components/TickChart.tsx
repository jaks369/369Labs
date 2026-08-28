import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { derivWS, Tick } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import PriceChart, { PriceChartPoint, TIMEFRAME_OPTIONS, type AnalysisMarker, type TimeframeOption } from "@/components/PriceChart";

interface TickChartProps {
  symbol: string;
  maxDataPoints?: number;
  decimalPlaces?: number;
  compact?: boolean;
  fillHeight?: boolean;
  connected?: boolean;
  markers?: AnalysisMarker[];
}

const MAX_BUFFER = 2000;
const HISTORY_LIMIT = 500;
const rollingCache = new Map<string, PriceChartPoint[]>();

/** Aggregate ticks into OHLC candles at the given interval. */
function aggregateCandles(ticks: PriceChartPoint[], intervalSec: number): { epoch: number; open: number; high: number; low: number; close: number }[] {
  if (!ticks.length) return [];
  const buckets = new Map<number, { open: number; high: number; low: number; close: number }>();
  for (const t of ticks) {
    const key = Math.floor(t.epoch / intervalSec) * intervalSec;
    const existing = buckets.get(key);
    if (existing) {
      existing.high = Math.max(existing.high, t.price);
      existing.low = Math.min(existing.low, t.price);
      existing.close = t.price;
    } else {
      buckets.set(key, { open: t.price, high: t.price, low: t.price, close: t.price });
    }
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([epoch, bar]) => ({ epoch, ...bar }));
}

export default function TickChart({ symbol, maxDataPoints = 100, compact = false, fillHeight = false, connected = true, markers }: TickChartProps) {
  const [timeframe, setTimeframe] = useState<number>(maxDataPoints || 100);
  const [error, setError] = useState<string | null>(null);
  const [decimalPlaces, setDecimalPlaces] = useState<number>(3);
  const [initialLoad, setInitialLoad] = useState(false);

  const [visibleData, setVisibleData] = useState<PriceChartPoint[]>([]);
  const bufferRef = useRef<PriceChartPoint[]>([]);

  // Time-based candle state — always active for all symbols
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeOption>(TIMEFRAME_OPTIONS[1]); // default 5m

  // Fetch real OHLC candles from Deriv (works for forex, crypto, AND synthetic)
  const candleQuery = trpc.market.getCandles.useQuery(
    { symbol, granularity: activeTimeframe.granularity, count: activeTimeframe.count },
    { enabled: Boolean(symbol) && connected, refetchInterval: 30000 }
  );

  const serverCandles = candleQuery.data?.candles || [];

  const toPoints = useCallback((ticks: any[]): PriceChartPoint[] =>
    ticks
      .filter((t) => t && t.price != null)
      .map((t) => {
        const epochSec = t.epoch || Math.floor((t.timestamp || Date.now()) / 1000);
        return {
          epoch: epochSec,
          time: new Date(epochSec * 1000).toISOString().slice(11, 19),
          price: Number(t.price),
        };
      }),
  []);

  // Fetch symbol-specific decimal places
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

  // Seed from persistent rolling cache on symbol change
  useEffect(() => {
    bufferRef.current = [];
    setVisibleData([]);
    setInitialLoad(false);
    setError(null);
    if (connected) {
      const cached = rollingCache.get(symbol);
      if (cached && cached.length) {
        bufferRef.current = cached;
        setVisibleData(cached.slice(-MAX_BUFFER));
        setInitialLoad(true);
      }
    }
  }, [symbol, connected]);

  // Initial history load
  const historyQuery = trpc.market.getHistory.useQuery(
    { symbol, limit: HISTORY_LIMIT },
    { enabled: Boolean(symbol) && !initialLoad && connected }
  );
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length || initialLoad) return;
    const hist = ticks.slice(-MAX_BUFFER).map((t) => {
      const epochSec = t.epoch || Math.floor((t.timestamp || Date.now()) / 1000);
      return {
        epoch: epochSec,
        time: new Date(epochSec * 1000).toISOString().slice(11, 19),
        price: Number(t.price),
      };
    });
    if (hist.length) {
      bufferRef.current = hist;
      rollingCache.set(symbol, hist);
      setVisibleData(hist.slice(-MAX_BUFFER));
      setInitialLoad(true);
    }
  }, [historyQuery.data, symbol, maxDataPoints, timeframe, initialLoad]);

  // Live tick subscription — always runs so we have real-time data
  useEffect(() => {
    if (!symbol || !initialLoad) return;
    derivWS.markBackground(symbol);

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
        const point = {
          epoch: Math.floor(new Date(tick.timestamp).getTime() / 1000),
          time: new Date(tick.timestamp).toISOString().slice(11, 19),
          price: tick.price,
        };
        bufferRef.current = [...bufferRef.current, point].slice(-MAX_BUFFER);
        rollingCache.set(symbol, bufferRef.current);
        setVisibleData([...bufferRef.current].slice(-MAX_BUFFER));
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

  // Update visible window when timeframe changes
  useEffect(() => {
    if (bufferRef.current.length) {
      setVisibleData(bufferRef.current.slice(-MAX_BUFFER));
    }
  }, [timeframe]);

  const handleTimeframeOptionChange = useCallback((opt: TimeframeOption) => {
    setActiveTimeframe(opt);
  }, []);

  // Use server candles if available, otherwise aggregate from live ticks
  const candles = useMemo(() => {
    if (serverCandles.length > 0) return serverCandles;
    return aggregateCandles(bufferRef.current, activeTimeframe.granularity);
  }, [serverCandles, bufferRef.current.length, activeTimeframe.granularity]);

  return (
    <PriceChart
      data={visibleData}
      candles={candles.length > 0 ? candles : undefined}
      error={error}
      symbol={symbol}
      decimalPlaces={decimalPlaces}
      compact={compact}
      fillHeight={fillHeight}
      defaultMode="candle"
      timeframeOptions={TIMEFRAME_OPTIONS}
      activeTimeframe={activeTimeframe}
      onTimeframeOptionChange={handleTimeframeOptionChange}
      maxBars={MAX_BUFFER}
      followLabel="Return to live"
      markers={markers}
    />
  );
}

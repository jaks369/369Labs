import React, { useEffect, useState, useRef } from "react";
import { derivWS, Tick, TickStreamListener } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";

interface DigitStatsProps {
  symbol: string;
  decimalPlaces?: number;
  maxTicks?: number;
}

export default function DigitStats({ symbol, decimalPlaces = derivWS.decimalPlacesFor(symbol), maxTicks = 100 }: DigitStatsProps) {
  const [digits, setDigits] = useState<number[]>([]);
  // The most recent last digit - drives the live pointer.
  const [currentDigit, setCurrentDigit] = useState<number | null>(null);
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  const selectedDigitRef = useRef<number | null>(null);
  const [stats, setStats] = useState({
    even: 0,
    odd: 0,
    over: 0,
    under: 0,
    counts: Array(10).fill(0),
  });

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: 500 }, { enabled: Boolean(symbol) });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length) return;
    // DB returns newest-first; reverse to chronological (oldest-first) so live
    // ticks append in order and the history is continuous across logins.
    const hist = ticks.map((t) => t.lastDigit).filter((d) => d >= 0 && d <= 9).reverse();
    if (hist.length) setDigits(hist.slice(-maxTicks));
  }, [historyQuery.data, symbol, maxTicks]);

  // Recompute Over/Under immediately when the selected digit changes, so the
  // bars/labels update without waiting for the next tick.
  useEffect(() => {
    setDigits((prev) => {
      const next = prev.slice(-maxTicks);
      let over = 0, under = 0;
      next.forEach((d) => { if (d > selectedDigit) over++; else if (d < selectedDigit) under++; });
      const len = next.length || 1;
      setStats((s) => ({ ...s, over: (over / len) * 100, under: (under / len) * 100 }));
      return prev;
    });
  }, [selectedDigit, maxTicks]);

  useEffect(() => {
    const listener: TickStreamListener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;

        const fixed = tick.price.toFixed(decimalPlaces);
        const lastDigit = parseInt(fixed[fixed.length - 1], 10);
        setCurrentDigit(lastDigit);
        setDigits((prev) => {
          const next = [...prev, lastDigit].slice(-maxTicks);

          const counts = Array(10).fill(0);
          let even = 0, odd = 0, over = 0, under = 0;

          next.forEach((d) => {
            counts[d]++;
            if (d % 2 === 0) even++; else odd++;
            const th = selectedDigitRef.current !== null ? selectedDigitRef.current : 5;
            if (d > th) over++;
            else if (d < th) under++;
          });

          setStats({
            even: next.length ? (even / next.length) * 100 : 0,
            odd: next.length ? (odd / next.length) * 100 : 0,
            over: next.length ? (over / next.length) * 100 : 0,
            under: next.length ? (under / next.length) * 100 : 0,
            counts: counts.map((c) => (next.length ? (c / next.length) * 100 : 0)),
          });

          return next;
        });
      },
    };

    derivWS.addListener(listener);
    const subId = derivWS.subscribe(symbol);

    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(subId);
    };
  }, [symbol, decimalPlaces, maxTicks]);

  const maxPercent = Math.max(...stats.counts, 1);
  // Derive Over/Under live from the current digits array so they always reflect
  // the latest ticks (not just when onTick fires).
  const th = selectedDigit;
  let _over = 0, _under = 0;
  digits.forEach((d) => { if (d > th) _over++; else if (d < th) _under++; });
  const _len = digits.length || 1;
  const overPct = (_over / _len) * 100;
  const underPct = (_under / _len) * 100;
  const maxIdx = stats.counts.indexOf(Math.max(...stats.counts));
  const minIdx = stats.counts.indexOf(Math.min(...stats.counts));
  const hasData = stats.counts.some((c) => c > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Even</span>
            <span className="text-emerald-500">{stats.even.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${stats.even}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Odd</span>
            <span className="text-blue-500">{stats.odd.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${stats.odd}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Over {selectedDigit ?? 5}</span>
            <span className="text-purple-500">{overPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${overPct}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Under {selectedDigit ?? 5}</span>
            <span className="text-orange-500">{underPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${underPct}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 p-4 rounded border border-slate-800">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Digit Frequency (Last {maxTicks} Ticks)</h4>
        <div className="flex items-end justify-between h-28 gap-0.5 overflow-x-auto">
          {stats.counts.map((percent, i) => (
            <div key={i} onClick={() => { setSelectedDigit(i); selectedDigitRef.current = i; }} className={`flex-1 flex flex-col items-center gap-2 cursor-pointer ${selectedDigit === i ? "ring-1 ring-amber-400 rounded" : ""}`}>
              <span className={`text-[7px] font-bold ${hasData && i === maxIdx ? "text-emerald-400" : hasData && i === minIdx ? "text-red-400" : "text-slate-400"}`}>{percent.toFixed(1)}%</span>
              <div className="w-full rounded-t-sm relative group cursor-pointer" style={{ height: `${(percent / maxPercent) * 100}%`, background: hasData && i === maxIdx ? "rgba(16,185,129,0.25)" : hasData && i === minIdx ? "rgba(239,68,68,0.25)" : "rgba(37,99,235,0.2)" }}>
                <div className={`absolute inset-0 rounded-t-sm transition-opacity ${i === currentDigit ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`} style={{ height: `${percent}%`, background: i === currentDigit ? "#f59e0b" : hasData && i === maxIdx ? "#10b981" : hasData && i === minIdx ? "#ef4444" : "#3b82f6" }} />
                {i === currentDigit && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-amber-400 text-[10px] leading-none">▼</div>
                )}
              </div>
              <span className={`text-[9px] font-bold ${i === currentDigit ? "text-amber-400" : "text-slate-300"}`}>{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

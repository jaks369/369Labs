import React, { useEffect, useState, useRef } from "react";
import { derivWS, Tick, TickStreamListener } from "@/services/derivWebSocket";

interface DigitStatsProps {
  symbol: string;
  decimalPlaces?: number;
  maxTicks?: number;
}

export default function DigitStats({ symbol, decimalPlaces = 2, maxTicks = 100 }: DigitStatsProps) {
  const [digits, setDigits] = useState<number[]>([]);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  const selectedDigitRef = useRef<number | null>(null);
  const [stats, setStats] = useState({
    even: 0,
    odd: 0,
    over: 0,
    under: 0,
    counts: Array(10).fill(0),
  });

  useEffect(() => {
    const listener: TickStreamListener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;

        const fixed = tick.price.toFixed(decimalPlaces);
        const lastDigit = parseInt(fixed[fixed.length - 1], 10);
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
            <span className="text-purple-500">{stats.over.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${stats.over}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Under {selectedDigit ?? 5}</span>
            <span className="text-orange-500">{stats.under.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${stats.under}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 p-4 rounded border border-slate-800">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Digit Frequency (Last {maxTicks} Ticks)</h4>
        <div className="flex items-end justify-between h-28 gap-0.5 overflow-x-auto">
          {stats.counts.map((percent, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[7px] font-bold text-slate-400">{percent.toFixed(1)}%</span>
              <div onClick={() => { const next = selectedDigit === i ? null : i; setSelectedDigit(next); selectedDigitRef.current = next; }} className="w-full bg-blue-600/20 rounded-t-sm relative group cursor-pointer" style={{ height: `${(percent / maxPercent) * 100}%` }}>
                <div className="absolute inset-0 bg-blue-500 opacity-60 group-hover:opacity-100 transition-opacity rounded-t-sm" style={{ height: `${percent}%` }} />
              </div>
              <span className="text-[9px] font-bold text-slate-300">{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

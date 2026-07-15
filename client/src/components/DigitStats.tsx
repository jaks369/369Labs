import React, { useEffect, useState } from "react";
import { derivWS, Tick, TickStreamListener } from "@/services/derivWebSocket";

interface DigitStatsProps {
  symbol: string;
  decimalPlaces?: number;
}

export default function DigitStats({ symbol, decimalPlaces = 2 }: DigitStatsProps) {
  const [digits, setDigits] = useState<number[]>([]);
  const [stats, setStats] = useState({
    even: 0,
    odd: 0,
    over5: 0,
    under5: 0,
    counts: Array(10).fill(0),
  });

  useEffect(() => {
    const listener: TickStreamListener = {
      onTick: (tick: Tick) => {
        if (tick.symbol !== symbol) return;
        
        const fixed = tick.price.toFixed(decimalPlaces);
        const lastDigit = parseInt(fixed[fixed.length - 1], 10);
        setDigits((prev) => {
          const next = [...prev, lastDigit].slice(-100);
          
          const counts = Array(10).fill(0);
          let even = 0, odd = 0, over5 = 0, under5 = 0;
          
          next.forEach((d) => {
            counts[d]++;
            if (d % 2 === 0) even++; else odd++;
            if (d >= 4) over5++; else under5++;
          });
          
          setStats({
            even: (even / next.length) * 100,
            odd: (odd / next.length) * 100,
            over5: (over5 / next.length) * 100,
            under5: (under5 / next.length) * 100,
            counts: counts.map((c) => (c / next.length) * 100),
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
  }, [symbol, decimalPlaces]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Even</span>
            <span className="text-emerald-500">{stats.even.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${stats.even}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Odd</span>
            <span className="text-blue-500">{stats.odd.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${stats.odd}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Over 4</span>
            <span className="text-purple-500">{stats.over5.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${stats.over5}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Under 5</span>
            <span className="text-orange-500">{stats.under5.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${stats.under5}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 p-4 rounded border border-slate-800">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Digit Frequency (Last 100 Ticks)</h4>
        <div className="flex items-end justify-between h-24 gap-1">
          {stats.counts.map((percent, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full bg-blue-600/20 rounded-t-sm relative group" style={{ height: `${percent * 2}px` }}>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  {percent.toFixed(0)}%
                </div>
                <div className="absolute inset-0 bg-blue-500 opacity-40 group-hover:opacity-100 transition-opacity rounded-t-sm" />
              </div>
              <span className="text-[10px] font-bold text-slate-600">{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

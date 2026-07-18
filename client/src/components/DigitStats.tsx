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
  const [selectedDigit, setSelectedDigit] = useState<number | null>(5);
  const [stats, setStats] = useState({
    even: 0,
    odd: 0,
    counts: Array(10).fill(0),
  });

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: 500 }, { enabled: Boolean(symbol) });
  useEffect(() => {
    const ticks = historyQuery.data?.ticks;
    if (!ticks || !ticks.length) return;
    const hist = ticks.map((t) => t.lastDigit).filter((d) => d >= 0 && d <= 9).reverse();
    if (hist.length) setDigits(hist.slice(-maxTicks));
  }, [historyQuery.data, symbol, maxTicks]);

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
          let even = 0, odd = 0;

          next.forEach((d) => {
            counts[d]++;
            if (d % 2 === 0) even++; else odd++;
          });

          setStats({
            even: next.length ? (even / next.length) * 100 : 0,
            odd: next.length ? (odd / next.length) * 100 : 0,
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
  // Over/Under are computed against the selected barrier digit (0-9).
  // Over = last digit strictly greater than barrier, Under = strictly less.
  // Percentages are conditional (over / (over + under)) so they always sum to 100%.
  const th = selectedDigit;
  let _over = 0, _under = 0;
  digits.forEach((d) => { if (th !== null) { if (d > th) _over++; else if (d < th) _under++; } });
  const _denom = _over + _under;
  const overPct = _denom ? (_over / _denom) * 100 : 0;
  const underPct = _denom ? (_under / _denom) * 100 : 0;
  const maxIdx = stats.counts.indexOf(Math.max(...stats.counts));
  const minIdx = stats.counts.indexOf(Math.min(...stats.counts));
  const hasData = stats.counts.some((c) => c > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#151B23]/50 p-3 rounded border border-[#151B23]">
          <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-2 uppercase">
            <span>Even</span>
            <span className="text-[#22C55E]">{stats.even.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#151B23] rounded-full overflow-hidden">
            <div className="h-full bg-[#22C55E] transition-all duration-300" style={{ width: `${stats.even}%` }} />
          </div>
        </div>
        <div className="bg-[#151B23]/50 p-3 rounded border border-[#151B23]">
          <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-2 uppercase">
            <span>Odd</span>
            <span className="text-[#F59E0B]">{stats.odd.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#151B23] rounded-full overflow-hidden">
            <div className="h-full bg-[#F59E0B] transition-all duration-300" style={{ width: `${stats.odd}%` }} />
          </div>
        </div>
        <div className="bg-[#151B23]/50 p-3 rounded border border-[#151B23]">
          <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-2 uppercase">
            <span>Over {th !== null ? th : "—"}</span>
            <span className="text-[#F59E0B]">{overPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#151B23] rounded-full overflow-hidden">
            <div className="h-full bg-[#F59E0B] transition-all duration-300" style={{ width: `${overPct}%` }} />
          </div>
        </div>
        <div className="bg-[#151B23]/50 p-3 rounded border border-[#151B23]">
          <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-2 uppercase">
            <span>Under {th !== null ? th : "—"}</span>
            <span className="text-[#F59E0B]">{underPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#151B23] rounded-full overflow-hidden">
            <div className="h-full bg-[#F59E0B] transition-all duration-300" style={{ width: `${underPct}%` }} />
          </div>
        </div>
      </div>

      {th === null && (
        <p className="text-[10px] text-[#64748B] mb-2">Click a digit above to set the Over/Under barrier.</p>
      )}
      <div className="bg-[#151B23]/50 p-4 rounded border border-[#151B23]">
        <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-4">Digit Frequency (Last {maxTicks} Ticks)</h4>
        <div className="flex items-end justify-between h-28 gap-0.5 overflow-x-auto">
          {stats.counts.map((percent, i) => (
            <div key={i} onClick={() => { setSelectedDigit(i); }} className={`flex-1 flex flex-col items-center gap-2 cursor-pointer ${selectedDigit === i ? "ring-1 ring-[#F59E0B] rounded" : ""}`}>
              <span className={`text-[7px] font-bold ${hasData && i === maxIdx ? "text-[#22C55E]" : hasData && i === minIdx ? "text-[#EF4444]" : "text-[#94A3B8]"}`}>{percent.toFixed(1)}%</span>
              <div className="w-full rounded-t-sm relative group cursor-pointer" style={{ height: `${(percent / maxPercent) * 100}%`, background: hasData && i === maxIdx ? "rgba(16,185,129,0.25)" : hasData && i === minIdx ? "rgba(239,68,68,0.25)" : "rgba(37,99,235,0.2)" }}>
                <div className={`absolute inset-0 rounded-t-sm transition-opacity ${i === currentDigit ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`} style={{ height: `${percent}%`, background: i === currentDigit ? "#F59E0B" : hasData && i === maxIdx ? "#22C55E" : hasData && i === minIdx ? "#ef4444" : "#F59E0B" }} />
                {i === currentDigit && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[#F59E0B] text-[10px] leading-none">▼</div>
                )}
              </div>
              <span className={`text-[9px] font-bold ${i === currentDigit ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { derivWS } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import { lastDigitOf } from "@shared/lastDigit";

function DigitCircle({ digit, percent, isCurrent, maxPercent }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const frac = maxPercent > 0 ? percent / maxPercent : 0;
  const arcLen = frac * circ;
  const offset = circ - arcLen;

  const color = percent >= 11.5 ? "var(--green)" : percent >= 10.0 ? "var(--accent)" : "var(--red)";
  const dotColor = isCurrent ? "var(--accent)" : percent >= 11.5 ? "var(--green)" : percent >= 10.0 ? "var(--accent)" : "var(--red)";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-10 h-10 flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0">
          <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
          <motion.circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
            transform="rotate(-90 20 20)"
          />
        </svg>
        <motion.span className="text-xs font-bold font-mono relative z-10" animate={{ color: dotColor }} transition={{ duration: 0.3 }}>
          {digit}
        </motion.span>
        <AnimatePresence>
          {isCurrent && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-[var(--accent)] leading-none"
            >
              ▼
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.span
        className="text-[9px] font-mono tabular-nums"
        animate={{ color: isCurrent ? "var(--accent)" : "var(--text-secondary)" }}
        transition={{ duration: 0.3 }}
      >
        {percent.toFixed(1)}%
      </motion.span>
    </div>
  );
}

export default function DigitProbability({ symbol, decimalPlaces, maxTicks = 100 }) {
  const [digits, setDigits] = useState([]);
  const [currentDigit, setCurrentDigit] = useState(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  const decPlaces = decimalPlaces ?? derivWS.decimalPlacesFor(symbol);

  const historyQuery = trpc.market.getHistory.useQuery({ symbol, limit: 500 }, { enabled: Boolean(symbol) });

  // Seed from the live tick buffer first (derivWS keeps up to 2000 rolling
  // ticks per subscribed symbol), so the window is never a tiny handful of
  // digits. Only fall back to the history query when the buffer is empty.
  useEffect(() => {
    const buffered = derivWS.getRecentTicks(symbol, maxTicks);
    const bufDigits = buffered.map((t) => lastDigitOf(Number(t.price), decPlaces)).filter((d) => d >= 0 && d <= 9);
    if (bufDigits.length) {
      setDigits((prev) => (prev.length ? prev : bufDigits));
      return;
    }
    const hist = (historyQuery.data?.ticks || []).map((t) => t.lastDigit).filter((d) => d >= 0 && d <= 9);
    if (hist.length) setDigits(hist.slice(-maxTicks));
  }, [historyQuery.data, symbol, maxTicks, decPlaces]);

  useEffect(() => {
    const listener = {
      onTick: (tick) => {
        if (tick.symbol !== symbol) return;
        const lastDigit = lastDigitOf(Number(tick.price), decPlaces);
        setCurrentDigit(lastDigit);
        setDigits((prev) => [...prev, lastDigit].slice(-maxTicks));

        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlash(tick.price > (window.__lastPrice?.[symbol] ?? tick.price) ? "up" : "down");
        window.__lastPrice = { ...window.__lastPrice, [symbol]: tick.price };
        flashTimer.current = setTimeout(() => setFlash(null), 400);
      },
    };
    derivWS.addListener(listener);
    const subId = derivWS.subscribe(symbol);
    return () => {
      derivWS.removeListener(listener);
      derivWS.unsubscribe(subId);
    };
  }, [symbol, decPlaces, maxTicks]);

  const counts = useMemo(() => {
    const c = Array(10).fill(0);
    digits.forEach((d) => c[d]++);
    return c;
  }, [digits]);

  const percents = useMemo(() => {
    const total = digits.length || 1;
    return counts.map((c) => (c / total) * 100);
  }, [counts, digits.length]);

  const maxPercent = Math.max(...percents, 1);

  return (
    <div
      className="p-4 rounded-xl border transition-colors duration-300"
      style={{
        borderColor: flash === "up" ? "var(--green)" : flash === "down" ? "var(--red)" : "var(--border)",
        background:
          flash === "up"
            ? "color-mix(in srgb, var(--green) 6%, transparent)"
            : flash === "down"
              ? "color-mix(in srgb, var(--red) 6%, transparent)"
              : "var(--card)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest">Digit Frequency (Last {digits.length || 0} ticks)</h4>
        <motion.span
          className="text-[9px] font-mono px-2 py-0.5 rounded"
          animate={{
            background:
              flash === "up"
                ? "color-mix(in srgb, var(--green) 20%, transparent)"
                : flash === "down"
                  ? "color-mix(in srgb, var(--red) 20%, transparent)"
                  : "transparent",
            color: flash === "up" ? "var(--green)" : flash === "down" ? "var(--red)" : "var(--text-muted)",
          }}
        >
          {flash === "up" ? "▲" : flash === "down" ? "▼" : "—"}
        </motion.span>
      </div>
      <div className="grid grid-cols-5 gap-y-2 gap-x-1 justify-items-center">
        {percents.map((pct, i) => (
          <DigitCircle key={i} digit={i} percent={pct} isCurrent={currentDigit === i} maxPercent={maxPercent} />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import LiveValue from "./LiveValue";
import { getSymbolDisplayName } from "@/lib/symbols";

export default function LiveTick({ symbol, price, change, changePercent, direction, decimalPlaces = 2, compact = false }) {
  const prevPriceRef = useRef(price);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    if (prevPriceRef.current !== price && prevPriceRef.current != null) {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlash(direction || (price > prevPriceRef.current ? "up" : "down"));
      flashTimer.current = setTimeout(() => setFlash(null), 500);
    }
    prevPriceRef.current = price;
  }, [price, direction]);

  const isUp = flash === "up";
  const isDown = flash === "down";
  const arrow = isUp ? "▲" : isDown ? "▼" : "—";

  if (compact) {
    return (
      <motion.span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-mono tabular-nums"
        animate={{
          color: isUp ? "var(--green)" : isDown ? "var(--red)" : "var(--text-secondary)",
          background: isUp ? "color-mix(in srgb, var(--green) 12%, transparent)" : isDown ? "color-mix(in srgb, var(--red) 12%, transparent)" : "transparent",
        }}
        transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
      >
        <span>{arrow}</span>
        <LiveValue value={price} format={(v) => Number(v).toFixed(decimalPlaces)} springConfig={{ stiffness: 120, damping: 25 }} />
      </motion.span>
    );
  }

  return (
    <motion.div
      className="flex items-center justify-between px-3 py-2 rounded-lg border transition-colors"
      animate={{
        borderColor: isUp ? "rgba(var(--green-rgb), 0.3)" : isDown ? "rgba(var(--red-rgb), 0.3)" : "var(--border)",
        background: isUp ? "rgba(var(--green-rgb), 0.06)" : isDown ? "rgba(var(--red-rgb), 0.06)" : "transparent",
      }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white">{getSymbolDisplayName(symbol)}</span>
        <span className="text-xs font-mono tabular-nums text-white">
          <LiveValue value={price} format={(v) => Number(v).toFixed(decimalPlaces)} springConfig={{ stiffness: 120, damping: 25 }} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <motion.span
          className="text-micro font-mono tabular-nums"
          animate={{ color: isUp ? "var(--green)" : isDown ? "var(--red)" : "var(--text-muted)" }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={arrow}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              {arrow} {change != null ? (change >= 0 ? "+" : "") + Number(change).toFixed(decimalPlaces) : ""}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        {changePercent != null && (
          <motion.span
            className="text-[9px] px-1.5 py-0.5 rounded font-mono tabular-nums"
            animate={{
              color: isUp ? "var(--green)" : isDown ? "var(--red)" : "var(--text-muted)",
              background: isUp ? "rgba(var(--green-rgb), 0.15)" : isDown ? "rgba(var(--red-rgb), 0.15)" : "transparent",
            }}
          >
            {changePercent >= 0 ? "+" : ""}{Number(changePercent).toFixed(2)}%
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

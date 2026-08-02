import { useEffect, useRef, useState } from "react";
import { useSpring, useMotionValue, useMotionValueEvent } from "motion/react";

function getPulseColor(variant, current, prev) {
  if (variant === "positive") return current >= prev ? "var(--green)" : "var(--red)";
  if (variant === "always-positive") return "var(--green)";
  if (variant === "always-negative") return "var(--red)";
  return "var(--accent)";
}

export default function LiveValue({
  value,
  format = (v) => v,
  variant = "neutral",
  springConfig = { stiffness: 100, damping: 30, precision: 0.01 },
  stale = false,
  pulseDuration = 500,
  className = "",
  style,
  ...props
}) {
  const prevRef = useRef(value);
  const [display, setDisplay] = useState(format(value));
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, springConfig);

  useMotionValueEvent(spring, "change", (v) => setDisplay(format(v)));

  useEffect(() => { motionValue.set(value); }, [value, motionValue]);

  const [pulse, setPulse] = useState(null);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      const color = getPulseColor(variant, value, prevRef.current);
      setPulse(color);
      prevRef.current = value;
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulse(null), pulseDuration);
    }
    return () => { if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current); };
  }, [value, variant, pulseDuration]);

  return (
    <span
      style={{
        color: pulse || undefined,
        fontVariantNumeric: "tabular-nums",
        transition: "color 0.3s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.6s cubic-bezier(0.19, 1, 0.22, 1)",
        opacity: stale ? 0.5 : 1,
        ...style,
      }}
      className={className}
      {...props}
    >
      {display}
    </span>
  );
}

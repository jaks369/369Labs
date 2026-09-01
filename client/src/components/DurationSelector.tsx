import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { isSyntheticIndexSymbol } from "@shared/symbols";

export type DurationUnit = "t" | "s" | "m" | "h" | "d";

export interface DurationOption {
  unit: DurationUnit;
  label: string;
  /** Suggested value picked when the user switches to this unit. */
  default: number;
  /** Bounds for the value stepper clamp. */
  min: number;
  max: number;
  /** Good quick-start values shown under the input. */
  quick: number[];
}

export const DURATION_OPTIONS: DurationOption[] = [
  { unit: "t", label: "Ticks", default: 5, min: 1, max: 10, quick: [1, 3, 5, 10] },
  { unit: "s", label: "Seconds", default: 60, min: 1, max: 3600, quick: [30, 60, 120, 300] },
  { unit: "m", label: "Minutes", default: 5, min: 1, max: 1440, quick: [1, 5, 15, 60] },
  { unit: "h", label: "Hours", default: 1, min: 1, max: 48, quick: [1, 2, 4, 8] },
  { unit: "d", label: "Days", default: 1, min: 1, max: 365, quick: [1, 2, 5, 7] },
];

export function unitLabel(unit: DurationUnit): string {
  return DURATION_OPTIONS.find((o) => o.unit === unit)?.label || unit.toUpperCase();
}

interface DurationSelectorProps {
  value: number;
  unit: DurationUnit;
  onChange: (value: number, unit: DurationUnit) => void;
  /** Fallback shown when no unit is set yet (derived from props by parent). */
  compact?: boolean;
  /**
   * When set, units that Deriv doesn't offer for this symbol are hidden.
   * Synthetic indices offer tick + time durations; forex/crypto/stock indices
   * are time-only (ticks would be rejected by Deriv).
   */
  symbol?: string;
}

export default function DurationSelector({ value, unit, onChange, symbol }: DurationSelectorProps) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    if (symbol && !isSyntheticIndexSymbol(symbol)) {
      return DURATION_OPTIONS.filter((o) => o.unit !== "t");
    }
    return DURATION_OPTIONS;
  }, [symbol]);

  const opt = options.find((o) => o.unit === unit) || options[0];
  const clamp = (n: number) => Math.max(opt.min, Math.min(opt.max, Math.round(n)));

  const selectUnit = (u: DurationUnit) => {
    const next = DURATION_OPTIONS.find((o) => o.unit === u)!;
    onChange(next.default, u);
    setOpen(false);
  };

  const nudge = (delta: number) => onChange(clamp((Number(value) || opt.default) + delta), unit);

  return (
    <div>
      {/* Unit dropdown + value stepper, Deriv-style single control */}
      <div className="flex items-center gap-1.5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg bg-white/5 border border-[var(--border)] text-[11px] font-bold text-white hover:border-[rgba(255,255,255,0.15)] transition-colors"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {opt.label}
            <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[9rem] rounded-lg border border-[var(--border)] bg-[var(--surface-dim)] p-1 shadow-2xl">
                {options.map((o) => (
                  <button
                    key={o.unit}
                    type="button"
                    onClick={() => selectUnit(o.unit)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-bold transition-colors ${
                      o.unit === unit ? "bg-[var(--accent)] text-black" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => nudge(-1)}
          className="w-8 h-8 shrink-0 rounded-lg bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors text-sm font-bold"
          aria-label={`Decrease ${opt.label.toLowerCase()}`}
        >
          −
        </button>
        <input
          type="number"
          min={opt.min}
          max={opt.max}
          step={1}
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (n >= 0 && !isNaN(n)) onChange(clamp(n), unit);
          }}
          className="flex-1 min-w-0 text-center font-mono font-bold tabular-nums text-sm bg-white/5 border border-[var(--border)] rounded-lg py-1.5 text-white focus:border-[rgba(255,255,255,0.20)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => nudge(1)}
          className="w-8 h-8 shrink-0 rounded-lg bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors text-sm font-bold"
          aria-label={`Increase ${opt.label.toLowerCase()}`}
        >
          +
        </button>
      </div>

      {/* Quick values — reuse Deriv's +/- style so a trader can jump to a
          common duration in one tap without hammering the stepper. */}
      <div className="flex gap-1 mt-1.5">
        {opt.quick.map((q) => (
          <button
            key={`${opt.unit}-${q}`}
            type="button"
            onClick={() => onChange(q, unit)}
            className={`flex-1 py-0.5 rounded text-[10px] font-bold transition-colors ${
              value === q ? "bg-[var(--accent)] text-black" : "bg-white/5 text-[var(--text-muted)] hover:text-white"
            }`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
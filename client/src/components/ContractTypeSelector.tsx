import React, { useState } from "react";

export type ContractCategory =
  | "rise_fall"
  | "over_under"
  | "even_odd"
  | "digits"
  | "accumulator";

export interface ContractSelection {
  category: ContractCategory;
  direction?: "rise" | "fall";
  barrier?: number;
  overUnder?: "over" | "under";
  digit?: number;
  digitMatch?: "match" | "differ";
  growthRate?: number;
}

interface ContractTypeSelectorProps {
  selection: ContractSelection;
  onChange: (s: ContractSelection) => void;
}

const CATEGORIES: { id: ContractCategory; label: string; icon: string }[] = [
  { id: "rise_fall", label: "Rise/Fall", icon: "↗" },
  { id: "over_under", label: "Over/Under", icon: "↑↓" },
  { id: "even_odd", label: "Even/Odd", icon: "◧" },
  { id: "digits", label: "Digits", icon: "0-9" },
  { id: "accumulator", label: "Accumulator", icon: "∑" },
];

export default function ContractTypeSelector({ selection, onChange }: ContractTypeSelectorProps) {
  const setCat = (category: ContractCategory) => {
    const base: ContractSelection = { category };
    if (category === "rise_fall") base.direction = "rise";
    if (category === "over_under") { base.overUnder = "over"; base.barrier = 5; }
    if (category === "digits") { base.digitMatch = "match"; base.digit = 0; }
    if (category === "accumulator") base.growthRate = 1;
    onChange(base);
  };

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg bg-[var(--card)] p-0.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 rounded-md text-micro font-bold transition-all ${
              selection.category === c.id
                ? "bg-[var(--amber)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-white"
            }`}
          >
            <span className="text-base leading-none">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-[var(--card)]/50 p-4 rounded border border-[var(--card)]">
        {selection.category === "rise_fall" && (
          <div className="flex rounded-lg bg-[var(--card)] p-0.5">
            <button
              onClick={() => onChange({ ...selection, direction: "rise" })}
              className={`flex-1 py-2.5 text-center text-sm font-bold rounded-md transition-all ${
                selection.direction === "rise"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Rise
            </button>
            <button
              onClick={() => onChange({ ...selection, direction: "fall" })}
              className={`flex-1 py-2.5 text-center text-sm font-bold rounded-md transition-all ${
                selection.direction === "fall"
                  ? "bg-[var(--red)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Fall
            </button>
          </div>
        )}

        {selection.category === "over_under" && (
          <div className="space-y-3">
            <div className="flex rounded-lg bg-[var(--card)] p-0.5">
              <button
                onClick={() => onChange({ ...selection, overUnder: "over" })}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-all ${
                  selection.overUnder === "over"
                    ? "bg-[var(--amber)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Over
              </button>
              <button
                onClick={() => onChange({ ...selection, overUnder: "under" })}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-all ${
                  selection.overUnder === "under"
                    ? "bg-[var(--amber)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Under
              </button>
            </div>
            <div>
              <label className="text-micro font-bold text-[var(--text-muted)] uppercase">Barrier (0-9)</label>
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, barrier: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.barrier === i
                        ? "bg-[var(--amber)] text-white"
                        : "bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selection.category === "even_odd" && (
          <div className="flex rounded-lg bg-[var(--card)] p-0.5">
            <button
              onClick={() => onChange({ ...selection, digitMatch: "match" })}
              className={`flex-1 py-2.5 text-center text-sm font-bold rounded-md transition-all ${
                selection.digitMatch === "match"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Even
            </button>
            <button
              onClick={() => onChange({ ...selection, digitMatch: "differ" })}
              className={`flex-1 py-2.5 text-center text-sm font-bold rounded-md transition-all ${
                selection.digitMatch === "differ"
                  ? "bg-[var(--red)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Odd
            </button>
          </div>
        )}

        {selection.category === "digits" && (
          <div className="space-y-3">
            <div className="flex rounded-lg bg-[var(--card)] p-0.5">
              <button
                onClick={() => onChange({ ...selection, digitMatch: "match" })}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-all ${
                  selection.digitMatch === "match"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Matches
              </button>
              <button
                onClick={() => onChange({ ...selection, digitMatch: "differ" })}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-all ${
                  selection.digitMatch === "differ"
                    ? "bg-[var(--red)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Differs
              </button>
            </div>
            <div>
              <label className="text-micro font-bold text-[var(--text-muted)] uppercase">Digit (0-9)</label>
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, digit: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.digit === i
                        ? "bg-[var(--amber)] text-white"
                        : "bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selection.category === "accumulator" && (
          <div className="space-y-3">
            <label className="text-micro font-bold text-[var(--text-muted)] uppercase">Growth Rate</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onChange({ ...selection, growthRate: rate })}
                  className={`py-2 rounded text-xs font-bold ${
                    selection.growthRate === rate
                      ? "bg-[var(--amber)] text-white"
                      : "bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

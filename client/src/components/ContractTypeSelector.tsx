import React, { useState } from "react";

export type ContractCategory =
  | "rise_fall"
  | "over_under"
  | "even_odd"
  | "digits"
  | "accumulator";

export interface ContractSelection {
  category: ContractCategory;
  // For rise_fall
  direction?: "rise" | "fall";
  // For over_under
  barrier?: number; // 0-9
  overUnder?: "over" | "under";
  // For digits
  digit?: number; // 0-9
  digitMatch?: "match" | "differ";
  // For accumulator
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
    if (category === "even_odd") { /* even by default */ }
    if (category === "digits") { base.digitMatch = "match"; base.digit = 0; }
    if (category === "accumulator") base.growthRate = 1;
    onChange(base);
  };

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="grid grid-cols-5 gap-1 bg-[#0D0D0D] p-1 rounded-lg border border-[rgba(255,255,255,0.08)]">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`flex flex-col items-center gap-1 py-2 rounded text-[10px] font-bold transition-colors ${
              selection.category === c.id
                ? "bg-orange-500 text-white"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <span className="text-base">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Sub-options */}
      <div className="bg-slate-900/50 p-4 rounded border border-slate-800">
        {selection.category === "rise_fall" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ ...selection, direction: "rise" })}
              className={`py-3 rounded font-bold text-sm ${
                selection.direction === "rise"
                  ? "bg-green-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Rise
            </button>
            <button
              onClick={() => onChange({ ...selection, direction: "fall" })}
              className={`py-3 rounded font-bold text-sm ${
                selection.direction === "fall"
                  ? "bg-red-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Fall
            </button>
          </div>
        )}

        {selection.category === "over_under" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange({ ...selection, overUnder: "over" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.overUnder === "over"
                    ? "bg-purple-600 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Over
              </button>
              <button
                onClick={() => onChange({ ...selection, overUnder: "under" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.overUnder === "under"
                    ? "bg-orange-600 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Under
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Barrier (0-9)</label>
              <div className="grid grid-cols-10 gap-1 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, barrier: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.barrier === i
                        ? "bg-orange-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ ...selection, category: "even_odd" })}
              className="py-3 rounded font-bold text-sm bg-emerald-600 text-white"
            >
              Even
            </button>
            <button
              onClick={() => onChange({ ...selection, category: "even_odd" })}
              className="py-3 rounded font-bold text-sm bg-orange-500 text-white"
            >
              Odd
            </button>
          </div>
        )}

        {selection.category === "digits" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange({ ...selection, digitMatch: "match" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.digitMatch === "match"
                    ? "bg-green-600 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Matches
              </button>
              <button
                onClick={() => onChange({ ...selection, digitMatch: "differ" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.digitMatch === "differ"
                    ? "bg-red-600 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Differs
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Digit (0-9)</label>
              <div className="grid grid-cols-10 gap-1 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, digit: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.digit === i
                        ? "bg-orange-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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
            <label className="text-[10px] font-bold text-slate-500 uppercase">Growth Rate</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onChange({ ...selection, growthRate: rate })}
                  className={`py-2 rounded text-xs font-bold ${
                    selection.growthRate === rate
                      ? "bg-orange-500 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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

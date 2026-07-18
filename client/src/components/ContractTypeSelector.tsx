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
      <div className="grid grid-cols-5 gap-1 bg-[#151515] p-1 rounded-lg border border-[#2A2A2A]">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`flex flex-col items-center gap-1 py-2 rounded text-[10px] font-bold transition-colors ${
              selection.category === c.id
                ? "bg-[#D98B1F] text-white"
                : "text-[#A8A8A8] hover:text-white hover:bg-white/5"
            }`}
          >
            <span className="text-base">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-[#151515]/50 p-4 rounded border border-[#151515]">
        {selection.category === "rise_fall" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ ...selection, direction: "rise" })}
              className={`py-3 rounded font-bold text-sm ${
                selection.direction === "rise"
                  ? "bg-[#1FA64B] text-white"
                  : "bg-[#151515] text-[#A8A8A8] hover:bg-[#2A2A2A]"
              }`}
            >
              Rise
            </button>
            <button
              onClick={() => onChange({ ...selection, direction: "fall" })}
              className={`py-3 rounded font-bold text-sm ${
                selection.direction === "fall"
                  ? "bg-[#D63A3A] text-white"
                  : "bg-[#151515] text-[#A8A8A8] hover:bg-[#2A2A2A]"
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
                    ? "bg-[#D98B1F] text-white"
                    : "bg-[#151515] text-[#A8A8A8]"
                }`}
              >
                Over
              </button>
              <button
                onClick={() => onChange({ ...selection, overUnder: "under" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.overUnder === "under"
                    ? "bg-[#C07B1A] text-white"
                    : "bg-[#151515] text-[#A8A8A8]"
                }`}
              >
                Under
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#6F6F6F] uppercase">Barrier (0-9)</label>
              <div className="grid grid-cols-10 gap-1 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, barrier: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.barrier === i
                        ? "bg-[#D98B1F] text-white"
                        : "bg-[#151515] text-[#A8A8A8] hover:bg-[#2A2A2A]"
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
              className="py-3 rounded font-bold text-sm bg-[#1FA64B] text-white"
            >
              Even
            </button>
            <button
              onClick={() => onChange({ ...selection, category: "even_odd" })}
              className="py-3 rounded font-bold text-sm bg-[#D98B1F] text-white"
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
                    ? "bg-[#1FA64B] text-white"
                    : "bg-[#151515] text-[#A8A8A8]"
                }`}
              >
                Matches
              </button>
              <button
                onClick={() => onChange({ ...selection, digitMatch: "differ" })}
                className={`py-2 rounded font-bold text-xs ${
                  selection.digitMatch === "differ"
                    ? "bg-[#D63A3A] text-white"
                    : "bg-[#151515] text-[#A8A8A8]"
                }`}
              >
                Differs
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#6F6F6F] uppercase">Digit (0-9)</label>
              <div className="grid grid-cols-10 gap-1 mt-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, digit: i })}
                    className={`py-2 rounded text-xs font-bold ${
                      selection.digit === i
                        ? "bg-[#D98B1F] text-white"
                        : "bg-[#151515] text-[#A8A8A8] hover:bg-[#2A2A2A]"
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
            <label className="text-[10px] font-bold text-[#6F6F6F] uppercase">Growth Rate</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onChange({ ...selection, growthRate: rate })}
                  className={`py-2 rounded text-xs font-bold ${
                    selection.growthRate === rate
                      ? "bg-[#D98B1F] text-white"
                      : "bg-[#151515] text-[#A8A8A8] hover:bg-[#2A2A2A]"
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

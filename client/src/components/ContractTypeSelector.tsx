import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import type { ContractCategory } from "@shared/contractAvailability";

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

const CATEGORIES: { id: ContractCategory; label: string; icon: string; desc: string }[] = [
  { id: "rise_fall", label: "Rise/Fall", icon: "↗", desc: "Will price go up or down?" },
  { id: "higher_lower", label: "Higher/Lower", icon: "⇔", desc: "Predict exit vs a fixed strike price" },
  { id: "over_under", label: "Over/Under", icon: "↑↓", desc: "Last digit above or below barrier" },
  { id: "even_odd", label: "Even/Odd", icon: "◧", desc: "Last digit is even or odd" },
  { id: "digits", label: "Digits", icon: "0-9", desc: "Last digit matches or differs" },
  { id: "accumulator", label: "Accumulator", icon: "∑", desc: "Growth rate compounding" },
];

export default function ContractTypeSelector({ selection, onChange }: ContractTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && portalRef.current && !portalRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const toggle = () => {
    if (!open) {
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
        setOpen(true);
      }
    } else {
      setOpen(false);
    }
  };

  const current = CATEGORIES.find((c) => c.id === selection.category)!;

  const setCat = (category: ContractCategory) => {
    const base: ContractSelection = { category };
    if (category === "rise_fall") base.direction = "rise";
    if (category === "higher_lower") { base.direction = "rise"; base.barrier = undefined; }
    if (category === "over_under") { base.overUnder = "over"; base.barrier = 5; }
    if (category === "even_odd") base.digitMatch = "match";
    if (category === "digits") { base.digitMatch = "match"; base.digit = 0; }
    if (category === "accumulator") base.growthRate = 1;
    onChange(base);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {/* Pill trigger */}
      <div ref={ref} className="relative">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 h-8 px-3 rounded-lg bg-white/5 border border-[rgba(255,255,255,0.10)] text-white text-xs font-medium hover:border-[rgba(255,255,255,0.15)] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[var(--accent)]">{current.icon}</span>
            {current.label}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

{/* Popover — portaled to body so it can't be clipped by scroll containers */}
        {open && pos && createPortal(
          <div
            ref={portalRef}
            className="fixed z-[100] aurora-glass-panel rounded-lg p-2 shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`flex flex-col items-start gap-0.5 p-3 rounded-lg text-left transition-all min-h-[40px] ${
                    selection.category === c.id
                      ? "bg-[var(--accent-soft)] border border-[var(--accent-border)]"
                      : "hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--accent)] text-xs">{c.icon}</span>
                    <span className={`text-xs font-semibold ${selection.category === c.id ? "text-[var(--accent)]" : "text-white"}`}>
                      {c.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-[var(--text-muted)] leading-tight">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Sub-options */}
      <div className="bg-white/5 p-2 rounded border border-[var(--border)]">
        {selection.category === "rise_fall" && (
          <div className="flex rounded-lg bg-white/5 p-0.5">
            <button
              onClick={() => onChange({ ...selection, direction: "rise" })}
              className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                selection.direction === "rise"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Rise
            </button>
            <button
              onClick={() => onChange({ ...selection, direction: "fall" })}
              className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                selection.direction === "fall"
                  ? "bg-[var(--red)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Fall
            </button>
          </div>
        )}

{selection.category === "higher_lower" && (
          <div className="space-y-2">
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => onChange({ ...selection, direction: "rise" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.direction === "rise"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Higher
              </button>
              <button
                onClick={() => onChange({ ...selection, direction: "fall" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.direction === "fall"
                    ? "bg-[var(--red)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Lower
              </button>
            </div>
            <div>
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Strike Price</label>
              <input
                type="number"
                step="any"
                value={selection.barrier ?? ""}
                onChange={(e) => onChange({ ...selection, barrier: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="e.g. 2470.00"
                className="mt-1 w-full px-2 py-1.5 rounded text-xs font-mono bg-white/5 border border-[var(--border)] text-white placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>
        )}

{selection.category === "over_under" && (
          <div className="space-y-2">
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => onChange({ ...selection, overUnder: "over" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.overUnder === "over"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Over
              </button>
              <button
                onClick={() => onChange({ ...selection, overUnder: "under" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.overUnder === "under"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Under
              </button>
            </div>
            <div>
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Barrier (0-9)</label>
              <div className="grid grid-cols-5 gap-1 mt-1.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, barrier: i })}
                    className="min-w-0 w-full aspect-square flex items-center justify-center rounded text-[10px] font-bold transition-all"
                    style={{
                      background: selection.barrier === i ? "var(--accent)" : "var(--card)",
                      color: selection.barrier === i ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selection.category === "even_odd" && (
          <div className="flex rounded-lg bg-white/5 p-0.5">
            <button
              onClick={() => onChange({ ...selection, digitMatch: "match" })}
              className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                selection.digitMatch === "match"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Even
            </button>
            <button
              onClick={() => onChange({ ...selection, digitMatch: "differ" })}
              className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
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
          <div className="space-y-2">
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => onChange({ ...selection, digitMatch: "match" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.digitMatch === "match"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Matches
              </button>
              <button
                onClick={() => onChange({ ...selection, digitMatch: "differ" })}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-md transition-all min-h-[36px] ${
                  selection.digitMatch === "differ"
                    ? "bg-[var(--red)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Differs
              </button>
            </div>
            <div>
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Digit (0-9)</label>
              <div className="grid grid-cols-5 gap-1 mt-1.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => onChange({ ...selection, digit: i })}
                    className="min-w-0 w-full aspect-square flex items-center justify-center rounded text-[10px] font-bold transition-all"
                    style={{
                      background: selection.digit === i ? "var(--accent)" : "var(--card)",
                      color: selection.digit === i ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selection.category === "accumulator" && (
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Growth Rate</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onChange({ ...selection, growthRate: rate })}
                  className="py-3 rounded-lg text-[10px] font-bold transition-all min-h-[36px]"
                  style={{
                    background: selection.growthRate === rate ? "var(--accent)" : "var(--card)",
                    color: selection.growthRate === rate ? "white" : "var(--text-secondary)",
                  }}
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

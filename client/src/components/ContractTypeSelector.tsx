import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

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

const CATEGORIES: { id: ContractCategory; label: string; icon: string; desc: string }[] = [
  { id: "rise_fall", label: "Rise/Fall", icon: "↗", desc: "Will price go up or down?" },
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
    if (category === "over_under") { base.overUnder = "over"; base.barrier = 5; }
    if (category === "even_odd") base.digitMatch = "match";
    if (category === "digits") { base.digitMatch = "match"; base.digit = 0; }
    if (category === "accumulator") base.growthRate = 1;
    onChange(base);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Pill trigger */}
      <div ref={ref} className="relative">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent-border)] transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-[var(--accent)]">{current.icon}</span>
            {current.label}
          </span>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

{/* Popover — portaled to body so it can't be clipped by scroll containers */}
        {open && pos && createPortal(
          <div
            ref={portalRef}
            className="fixed z-[100] bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`flex flex-col items-start gap-0.5 p-4 rounded-lg text-left transition-all min-h-[44px] ${
                    selection.category === c.id
                      ? "bg-[var(--accent-soft)] border border-[var(--accent-border)]"
                      : "hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--accent)] text-sm">{c.icon}</span>
                    <span className={`text-sm font-semibold ${selection.category === c.id ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
                      {c.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Sub-options */}
      <div className="bg-[var(--surface-secondary)] p-3 rounded border border-[var(--border)]">
        {selection.category === "rise_fall" && (
          <div className="flex rounded-lg bg-[var(--card)] p-0.5">
            <button
              onClick={() => onChange({ ...selection, direction: "rise" })}
              className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
                selection.direction === "rise"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Rise
            </button>
            <button
              onClick={() => onChange({ ...selection, direction: "fall" })}
              className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
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
                className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
                  selection.overUnder === "over"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Over
              </button>
              <button
                onClick={() => onChange({ ...selection, overUnder: "under" })}
                className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
                  selection.overUnder === "under"
                    ? "bg-[var(--accent)] text-white shadow-sm"
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
                    className="min-w-0 w-full aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all"
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
          <div className="flex rounded-lg bg-[var(--card)] p-0.5">
            <button
              onClick={() => onChange({ ...selection, digitMatch: "match" })}
              className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
                selection.digitMatch === "match"
                  ? "bg-[var(--green)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Even
            </button>
            <button
              onClick={() => onChange({ ...selection, digitMatch: "differ" })}
              className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
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
                className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
                  selection.digitMatch === "match"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
              }`}
              >
                Matches
              </button>
              <button
                onClick={() => onChange({ ...selection, digitMatch: "differ" })}
                className={`flex-1 py-4 text-center text-sm font-bold rounded-md transition-all min-h-[44px] ${
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
                    className="min-w-0 w-full aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all"
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
          <div className="space-y-3">
            <label className="text-micro font-bold text-[var(--text-muted)] uppercase">Growth Rate</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => onChange({ ...selection, growthRate: rate })}
                  className="py-4 rounded-lg text-xs font-bold transition-all min-h-[44px]"
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

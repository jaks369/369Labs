/**
 * Pure digit-read math for the Digit Trader panel.
 *
 * Reuses the repo's authoritative digit conventions (lastDigitOf / decimals
 * in @shared/lastDigit, and the fair-baseline semantics documented in
 * server/signalEngine.ts) so nothing here reinvents the digit math:
 *   - EVEN / ODD baseline = 50%
 *   - OVER barrier=4 (digits 5-9) baseline = (9-4)/10 = 50%
 *   - UNDER barrier=5 (digits 0-4) baseline = 5/10 = 50%
 *
 * Every read is an OBSERVATION of the recent digit stream, never a forecast.
 * Confidence is capped (~58) so a tilt can never masquerade as an edge, the
 * strength buckets are honest, and settlement follows Deriv contract rules
 * (a barrier-touching digit refunds => "expired", never a phantom win).
 *
 * No I/O, no randomness — everything is a pure function of the digits array.
 */

import { lastDigitOf, getDecimalPlaces } from "./lastDigit";

export type DigitReadType = "OVER" | "UNDER" | "EVEN" | "ODD";
export type DigitStrength = "STRONG" | "MEDIUM" | "WEAK";

export interface DigitRead {
  type: DigitReadType;
  barrier: number | null; // only for OVER / UNDER
  label: string; // "Over 4", "Under 5", "Even", "Odd"
  confidence: number; // 0-100, capped ~58 (honest tilt, never an edge)
  strength: DigitStrength;
  sample: number; // digits observed
  freq: number; // observed frequency % for this class
  baseline: number; // fair baseline %
  deltaPp: number; // observed tilt in percentage points (freq - baseline)
  reasons: string[];
}

export interface DigitStreak {
  lastDigit: number;
  digitRun: number; // consecutive repeats of the last digit
  evenRun: number; // consecutive even digits
  oddRun: number; // consecutive odd digits
  over5Run: number; // consecutive digits > 5
  under5Run: number; // consecutive digits < 5
}

export interface DigitSnapshot {
  symbol: string;
  decimals: number;
  digits: number[]; // last N digits, oldest -> newest
  counts: Record<number, number>; // digit -> occurrences
  evenPct: number;
  oddPct: number;
  over4Pct: number; // digits > 4 (5-9)
  under5Pct: number; // digits < 5 (0-4)
  streak: DigitStreak;
  reads: DigitRead[];
}

export const READ_WINDOW = 100;

/** Digit + the epoch of the window's last tick (the decision point). */
export interface DigitTick {
  digit: number;
  epoch: number;
}

/** Any tick shaped row the fetch layer returns (price + epoch seconds). */
export interface TickLike {
  price: number;
  epoch: number;
}

/**
 * Convert ticks to digits in order, reusing the repo's authoritative
 * lastDigitOf / getDecimalPlaces so the math matches every other consumer
 * (signal engine, chat engine, backtest). Non-finite prices are dropped.
 */
export function digitsFromTicks(ticks: TickLike[], decimals: number): DigitTick[] {
  const out: DigitTick[] = [];
  for (const t of ticks) {
    if (!Number.isFinite(Number(t.price))) continue;
    out.push({ digit: lastDigitOf(Number(t.price), decimals), epoch: t.epoch });
  }
  return out;
}

/** Full snapshot: digit distribution, parity/split percentages, streaks, reads. */
export function buildDigitSnapshot(symbol: string, ticks: TickLike[]): DigitSnapshot {
  const decimals = getDecimalPlaces(symbol);
  const clean = digitsFromTicks(ticks, decimals);
  const digits = clean.map((d) => d.digit);
  const counts: Record<number, number> = {};
  for (const d of digits) counts[d] = (counts[d] || 0) + 1;
  return {
    symbol,
    decimals,
    digits,
    counts,
    evenPct: Math.round(pct(digits, (d) => d % 2 === 0) * 10) / 10,
    oddPct: Math.round(pct(digits, (d) => d % 2 !== 0) * 10) / 10,
    over4Pct: Math.round(pct(digits, (d) => d > 4) * 10) / 10,
    under5Pct: Math.round(pct(digits, (d) => d < 5) * 10) / 10,
    streak: streakOf(digits),
    reads: buildDigitReads(digits),
  };
}

/** Baseline % for a read, matching signalEngine.baselineFor semantics. */
export function readBaseline(type: DigitReadType, barrier: number | null): number {
  if (type === "OVER") return barrier == null ? 40 : ((9 - Math.min(9, Math.max(0, barrier))) / 10) * 100;
  if (type === "UNDER") return barrier == null ? 40 : (Math.min(9, Math.max(0, barrier)) / 10) * 100;
  return 50; // EVEN / ODD
}

export function readLabel(type: DigitReadType, barrier: number | null): string {
  if (type === "OVER") return `Over ${barrier ?? 4}`;
  if (type === "UNDER") return `Under ${barrier ?? 5}`;
  return type === "EVEN" ? "Even" : "Odd";
}

/** Map a 0-100 confidence to the honest strength bucket (same tiers as the concierge). */
export function digitStrengthFor(confidence: number): DigitStrength {
  if (confidence >= 70) return "STRONG";
  if (confidence >= 58) return "MEDIUM";
  return "WEAK";
}

/** Current trailing streaks from the end of the digits stream. */
export function streakOf(digits: number[]): DigitStreak {
  const out: DigitStreak = { lastDigit: digits.length ? digits[digits.length - 1] : -1, digitRun: 0, evenRun: 0, oddRun: 0, over5Run: 0, under5Run: 0 };
  if (digits.length === 0) return out;
  const run = (pred: (d: number) => boolean): number => {
    let n = 0;
    for (let i = digits.length - 1; i >= 0 && pred(digits[i]); i--) n++;
    return n;
  };
  out.digitRun = run((d) => d === out.lastDigit);
  out.evenRun = run((d) => d % 2 === 0);
  out.oddRun = run((d) => d % 2 !== 0);
  out.over5Run = run((d) => d > 5);
  out.under5Run = run((d) => d < 5);
  return out;
}

function pct(digits: number[], pred: (d: number) => boolean): number {
  return digits.length ? (digits.filter(pred).length / digits.length) * 100 : 0;
}

/**
 * Build the honest reads from the last `window` digits.
 * Only emissions with |deltaPp| >= 5 are returned; strength follows the
 * delta so STRONG requires a real (>=10pp) tilt on a solid sample.
 */
export function buildDigitReads(digits: number[], window: number = READ_WINDOW): DigitRead[] {
  const win = digits.slice(-window);
  if (win.length < 30) return [];
  const sample = win.length;
  const evenPct = pct(win, (d) => d % 2 === 0);
  const over4Pct = pct(win, (d) => d > 4);
  const under5Pct = pct(win, (d) => d < 5);

  const specs: Array<{ type: DigitReadType; barrier: number | null; freq: number; label: string }> = [
    { type: "EVEN", barrier: null, freq: evenPct, label: "Even" },
    { type: "ODD", barrier: null, freq: 100 - evenPct, label: "Odd" },
    { type: "OVER", barrier: 4, freq: over4Pct, label: "Over 4" },
    { type: "UNDER", barrier: 5, freq: under5Pct, label: "Under 5" },
  ];

  const reads: DigitRead[] = [];
  for (const spec of specs) {
    const baseline = readBaseline(spec.type, spec.barrier);
    const delta = spec.freq - baseline;
    if (Math.abs(delta) < 5) continue;
    // Capped at ~58 so a tilt is never sold as an edge; scaled slower than
    // the concierge's confluence so the digit read stays conservative.
    const confidence = Math.round(50 + Math.min(Math.abs(delta) * 0.8, 8));
    const strength: DigitStrength = Math.abs(delta) >= 10 && sample >= 80 ? "STRONG" : Math.abs(delta) >= 6 ? "MEDIUM" : "WEAK";
    reads.push({
      type: spec.type,
      barrier: spec.barrier,
      label: readLabel(spec.type, spec.barrier),
      confidence,
      strength,
      sample,
      freq: Math.round(spec.freq * 10) / 10,
      baseline,
      deltaPp: Math.round(delta * 10) / 10,
      reasons: buildReason(spec, sample, delta),
    });
  }
  return reads.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
}

function buildReason(spec: { type: DigitReadType; barrier: number | null; label: string }, sample: number, delta: number): string[] {
  const lean = delta >= 0 ? "leaning" : "contrarian";
  const dir = delta >= 0 ? "appeared more" : "appeared less";
  const base = readBaseline(spec.type, spec.barrier);
  return [
    `${spec.label} ${dir} than fair in the last ${sample} digits (${Math.abs(Math.round(delta * 10) / 10)}pp ${lean}).`,
    `Observed ${dir === "appeared more" ? "frequency" : "frequency"} vs a ${Math.round(base)}% fair baseline — a tilt, not an edge.`,
    "Volatility indices are near-random by design; this read decays on the very next tick.",
  ];
}

/**
 * Resolve a persisted read against the digit of the NEXT tick (Deriv rules).
 * A barrier-touching digit refunds -> "expired", never a phantom win.
 */
export function settleDigitRead(read: Pick<DigitRead, "type" | "barrier">, nextDigit: number): "win" | "loss" | "expired" {
  if (read.type === "EVEN") return nextDigit % 2 === 0 ? "win" : "loss";
  if (read.type === "ODD") return nextDigit % 2 !== 0 ? "win" : "loss";
  const b = read.barrier == null ? 5 : read.barrier;
  if (read.type === "OVER") return nextDigit > b ? "win" : nextDigit < b ? "loss" : "expired";
  // UNDER
  return nextDigit < b ? "win" : nextDigit > b ? "loss" : "expired";
}
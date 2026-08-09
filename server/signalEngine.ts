/**
 * 369Labs signal engine v2 — fixed pattern taxonomy + rigorous statistics.
 *
 * Design (single coherent pass):
 *   - `buildLibrary()` returns a FIXED set of named digit-contract tests.
 *   - Each candidate is evaluated with the correctness guarantees of the
 *     redesign brief: contract-specific baseline, Wilson CI, BH-FDR over the
 *     whole batch, and a 5-window walk-forward where >=3 windows must hold.
 *   - strong / watch results represent live, tradeable conditions; failed /
 *     no_edge results are also returned (with their tier) so the Market
 *     Intelligence page can truthfully render a "no tradeable condition" state.
 *
 * Pure module: no DB / WS / notification side effects. The scanner persists
 * only the survivors (signalScanner.ts).
 */
import {
  wilsonInterval,
  binomialPvsBaseline,
  benjaminiHochbergFDR,
  walkForwardSummary,
  assignTier,
  WALK_FORWARD_WINDOWS,
  SignalTier,
} from "./signalStats";

export const SIGNAL_TTL_MIN = 240; // 4h shelf life (§4.5)
export const RE_TEST_MINUTES = 120; // 2h re-test cadence (§4.5)

export type PatternFamily =
  | "digit_frequency"
  | "parity_transition"
  | "high_low_transition"
  | "over_under_transition"
  | "repeat_change"
  | "streak_followon"
  | "alternation_break";

export type ContractSupport =
  | { contract: "DIGITMATCH"; digit: number }
  | { contract: "DIGITDIFF"; digit: number }
  | { contract: "DIGITEVEN" }
  | { contract: "DIGITODD" }
  | { contract: "DIGITOVER"; barrier: number }
  | { contract: "DIGITUNDER"; barrier: number };

export function contractLabel(c: ContractSupport): string {
  switch (c.contract) {
    case "DIGITMATCH": return `Matches ${c.digit}`;
    case "DIGITDIFF": return `Differs ${c.digit}`;
    case "DIGITEVEN": return "Even";
    case "DIGITODD": return "Odd";
    case "DIGITOVER": return `Over ${c.barrier}`;
    case "DIGITUNDER": return `Under ${c.barrier}`;
  }
}

/** Correct contract-specific baseline. NOT a generic 50% (§1.2). */
export function baselineFor(c: ContractSupport): number {
  switch (c.contract) {
    case "DIGITMATCH": return 0.1;
    case "DIGITDIFF": return 0.9;
    case "DIGITEVEN":
    case "DIGITODD": return 0.5;
    case "DIGITOVER":
      // digits > barrier, barrier excluded from both sides -> (9 - barrier)/10
      return Math.max(0, (9 - Math.min(9, Math.max(0, c.barrier))) / 10);
    case "DIGITUNDER":
      // digits < barrier -> barrier/10
      return Math.max(0, Math.min(9, Math.max(0, c.barrier)) / 10);
    default: return 0.5;
  }
}

/** Settlement of a digital contract given the last digit of a tick. */
function digitOutcome(digit: number, c: ContractSupport): "win" | "loss" | null {
  switch (c.contract) {
    case "DIGITMATCH": return digit === c.digit ? "win" : "loss";
    case "DIGITDIFF": return digit !== c.digit ? "win" : "loss";
    case "DIGITEVEN": return digit % 2 === 0 ? "win" : "loss";
    case "DIGITODD": return digit % 2 === 1 ? "win" : "loss";
    case "DIGITOVER": return digit > c.barrier ? "win" : digit < c.barrier ? "loss" : null;
    case "DIGITUNDER": return digit < c.barrier ? "win" : digit > c.barrier ? "loss" : null;
  }
}

/**
 * A FIXED test: `armed(digits, i)` triggers on prefix state; `outcome` resolves
 * the contract on the next tick (index i+1), or every tick for isFrequency.
 */
export interface CandidateCfg {
  key: string;
  family: PatternFamily;
  contract: ContractSupport;
  describe: string;
  triggerText: string;
  isFrequency: boolean;
  armed: (digits: number[], i: number) => boolean;
  outcome: (digits: number[], j: number) => "win" | "loss" | null;
  currentProgress: (tail: number[]) => { met: number; needed: number; current: string };
}

type RawCandidate = CandidateCfg;

const EVEN = (d: number) => d % 2 === 0;

function trailingRun(tail: number[], matches: (d: number) => boolean): number {
  let n = 0;
  for (let k = tail.length - 1; k >= 0; k--) { if (!matches(tail[k])) break; n++; }
  return n;
}

/** §2 FIXED pattern library — nothing data-derived is inserted at runtime. */
export function buildLibrary(): RawCandidate[] {
  const lib: RawCandidate[] = [];

  // ---- §2.1 digit frequency (always armed: settle every tick) ----
  for (let d = 0; d <= 9; d++) {
    lib.push({
      key: `freq-match-${d}`,
      family: "digit_frequency",
      contract: { contract: "DIGITMATCH", digit: d },
      describe: `Digit ${d} printed more frequently than its 10% fair rate, supporting a Matches ${d} contract.`,
      triggerText: "Running last-digit window",
      isFrequency: true,
      armed: () => true,
      outcome: (digits, j) => (digits[j] === d ? "win" : "loss"),
      currentProgress: (tail) => {
        const seen = tail.filter((x) => x === d).length;
        return { met: seen, needed: Math.max(2, Math.round(tail.length * 0.12)), current: `${seen}× "${d}" in the last ${tail.length} ticks` };
      },
    });
    lib.push({
      key: `freq-diff-${d}`,
      family: "digit_frequency",
      contract: { contract: "DIGITDIFF", digit: d },
      describe: `Digit ${d} printed at its normal ~10% rate while Differs ${d} pays at 90% baseline — the Differs rate itself is the benchmark upheld.`,
      triggerText: "Running last-digit window",
      isFrequency: true,
      armed: () => true,
      outcome: (digits, j) => (digits[j] !== d ? "win" : "loss"),
      currentProgress: (tail) => {
        const seen = tail.filter((x) => x === d).length;
        return { met: Math.min(seen, 3), needed: 3, current: `${seen}× "${d}" — cold-digit watch` };
      },
    });
  }

  // ---- §2.2 parity transitions: run of same-parity then FLIP ----
  for (const rr of [1, 2, 3, 4, 5]) {
    for (const targetEven of [true, false]) {
      const label = targetEven ? "Even" : "Odd";
      const flipped: ContractSupport = targetEven ? { contract: "DIGITODD" } : { contract: "DIGITEVEN" };
      lib.push({
        key: `parity-${targetEven ? "E" : "O"}-x${rr}-flip`,
        family: "parity_transition",
        contract: flipped,
        describe: `After ${rr} consecutive ${label} last digits, the next digit flipped to ${targetEven ? "Odd" : "Even"} above the 50% baseline.`,
        triggerText: `${rr} × ${label}, then next is ${targetEven ? "Odd" : "Even"}`,
        isFrequency: false,
        armed: (digits, i) => {
          if (i < rr) return false;
          for (let k = i - rr; k < i; k++) if (EVEN(digits[k]) !== targetEven) return false;
          return true;
        },
        outcome: (digits, j) => (EVEN(digits[j]) ? (targetEven ? "loss" : "win") : targetEven ? "win" : "loss"),
        currentProgress: (tail) => {
          const n = trailingRun(tail, (d) => EVEN(d) === targetEven);
          return { met: Math.min(n, rr), needed: rr, current: n >= rr ? "armed — settle next" : `${n}/${rr}` };
        },
      });
    }
  }

  // ---- §2.3 high/low transition: run of HIGH(5-9)/LOW(0-4) then revert ----
  for (const rr of [1, 2, 3, 4, 5]) {
    for (const isHigh of [true, false]) {
      const revert: ContractSupport = isHigh ? { contract: "DIGITUNDER", barrier: 5 } : { contract: "DIGITOVER", barrier: 4 };
      lib.push({
        key: `hilo-${isHigh ? "H" : "L"}-x${rr}`,
        family: "high_low_transition",
        contract: revert,
        describe: `After ${rr} consecutive ${isHigh ? "High (5-9)" : "Low (0-4)"} digits, the next digit ${isHigh ? "dropped below 5" : "rose above 4"}.`,
        triggerText: `${rr} × ${isHigh ? "High" : "Low"}, then next`,
        isFrequency: false,
        armed: (digits, i) => {
          if (i < rr) return false;
          for (let k = i - rr; k < i; k++) if ((digits[k] >= 5) !== isHigh) return false;
          return true;
        },
        outcome: (digits, j) => (digits[j] >= 5 ? (isHigh ? "loss" : "win") : isHigh ? "win" : "loss"),
        currentProgress: (tail) => {
          const n = trailingRun(tail, (d) => (d >= 5) === isHigh);
          return { met: Math.min(n, rr), needed: rr, current: n >= rr ? "armed ⚠ settle next" : `${n}/${rr}` };
        },
      });
    }
  }

  // ---- §2.4 over/under barrier transitions (barriers 2, 5, 7) ----
  for (const barrier of [2, 5, 7]) {
    for (const isOver of [true, false]) {
      for (const rr of [3, 4]) {
        const revert: ContractSupport = isOver ? { contract: "DIGITUNDER", barrier } : { contract: "DIGITOVER", barrier };
        lib.push({
          key: `ou-${isOver ? "over" : "under"}-${barrier}-x${rr}`,
          family: "over_under_transition",
          contract: revert,
          describe: `After ${rr} consecutive digits ${isOver ? "over" : "under"} ${barrier}, the next digit reverted ${isOver ? "under" : "over"} ${barrier} (barrier digit excluded).`,
          triggerText: `${rr} × ${isOver ? "Over" : "Under"} ${barrier}, then next`,
          isFrequency: false,
          armed: (digits, i) => {
            if (i < rr) return false;
            for (let k = i - rr; k < i; k++) if ((digits[k] > barrier) !== isOver) return false;
            return true;
          },
          outcome: (digits, j) => digitOutcome(digits[j], revert),
          currentProgress: (tail) => {
            const n = trailingRun(tail, (d) => (d > barrier) === isOver);
            return { met: Math.min(n, rr), needed: rr, current: n >= rr ? "armed → settle next" : `${n}/${rr}` };
          },
        });
      }
    }
  }

  // ---- §2.5 repeat vs change (Priority 2) ----
  for (let runThresh = 2; runThresh <= 5; runThresh++) {
    lib.push({
      key: `repeat-change-${runThresh}`,
      family: "repeat_change",
      contract: { contract: "DIGITMATCH", digit: 0 },
      describe: `After ${runThresh}+ consecutive digit changes, the next digit repeats the previous digit.`,
      triggerText: `${runThresh}+ consecutive changes, then repeat`,
      isFrequency: false,
      armed: (digits, i) => {
        if (i < runThresh) return false;
        for (let k = i - runThresh + 1; k <= i; k++) if (digits[k] === digits[k - 1]) return false;
        return true;
      },
      outcome: (digits, j) => (digits[j] === digits[j - 1] ? "win" : "loss"),
      currentProgress: (tail) => {
        let n = 1;
        for (let k = tail.length - 1; k > 0; k--) { if (tail[k] !== tail[k - 1]) n++; else break; }
        return { met: Math.min(n, runThresh), needed: runThresh, current: n >= runThresh ? "armed → repeat next" : `${n}/${runThresh}` };
      },
    });
  }

  // ---- §2.6 digit streak (Priority 2): streak of d then next ----
  for (const rr of [2, 3, 4]) {
    for (let d = 0; d <= 9; d++) {
      lib.push({
        key: `streak-${d}-x${rr}`,
        family: "streak_followon",
        contract: { contract: "DIGITMATCH", digit: d },
        describe: `After digit ${d} printed ${rr}× consecutively, ${d} tended to print again (streak persists).`,
        triggerText: `Digit ${d} ×${rr}, then next`,
        isFrequency: false,
        armed: (digits, i) => {
          if (i < rr) return false;
          for (let k = i - rr; k < i; k++) if (digits[k] !== d) return false;
          return true;
        },
        outcome: (digits, j) => (digits[j] === d ? "win" : "loss"),
        currentProgress: (tail) => {
          const n = trailingRun(tail, (x) => x === d);
          return { met: Math.min(n, rr), needed: rr, current: n >= rr ? "armed → next" : `${n}/${rr} of ${d}` };
        },
      });
    }
  }

  // ---- §2.7 alternation break (Priority 2) ----
  for (let altLen = 3; altLen <= 5; altLen++) {
    lib.push({
      key: `alternate-${altLen}`,
      family: "alternation_break",
      contract: { contract: "DIGITEVEN" },
      describe: `After an ${altLen}-tick parity alternation, the alternation tended to continue.`,
      triggerText: `${altLen}-tick parity alternation, then continue`,
      isFrequency: false,
      armed: (digits, i) => {
        if (i < altLen) return false;
        for (let k = i - altLen; k < i; k++) if (EVEN(digits[k]) === EVEN(digits[k - 1] ?? 0)) return false;
        return true;
      },
      outcome: (digits, j) => (EVEN(digits[j]) !== EVEN(digits[j - 1]) ? "win" : "loss"),
      currentProgress: (tail) => {
        let n = 1;
        for (let k = tail.length - 1; k > 0; k--) { if (EVEN(tail[k]) !== EVEN(tail[k - 1])) n++; else break; }
        return { met: Math.min(n, altLen), needed: altLen, current: n >= altLen ? "armed → alternate next" : `${n}/${altLen}` };
      },
    });
  }

  return lib;
}

/** One walk-forward window's settled outcome. */
export interface RunBucket { wins: number; n: number; rate: number }

/** Result for a single library candidate. failed / no_edge included. */
export interface PatternResult {
  key: string;
  family: PatternFamily;
  tier: SignalTier;
  supports: ContractSupport;
  supportsLabel: string;
  baseline: number;
  observed: number;
  edgePp: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  fdrAdjusted: boolean;
  inSampleSize: number;
  sampleTotal: number;
  walks: RunBucket[];
  oosAvg: number;
  holds: number;
  describe: string;
  triggerText: string;
  currentProgress: { met: number; needed: number; current: string };
  discoveredAt: number;
  expiresAt: number;
  retestAt: number;
  window: { startEpoch: number; endEpoch: number };
}

const MIN_IN_SAMPLE = 25;
const IN_SAMPLE_RATIO = 0.6;

function countCandidate(c: CandidateCfg, digits: number[], start: number, end: number): { wins: number; total: number } {
  if (c.isFrequency) {
    let wins = 0;
    for (let j = start; j < end; j++) if (c.outcome(digits, j) === "win") wins++;
    return { wins, total: Math.max(0, end - start) };
  }
  let wins = 0;
  let total = 0;
  for (let i = Math.max(1, start); i < end - 1; i++) {
    if (!c.armed(digits, i)) continue;
    const r = c.outcome(digits, i + 1);
    if (r !== null) total++;
    if (r === "win") wins++;
  }
  return { wins, total };
}

function toPp(observed: number, baseline: number): number {
  return Math.round((observed - baseline) * 1000) / 10;
}

export interface ScoreContext { symbol: string; nowSec: number }

export interface ScoreInput {
  digits: number[];
  epochs: number[];
  ctx: ScoreContext;
}

/**
 * Run the fixed library over one symbol window and return every candidate's
 * result INCLUDING failed / no_edge tiers (Market Intelligence truthfully
 * shows "no tradeable condition"). Only strong/watch are persisted later.
 */
export function runAnalysis(inp: ScoreInput): PatternResult[] {
  const { digits, epochs, ctx } = inp;
  const n = digits.length;
  if (n < 40) return [];
  const now = ctx.nowSec;

  const lib = buildLibrary();
  const isEnd = Math.max(1, Math.floor(n * IN_SAMPLE_RATIO));

  const evaluated = lib
    .map((cand) => ({ cand, inSample: countCandidate(cand, digits, 1, isEnd) }))
    .filter((e) => e.inSample.total >= MIN_IN_SAMPLE);

  // BH-FDR across ALL evaluated candidates for this symbol/batch
  const pList = evaluated.map((e) => {
    const b = baselineFor(e.cand.contract);
    return binomialPvsBaseline(e.inSample.wins, e.inSample.total, b);
  });
  const rejected = benjaminiHochbergFDR(pList, 0.05);

  // 5 sequential OOS windows over the trailing (1 - IN_SAMPLE_RATIO)
  const wfStart = isEnd;
  const wfLen = Math.max(1, Math.floor((n - wfStart) / WALK_FORWARD_WINDOWS));
  const wf = new Map<string, RunBucket[]>();
  for (let w = 0; w < WALK_FORWARD_WINDOWS; w++) {
    const s = wfStart + w * wfLen;
    const e = Math.min(n, s + wfLen);
    if (e <= s) continue;
    for (const ev of evaluated) {
      const c = countCandidate(ev.cand, digits, s, e);
      const list = wf.get(ev.cand.key) || [];
      list.push({ wins: c.wins, n: c.total, rate: c.total > 0 ? c.wins / c.total : 0 });
      wf.set(ev.cand.key, list);
    }
  }

  const results: PatternResult[] = [];
  evaluated.forEach((ev, idx) => {
    const b = baselineFor(ev.cand.contract);
    const { wins, total } = ev.inSample;
    const observed = total > 0 ? wins / total : 0;
    const ci = wilsonInterval(wins, total);
    const buckets = wf.get(ev.cand.key) || [];
    const eff = walkForwardSummary(buckets, b);
    const tier = assignTier(rejected[idx], ci.low > b, eff);
    results.push({
      key: ev.cand.key,
      family: ev.cand.family,
      tier,
      supports: ev.cand.contract,
      supportsLabel: contractLabel(ev.cand.contract),
      baseline: b,
      observed,
      edgePp: toPp(observed, b),
      ciLow: ci.low,
      ciHigh: ci.high,
      pValue: pList[idx],
      fdrAdjusted: rejected[idx],
      inSampleSize: total,
      sampleTotal: n,
      walks: buckets,
      oosAvg: eff.avgRate,
      holds: eff.holdCount,
      describe: ev.cand.describe,
      triggerText: ev.cand.triggerText,
      currentProgress: ev.cand.currentProgress(digits.slice(-30)),
      discoveredAt: now,
      expiresAt: now + SIGNAL_TTL_MIN * 60,
      retestAt: now + RE_TEST_MINUTES * 60,
      window: {
        startEpoch: epochs[0] ?? now - 120,
        endEpoch: epochs[n - 1] ?? now,
      },
    });
  });

  return results;
}
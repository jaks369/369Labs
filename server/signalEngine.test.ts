import { describe, expect, it } from "vitest";
import {
  runAnalysis,
  buildLibrary,
  baselineFor,
  contractLabel,
  PatternResult,
} from "./signalEngine";
import { assignTier, walkForwardSummary } from "./signalStats";

const NOW = Math.floor(Date.now() / 1000);

function makeEpochs(n: number, startSec: number, stepMs = 1000): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(startSec + Math.floor((i * stepMs) / 1000));
  return out;
}

function run(digits: number[]): PatternResult[] {
  return runAnalysis({ digits, epochs: makeEpochs(digits.length, NOW - digits.length), ctx: { symbol: "R_75", nowSec: NOW } });
}

/** Deterministic near-iid uniform stream (LCG), so nothing can beat its baseline. */
function uniformDigits(n: number, seed = 12345): number[] {
  let s = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(Math.floor((s / 2147483648) * 10));
  }
  return out;
}

describe("signalEngine baselines (§ baseline correctness)", () => {
  it("Matches 10%, Differs 90%, Even/Odd 50%, Over/Under by barrier", () => {
    expect(baselineFor({ contract: "DIGITMATCH", digit: 5 })).toBeCloseTo(0.1, 10);
    expect(baselineFor({ contract: "DIGITDIFF", digit: 4 })).toBeCloseTo(0.9, 10);
    expect(baselineFor({ contract: "DIGITEVEN" })).toBeCloseTo(0.5, 10);
    expect(baselineFor({ contract: "DIGITODD" })).toBeCloseTo(0.5, 10);
    expect(baselineFor({ contract: "DIGITOVER", barrier: 5 })).toBeCloseTo(0.4, 10);
    expect(baselineFor({ contract: "DIGITUNDER", barrier: 5 })).toBeCloseTo(0.5, 10);
    // repeat/change baselines: "next repeat" is 10%, "next change" is 90%
    expect(baselineFor({ contract: "DIGITREPEAT" })).toBeCloseTo(0.1, 10);
    expect(baselineFor({ contract: "DIGITCHANGE" })).toBeCloseTo(0.9, 10);
  });

  it("drops the 10×10 digit-transition family into the library with per-cell labels", () => {
    const lib = buildLibrary();
    const dt = lib.filter((c) => c.family === "digit_transition");
    expect(dt.length).toBe(100);
    expect(contractLabel(dt[0].contract)).toBe("Matches 0");
    expect(baselineFor(dt[0].contract)).toBeCloseTo(0.1, 10);
  });

  it("exposes the H/L alternation and Repeat/Change families", () => {
    const lib = buildLibrary();
    expect(lib.some((c) => c.family === "hl_alternation")).toBe(true);
    expect(lib.some((c) => c.family === "repeat_change_alternation")).toBe(true);
    const st = lib.filter((c) => c.family === "repeat_change_state");
    expect(st.length).toBe(4); // change-after-change, repeat-after-change, change-after-repeat, repeat-after-repeat
    const ccc = st.find((c) => c.key === "rc-C-C");
    expect(ccc).toBeDefined();
    expect(baselineFor(ccc!.contract)).toBeCloseTo(0.9, 10); // change-after-change 90%
    const rar = st.find((c) => c.key === "rc-R-R");
    expect(baselineFor(rar!.contract)).toBeCloseTo(0.1, 10); // repeat-after-repeat 10%
  });
});

describe("engine behavior on synthetic streams", () => {
  it("flags a strong Matches-2 bias on a heavily-2 stream", () => {
    // 80% of ticks print digit 2 (even), rest print 1
    const d2: number[] = [];
    for (let i = 0; i < 800; i++) d2.push(i % 5 === 0 ? 1 : 2);
    const results = run(d2);
    const m2 = results.find((r) => r.key === "freq-match-2");
    expect(m2).toBeDefined();
    expect(m2!.baseline).toBeCloseTo(0.1, 10);
    expect(m2!.observed).toBeGreaterThan(0.6);
    expect(m2!.tier).toBe("strong"); // CI clears 10%, FDR survives, walk-forward holds
    expect(m2!.holds).toBeGreaterThanOrEqual(3);
  });

  it("classifies tiny edges as no_edge (51% vs 50% is nothing), never strong on uniform data", () => {
    const results = run(uniformDigits(2000));
    expect(results.every((r) => r.tier !== "strong")).toBe(true);
    // small edges exist but are gated to no_edge
    const noise = results.some((r) => Math.abs(r.edgePp) < 3 && r.tier === "no_edge");
    expect(noise).toBe(true);
  });

  it("labels change-after-change at a 90% baseline (no fabricated edge)", () => {
    // strictly non-repeating stream: every step is a change
    const digits: number[] = [];
    for (let i = 0; i < 1200; i++) digits.push(i % 10);
    const results = run(digits);
    const cc = results.find((r) => r.key === "rc-C-C");
    expect(cc).toBeDefined();
    expect(cc!.baseline).toBeCloseTo(0.9, 10);
    expect(cc!.observed).toBeCloseTo(1, 1); // always a change on a strictly non-repeating stream
  });
});

describe("assignTier gating", () => {
  it("applies the MIN_EDGE_PP gate: 1pp edge → no_edge", () => {
    const wf = walkForwardSummary([], 0.5);
    expect(assignTier(true, true, 1, 200, wf)).toBe("no_edge");
  });

  it("separates insufficient OOS data from failed", () => {
    const wfNoData = walkForwardSummary([], 0.5);
    // no OOS data at all → insufficient, NOT failed
    expect(assignTier(true, true, 10, 0, wfNoData)).toBe("insufficient");
    // OOS total ok but no settled window (n<20 each) → still insufficient
    const thinWindows = [
      { wins: 8, n: 10 }, { wins: 9, n: 10 }, { wins: 9, n: 10 }, { wins: 8, n: 10 }, { wins: 9, n: 10 },
    ];
    const wfThin = walkForwardSummary(thinWindows, 0.5);
    expect(wfThin.oosTotal).toBe(50);
    expect(wfThin.settledCount).toBe(0);
    expect(assignTier(true, true, 10, wfThin.oosTotal, wfThin)).toBe("insufficient");
  });

  it("returns failed only with adequate OOS data that did not hold", () => {
    const windows = [
      { wins: 5, n: 25 }, { wins: 6, n: 25 }, { wins: 7, n: 25 }, { wins: 8, n: 25 }, { wins: 9, n: 25 },
    ];
    const wf = walkForwardSummary(windows, 0.5);
    expect(wf.oosTotal).toBe(125);
    expect(wf.settledCount).toBe(5);
    expect(wf.holdCount).toBe(0); // ~20-36% rates never clear a 50% baseline
    expect(assignTier(true, true, 10, wf.oosTotal, wf)).toBe("failed");
  });
});
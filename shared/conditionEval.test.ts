import { describe, it, expect } from "vitest";
import { evaluateRuleCondition, type EvalContext } from "./conditionEval";

// 4-decimal synthetic-style prices: digit encoded in the 4th decimal place.
function makeSeries(digits: number[]): { prices: number[]; digits: number[] } {
  const prices = digits.map((d) => 1000 + d / 10000);
  return { prices, digits };
}

function ctxFor(digitSeq: number[], extra: Partial<EvalContext> = {}): EvalContext {
  const { prices, digits } = makeSeries(digitSeq);
  return { prices, digits, idx: digits.length - 1, ...extra };
}

describe("evaluateRuleCondition — canonical evaluator (live + backtest parity)", () => {
  it("flat digit condition: appears within trailing window", () => {
    // Digit 9 appears twice in the last 20 ticks → count:2 satisfied.
    const digits = Array.from({ length: 25 }, (_, i) => (i === 22 || i === 24 ? 9 : i % 5));
    const r = evaluateRuleCondition({ condition: { indicator: "last_digit", barrier: 9, count: 2 } }, ctxFor(digits));
    expect(r).toBe(true);
  });

  it("appears_consecutively requires a true run", () => {
    const ok = [1, 1, 1];
    const broken = [1, 2, 1];
    expect(
      evaluateRuleCondition({ condition: { indicator: "last_digit", barrier: 1, comparison: "appears_consecutively", count: 3 } }, ctxFor(ok)),
    ).toBe(true);
    expect(
      evaluateRuleCondition({ condition: { indicator: "last_digit", barrier: 1, comparison: "appears_consecutively", count: 3 } }, ctxFor(broken)),
    ).toBe(false);
  });

  it("digit conditions refuse non-synthetic symbols (defense-in-depth)", () => {
    const r = evaluateRuleCondition({ condition: { indicator: "digit_over", barrier: 5 } }, ctxFor([7, 8], { symbol: "frxEURUSD" }));
    expect(r).toBe(false);
    const ok = evaluateRuleCondition({ condition: { indicator: "digit_over", barrier: 5 } }, ctxFor([7, 8], { symbol: "R_100" }));
    expect(ok).toBe(true);
  });

  it("consecutive_rise/fall", () => {
    expect(evaluateRuleCondition({ condition: { indicator: "consecutive_rise", count: 3 } }, ctxFor([1, 2, 3].map((d) => d)))).toBe(false); // flat digits but rising prices
  });

  it("condition tree: all/any/not composition", () => {
    // Last digit 9 AND over 5 → both true on digit 9.
    const tree = { all: [{ indicator: "last_digit", barrier: 9 }, { indicator: "digit_over", barrier: 5 }] } as any;
    expect(evaluateRuleCondition({ conditions: tree }, ctxFor([9]))).toBe(true);
    const notTree = { not: { indicator: "digit_even" } } as any;
    expect(evaluateRuleCondition({ conditions: notTree }, ctxFor([9]))).toBe(true);
  });

  it("ensemble voting: all / any / majority", () => {
    const rules = [
      { condition: { indicator: "last_digit", barrier: 9 } },
      { condition: { indicator: "digit_over", barrier: 5 } },
      { condition: { indicator: "digit_odd" } },
    ];
    const ctx = ctxFor([9]); // all three leaves true
    expect(evaluateRuleCondition({ ensemble: { rules, vote: "all" } }, ctx)).toBe(true);
    // Only one leaf true → any passes, all/majority fail.
    const ctxOne = ctxFor([1]);
    expect(evaluateRuleCondition({ ensemble: { rules, vote: "any" } }, ctxOne)).toBe(true);
    expect(evaluateRuleCondition({ ensemble: { rules, vote: "all" } }, ctxOne)).toBe(false);
    expect(evaluateRuleCondition({ ensemble: { rules, vote: "majority" } }, ctxOne)).toBe(false);
  });

  it("ema_trend evaluates on candle data and is consistent between calls at same state", () => {
    // Rising price series with realistic 2s tick spacing across ~40 min,
    // so ≥15 one-minute candles form (the gate indicator conditions require).
    const n = 1200;
    const startEpoch = 1_700_000_000;
    const prices = Array.from({ length: n }, (_, i) => 1000 + i * 0.5);
    const epochs = Array.from({ length: n }, (_, i) => startEpoch + i * 2);
    const rule = { condition: { indicator: "ema_trend", comparison: "up" } };
    const up = evaluateRuleCondition(rule, { prices, epochs, idx: prices.length - 1 });
    expect(up).toBe(true);
    const down = evaluateRuleCondition({ condition: { indicator: "ema_trend", comparison: "down" } }, { prices, epochs, idx: prices.length - 1 });
    expect(down).toBe(false);
    // Too little history → no opinion, not a false negative.
    expect(evaluateRuleCondition(rule, { prices: prices.slice(0, 10), epochs: epochs.slice(0, 10), idx: 9 })).toBe(false);
  });

  it("digits derived from decimals when not supplied — matches supplied digits", () => {
    const prices = [1000.0009, 1000.0001, 1000.0007]; // R_50-style 4 decimals
    const viaSupplied = evaluateRuleCondition({ condition: { indicator: "last_digit", barrier: 9 } }, { prices, digits: [9, 1, 7], idx: 2 });
    const viaDerived = evaluateRuleCondition({ condition: { indicator: "last_digit", barrier: 9 } }, { prices, decimals: 4, idx: 2 });
    expect(viaSupplied).toBe(viaDerived);
    expect(viaDerived).toBe(true);
  });
});

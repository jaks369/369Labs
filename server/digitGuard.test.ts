import { describe, it, expect, vi } from "vitest";
import { runBacktest } from "./backtest";
import { getDigitStats } from "./aitools";
import { getDigitSnapshot } from "./digitTrader";
import { PredictionEngine } from "./ai/PredictionEngine";

vi.mock("./db", () => ({
  listOpenDigitReads: vi.fn().mockResolvedValue([]),
  saveDigitRead: vi.fn().mockImplementation(async (row: any) => ({ ...row, id: 1 })),
  setDigitReadOutcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./aitools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aitools")>();
  return {
    ...actual,
    getTickHistory: vi.fn(),
  };
});

// Synthetic-style prices: digit encoded in the 4th decimal place.
function makeTicks(count: number, digitFn: (i: number) => number): Array<{ price: number; timestamp: number }> {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    price: 1000 + digitFn(i) / 10000,
    timestamp: now - (count - i) * 2000,
  }));
}

const DIGIT_RULE = {
  name: "hot over",
  action: "buy",
  condition: { indicator: "digit_over", barrier: 5, count: 1 },
};

describe("digit-pattern synthetic-only guard", () => {
  it("runBacktest refuses digit conditions on a forex symbol", async () => {
    const res = await runBacktest(makeTicks(60, (i) => i % 10), DIGIT_RULE, 1, "frxEURUSD");
    expect(res.valid).toBe(false);
    expect(res.totalTrades).toBe(0);
    expect(res.interpretation).toMatch(/synthetic/i);
  });

  it("runBacktest still runs digit conditions on a synthetic symbol", async () => {
    // R_50 has 4 decimals, so the digit is encoded in the 4th decimal place.
    const res = await runBacktest(makeTicks(60, (i) => (i % 10 === 0 ? 9 : 1)), DIGIT_RULE, 1, "R_50");
    expect(res.valid).not.toBe(false);
    expect(res.totalTrades).toBeGreaterThan(0);
  });

  it("getDigitStats returns an honest note for non-synthetic symbols without fetching ticks", async () => {
    const stats = await getDigitStats("frxGBPUSD");
    expect(stats.count).toBe(0);
    expect((stats as any).note).toMatch(/synthetic/i);
  });

  it("getDigitSnapshot rejects non-synthetic symbols before any network call", async () => {
    await expect(getDigitSnapshot("cryBTCUSD")).rejects.toThrow(/synthetic/i);
  });

  it("PredictionEngine never recommends digit contracts for non-synthetic symbols", async () => {
    const engine = new PredictionEngine();
    // Strongly rising prices → if any family were scored, Rise would win anyway;
    // assert the contractType family can never be digit-based on forex.
    const prices = makeTicks(120, (i) => i % 10).map((t, i) => t.price + i * 0.01);
    const pred = await engine.predict("frxEURUSD", prices);
    if (pred && pred.contractType) {
      expect(pred.contractType).toBe("Rise/Fall");
    }
    // And on synthetics the full family set is in play (digit families reachable).
    const synPred = await engine.predict(
      "R_100",
      makeTicks(120, () => 7).map((t) => t.price)
    );
    expect(synPred).not.toBeNull();
    expect(synPred!.prediction).toMatch(/OVER|UNDER|EVEN|ODD|MATCH|DIFF|NO CLEAR LEAN/);
  });
});

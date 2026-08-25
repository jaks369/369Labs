import { describe, it, expect } from "vitest";
import { calibrateConfidence } from "./signalStats";

// Deterministic PRNG so the test is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("calibrateConfidence — reliability of stated confidence vs outcomes", () => {
  it("perfectly calibrated reads yield a low Brier score and observed ≈ stated", () => {
    const rnd = mulberry32(42);
    const reads: Array<{ confidence: number; win: boolean }> = [];
    for (let i = 0; i < 2000; i++) {
      const confidence = 52 + Math.floor(rnd() * 7); // 52..58
      reads.push({ confidence, win: rnd() < confidence / 100 });
    }
    const res = calibrateConfidence(reads);
    expect(res.total).toBe(2000);
    expect(res.brierScore).toBeLessThan(0.25); // better than chance
    for (const b of res.buckets) {
      // Observed rate should sit inside a sane Wilson band around the stated midpoint.
      expect(b.observedWinRatePct).toBeGreaterThanOrEqual(b.wilsonLowPct);
      expect(b.observedWinRatePct).toBeLessThanOrEqual(b.wilsonHighPct);
      expect(Math.abs(b.observedWinRatePct - b.statedPct)).toBeLessThanOrEqual(8);
    }
  });

  it("overconfident reads are exposed: observed far below stated", () => {
    const reads = Array.from({ length: 500 }, () => ({ confidence: 57, win: false }));
    const res = calibrateConfidence(reads);
    const b = res.buckets.find((x) => x.label === "56–57%")!;
    expect(b.observedWinRatePct).toBe(0);
    expect(b.statedPct).toBeGreaterThanOrEqual(56);
    expect(res.brierScore).toBeGreaterThan(0.25);
  });

  it("skips empty buckets and handles all-loss/all-win edge cases", () => {
    const empty = calibrateConfidence([]);
    expect(empty.total).toBe(0);
    expect(empty.buckets).toHaveLength(0);

    const oneBucket = calibrateConfidence(Array.from({ length: 30 }, () => ({ confidence: 50.5, win: true })));
    expect(oneBucket.buckets).toHaveLength(1);
    expect(oneBucket.buckets[0].observedWinRatePct).toBe(100);
    expect(oneBucket.buckets[0].wilsonLowPct).toBeLessThan(100);
  });
});

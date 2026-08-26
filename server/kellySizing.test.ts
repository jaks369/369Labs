import { describe, it, expect } from "vitest";
import { kellyStakeSuggestion, KELLY_MAX_FRACTION, KELLY_FRACTION } from "./kellySizing";

const base = {
  winRate: 0.56,
  ciLow: 0.53,
  baseline: 0.5,
  payoutRatio: 0.95,
  sampleSize: 500,
};

describe("kellyStakeSuggestion — edge-aware position sizing", () => {
  it("suggests quarter-Kelly (capped) when CI-low clears baseline with enough samples", () => {
    const s = kellyStakeSuggestion(base);
    expect(s.ok).toBe(true);
    const fullKelly = (0.95 * 0.53 - 0.47) / 0.95; // ≈ 0.0347
    expect(s.fullKellyFraction).toBeCloseTo(fullKelly, 3);
    expect(s.fractionOfBalance).toBeCloseTo(Math.min(fullKelly * KELLY_FRACTION, KELLY_MAX_FRACTION), 4);
    expect(s.basis).toMatch(/CI-low/i);
  });

  it("caps at the maximum fraction even for large edges", () => {
    const s = kellyStakeSuggestion({ ...base, winRate: 0.8, ciLow: 0.75 });
    expect(s.ok).toBe(true);
    expect(s.fractionOfBalance).toBeLessThanOrEqual(KELLY_MAX_FRACTION);
  });

  it("refuses when the CI low does not clear the fair rate — no edge, no size", () => {
    const s = kellyStakeSuggestion({ ...base, ciLow: 0.49 });
    expect(s.ok).toBe(false);
    expect(s.fractionOfBalance).toBe(0);
    expect(s.reason).toMatch(/edge not established/i);
  });

  it("refuses on thin samples regardless of how good the rate looks", () => {
    const s = kellyStakeSuggestion({ ...base, sampleSize: 40 });
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/samples/i);
  });

  it("uses the CONSERVATIVE estimate: raising winRate alone changes nothing", () => {
    const a = kellyStakeSuggestion({ ...base, winRate: 0.56 });
    const b = kellyStakeSuggestion({ ...base, winRate: 0.99 });
    expect(a.fractionOfBalance).toBe(b.fractionOfBalance);
  });

  it("rejects garbage inputs without throwing", () => {
    for (const bad of [
      { ...base, payoutRatio: -1 },
      { ...base, winRate: NaN },
      { ...base, baseline: Infinity },
    ]) {
      const s = kellyStakeSuggestion(bad);
      expect(s.ok).toBe(false);
      expect(s.fractionOfBalance).toBe(0);
    }
  });
});

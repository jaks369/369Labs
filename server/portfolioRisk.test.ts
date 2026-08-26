import { describe, it, expect } from "vitest";
import { computePortfolioHeat } from "./portfolioRisk";

describe("computePortfolioHeat — aggregate open-risk cap", () => {
  it("computes heat as open stake over balance", () => {
    const h = computePortfolioHeat([100, 50, 25], 1000);
    expect(h.openStake).toBe(175);
    expect(h.heatPct).toBeCloseTo(17.5);
  });

  it("default cap is 20% of equity", () => {
    const h = computePortfolioHeat([150], 1000);
    expect(h.capPct).toBe(20);
    expect(h.wouldAllowNew(50)).toBe(true); // 150+50=200 = exactly 20%
    expect(h.wouldAllowNew(51)).toBe(false);
  });

  it("remaining capacity never goes negative", () => {
    const h = computePortfolioHeat([250], 1000); // already at 25% — over cap
    expect(h.remainingStakeCapacity).toBe(0);
    expect(h.wouldAllowNew(1)).toBe(false);
  });

  it("unknown/zero balance → not gateable (fail-open for display, callers fall back)", () => {
    for (const balance of [0, -5, NaN]) {
      const h = computePortfolioHeat([100], balance);
      expect(h.wouldAllowNew(999)).toBe(true);
      expect(h.heatPct).toBe(0);
    }
  });

  it("negative or garbage stakes are clamped, not subtracted", () => {
    const h = computePortfolioHeat([100, NaN, -50, "20" as any], 1000);
    expect(h.openStake).toBe(120);
  });
});

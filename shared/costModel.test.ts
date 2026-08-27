import { describe, it, expect } from "vitest";
import { estimateExecutionCost, computeNetConfidence, expectedMovePips } from "./costModel";

describe("estimateExecutionCost", () => {
  it("returns minimal cost for synthetic indices", () => {
    const cost = estimateExecutionCost("R_100");
    expect(cost.totalPips).toBe(0.1);
    expect(cost.spreadPips).toBe(0.1);
    expect(cost.slippagePips).toBe(0);
    expect(cost.sessionQuality).toBe("peak");
    expect(cost.isEventDay).toBe(false);
    expect(cost.reasoning.some(r => r.includes("Synthetic index"))).toBe(true);
  });

  it("returns minimal cost for 1HZ indices", () => {
    const cost = estimateExecutionCost("1HZ10");
    expect(cost.totalPips).toBe(0.1);
  });

  it("returns minimal cost for BOOM indices", () => {
    const cost = estimateExecutionCost("BOOM30");
    expect(cost.totalPips).toBe(0.1);
  });

  it("returns minimal cost for CRASH indices", () => {
    const cost = estimateExecutionCost("CRASH30");
    expect(cost.totalPips).toBe(0.1);
  });

  it("uses peak session defaults for forex", () => {
    const cost = estimateExecutionCost("EURUSD", { sessionQuality: "peak" });
    expect(cost.spreadPips).toBe(0.4);
    expect(cost.slippagePips).toBe(0.1);
    expect(cost.totalPips).toBeCloseTo(0.5, 1);
    expect(cost.sessionQuality).toBe("peak");
  });

  it("uses thin session defaults for forex", () => {
    const cost = estimateExecutionCost("GBPUSD", { sessionQuality: "thin" });
    expect(cost.spreadPips).toBe(2.5);
    expect(cost.slippagePips).toBe(0.8);
    expect(cost.totalPips).toBeCloseTo(3.3, 1);
  });

  it("applies event-day slippage multiplier", () => {
    const normal = estimateExecutionCost("EURUSD", { sessionQuality: "good" });
    const event = estimateExecutionCost("EURUSD", { sessionQuality: "good", isEventDay: true });
    expect(event.slippagePips).toBeGreaterThan(normal.slippagePips);
    expect(event.isEventDay).toBe(true);
    expect(event.reasoning.some(r => r.includes("Event-day"))).toBe(true);
  });

  it("applies volatility multiplier", () => {
    const normal = estimateExecutionCost("EURUSD", { sessionQuality: "good" });
    const vol = estimateExecutionCost("EURUSD", { sessionQuality: "good", volatilityMultiplier: 2.0 });
    expect(vol.slippagePips).toBeGreaterThan(normal.slippagePips);
  });

  it("uses spread override when provided", () => {
    const cost = estimateExecutionCost("EURUSD", { spreadOverridePips: 5.0 });
    expect(cost.spreadPips).toBe(5.0);
  });

  it("commission is always 0 (Deriv is spread-only)", () => {
    const cost = estimateExecutionCost("EURUSD");
    expect(cost.commissionPips).toBe(0);
  });
});

describe("computeNetConfidence", () => {
  it("returns gross confidence when no edge or no move", () => {
    const result = computeNetConfidence(70, 0.5, 0, 0.5, 5);
    expect(result.netConfidence).toBe(70);
    expect(result.costImpactPp).toBe(0);
  });

  it("reduces confidence when costs eat part of the edge", () => {
    const result = computeNetConfidence(70, 0.5, 10, 1.0, 10);
    expect(result.netConfidence).toBeLessThan(70);
    expect(result.netConfidence).toBeGreaterThan(50);
    expect(result.costImpactPp).toBeGreaterThan(0);
  });

  it("drops to baseline when costs eat entire edge", () => {
    const result = computeNetConfidence(70, 0.5, 10, 100, 10);
    expect(result.netConfidence).toBeCloseTo(50, 0);
    expect(result.costImpactPp).toBe(10);
  });

  it("never goes below 0", () => {
    const result = computeNetConfidence(30, 0.5, 5, 1000, 1);
    expect(result.netConfidence).toBeGreaterThanOrEqual(0);
  });

  it("never goes above 100", () => {
    const result = computeNetConfidence(95, 0.5, 20, 0, 100);
    expect(result.netConfidence).toBeLessThanOrEqual(100);
  });

  it("returns reasoning breakdown", () => {
    const result = computeNetConfidence(70, 0.5, 10, 1.0, 10);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning.some(r => r.includes("Cost"))).toBe(true);
  });
});

describe("expectedMovePips", () => {
  it("returns positive for forex", () => {
    expect(expectedMovePips("EURUSD", 60)).toBeGreaterThan(0);
  });

  it("returns positive for synthetic", () => {
    expect(expectedMovePips("R_100", 60)).toBeGreaterThan(0);
  });

  it("scales with window ticks", () => {
    const small = expectedMovePips("EURUSD", 10);
    const large = expectedMovePips("EURUSD", 100);
    expect(large).toBeGreaterThan(small);
  });
});

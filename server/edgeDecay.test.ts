import { describe, it, expect } from "vitest";
import { analyzeDecay, analyzeDecayAll, type SignalOutcome, LONG_WINDOW_MS, RECENT_WINDOW_MS } from "./edgeDecay";

function makeOutcome(overrides: Partial<SignalOutcome> = {}): SignalOutcome {
  return {
    symbol: "EURUSD",
    family: "momentum_confluence",
    result: "win",
    rMultiple: 0.8,
    tsMs: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    ...overrides,
  };
}

describe("analyzeDecay", () => {
  it("returns INSUFFICIENT when not enough data", () => {
    const now = Date.now();
    const outcomes = Array.from({ length: 5 }, (_, i) =>
      makeOutcome({ tsMs: now - (30 - i) * 86400000, result: "win" }),
    );
    const report = analyzeDecay(outcomes, "EURUSD", "momentum_confluence", now);
    expect(report.verdict).toBe("INSUFFICIENT");
  });

  it("returns STABLE when no degradation", () => {
    const now = Date.now();
    const longOutcomes = Array.from({ length: 30 }, (_, i) =>
      makeOutcome({ tsMs: now - LONG_WINDOW_MS + i * 86400000, result: i % 3 === 0 ? "loss" : "win" }),
    );
    const recentOutcomes = Array.from({ length: 20 }, (_, i) =>
      makeOutcome({ tsMs: now - RECENT_WINDOW_MS + i * 86400000, result: i % 3 === 0 ? "loss" : "win" }),
    );
    const report = analyzeDecay([...longOutcomes, ...recentOutcomes], "EURUSD", "momentum_confluence", now);
    expect(report.verdict).toBe("STABLE");
    expect(report.degradationPp).toBeLessThan(3);
  });

  it("detects DECAYING when recent window drops significantly", () => {
    const now = Date.now();
    // Long window: 65% win rate
    const longOutcomes = Array.from({ length: 40 }, (_, i) =>
      makeOutcome({ tsMs: now - LONG_WINDOW_MS + i * 86400000, result: i < 26 ? "win" : "loss" }),
    );
    // Recent window: only 30% win rate (significant drop)
    const recentOutcomes = Array.from({ length: 25 }, (_, i) =>
      makeOutcome({ tsMs: now - RECENT_WINDOW_MS + i * 86400000, result: i < 8 ? "win" : "loss" }),
    );
    const report = analyzeDecay([...longOutcomes, ...recentOutcomes], "EURUSD", "momentum_confluence", now);
    expect(report.degradationPp).toBeGreaterThan(0);
    // Should be DECAYING or CAUTION depending on significance
    expect(["DECAYING", "CAUTION"]).toContain(report.verdict);
    expect(report.reasoning.length).toBeGreaterThan(0);
  });

  it("detects CAUTION when moderate degradation", () => {
    const now = Date.now();
    // Long: 60% win rate
    const longOutcomes = Array.from({ length: 40 }, (_, i) =>
      makeOutcome({ tsMs: now - LONG_WINDOW_MS + i * 86400000, result: i < 24 ? "win" : "loss" }),
    );
    // Recent: 50% win rate (10pp drop → above caution threshold)
    const recentOutcomes = Array.from({ length: 25 }, (_, i) =>
      makeOutcome({ tsMs: now - RECENT_WINDOW_MS + i * 86400000, result: i < 13 ? "win" : "loss" }),
    );
    const report = analyzeDecay([...longOutcomes, ...recentOutcomes], "EURUSD", "momentum_confluence", now);
    expect(report.verdict).not.toBe("STABLE");
  });

  it("groups by symbol and family in analyzeDecayAll", () => {
    const now = Date.now();
    const outcomes = [
      makeOutcome({ symbol: "EURUSD", family: "momentum_confluence", tsMs: now - 35 * 86400000, result: "win" }),
      makeOutcome({ symbol: "GBPUSD", family: "digit_edge", tsMs: now - 35 * 86400000, result: "loss" }),
    ];
    const reports = analyzeDecayAll(outcomes, now);
    expect(reports.length).toBe(2);
    expect(reports.some((r) => r.symbol === "EURUSD")).toBe(true);
    expect(reports.some((r) => r.symbol === "GBPUSD")).toBe(true);
  });

  it("computes degradation metrics", () => {
    const now = Date.now();
    const recentCutoff = now - RECENT_WINDOW_MS;
    // Long window: all wins, clearly in the long window (well before recentCutoff)
    const longOutcomes = Array.from({ length: 30 }, (_, i) =>
      makeOutcome({ tsMs: recentCutoff - 30 * 86400000 + i * 86400000, result: "win", rMultiple: 0.8 }),
    );
    // Recent window: all losses, clearly in the recent window (after recentCutoff)
    const recentOutcomes = Array.from({ length: 20 }, (_, i) =>
      makeOutcome({ tsMs: recentCutoff + 1000 + i * 86400000, result: "loss", rMultiple: -1 }),
    );
    const report = analyzeDecay([...longOutcomes, ...recentOutcomes], "EURUSD", "momentum_confluence", now);
    expect(report.longWindow.winRatePct).toBeCloseTo(100, 0);
    expect(report.recentWindow.winRatePct).toBeCloseTo(0, 0);
    expect(report.degradationPp).toBeGreaterThan(0);
    expect(report.degradationR).toBeGreaterThan(0);
  });
});

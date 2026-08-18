import { describe, it, expect } from "vitest";
import { strengthFor, windowTicksFor, scanSignalForSymbol } from "./indicatorSignal";

describe("indicatorSignal", () => {
  it("buckets confidence into honest strengths", () => {
    expect(strengthFor(80)).toBe("STRONG");
    expect(strengthFor(62)).toBe("MEDIUM");
    expect(strengthFor(40)).toBe("WEAK");
  });

  it("picks a short horizon for 1-second indices", () => {
    expect(windowTicksFor("1HZ100V", 1)).toBe(60);
  });

  it("scales the horizon with the tick cadence", () => {
    expect(windowTicksFor("R_100", 2)).toBeGreaterThanOrEqual(12);
  });

  it("returns null when there is not enough data", () => {
    const res = scanSignalForSymbol("R_100", [{ price: 1, epoch: 1 }, { price: 2, epoch: 2 }]);
    expect(res.signal).toBeNull();
    expect(res.diagnostics.candles).toBe(0);
  });

  it("produces a directional signal from a clean uptrend", () => {
    const ticks: { price: number; epoch: number }[] = [];
    for (let i = 2000; i >= 0; i--) {
      ticks.push({ price: 100 + (2000 - i) * 0.025, epoch: 1_600_000_000 + i });
    }
    const res = scanSignalForSymbol("1HZ10V", ticks);
    expect(res.diagnostics.candles).toBeGreaterThanOrEqual(8);
    expect(res.signal).not.toBeNull();
    expect(["up", "down"]).toContain(res.signal!.direction);
    expect(res.signal!.confidence).toBeGreaterThanOrEqual(50);
    expect(res.signal!.family).toBe("momentum_confluence");
  });

  it("leads the reasons with an honest indicator tally, not a probability", () => {
    const ticks: { price: number; epoch: number }[] = [];
    for (let i = 2000; i >= 0; i--) {
      ticks.push({ price: 100 + (2000 - i) * 0.025, epoch: 1_600_000_000 + i });
    }
    const res = scanSignalForSymbol("1HZ10V", ticks);
    expect(res.signal).not.toBeNull();
    const first = res.signal!.reasons[0];
    expect(first).toMatch(/^\d+\/\d+ indicators agree$/);
    expect(first).not.toMatch(/%/);
    expect(res.signal!.votes.total).toBeGreaterThanOrEqual(2);
  });
});
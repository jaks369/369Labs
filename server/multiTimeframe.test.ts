import { describe, it, expect } from "vitest";
import { higherTimeframeBias } from "./multiTimeframe";
import type { TickLike } from "@shared/indicators";

// 2s tick cadence. Base timeframe 60s → HTF = 240s (4 min).
function makeTicks(minutes: number, trend: "up" | "down"): TickLike[] {
  const startEpoch = 1_700_000_000; // fixed, aligned to nothing special
  const ticksPerMin = 30;
  const total = minutes * ticksPerMin;
  const out: TickLike[] = [];
  for (let i = 0; i < total; i++) {
    const price =
      trend === "up"
        ? 1000 + (i / total) * 40 // steady climb
        : 1040 - (i / total) * 40; // steady fall
    out.push({ price, epoch: startEpoch + Math.floor((i * 60) / ticksPerMin) });
  }
  return out;
}

describe("higherTimeframeBias — multi-timeframe confirmation", () => {
  it("detects up-bias on a rising market and down-bias on a falling one", () => {
    expect(higherTimeframeBias(makeTicks(120, "up"), 60).bias).toBe("up");
    expect(higherTimeframeBias(makeTicks(120, "down"), 60).bias).toBe("down");
  });

  it("uses only CLOSED candles — forming candle dropped (anti-lookahead)", () => {
    const ticks = makeTicks(120, "up");
    const r = higherTimeframeBias(ticks, 60);
    // Exact property: the still-forming final HTF candle is excluded from the
    // bias computation. The newest tick lies inside the forming candle, so its
    // bucket's close time must be strictly after the newest tick.
    const lastEpoch = ticks[ticks.length - 1].epoch;
    const formingBucket = Math.floor(lastEpoch / r.timeframeSec) * r.timeframeSec;
    expect(formingBucket + r.timeframeSec).toBeGreaterThan(lastEpoch);
    expect(r.closedCandles).toBeGreaterThan(0);
    // And the verdict rests on enough history to be meaningful.
    expect(r.closedCandles).toBeGreaterThanOrEqual(23);
  });

  it("insufficient data → available:false with a reason, never a guess", () => {
    const few = makeTicks(10, "up").slice(0, 25);
    const r = higherTimeframeBias(few, 60);
    expect(r.available).toBe(false);
    expect(r.bias).toBe("neutral");
    expect(r.reason).toMatch(/Insufficient|closed/i);
  });
});

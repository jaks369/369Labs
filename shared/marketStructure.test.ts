import { describe, it, expect } from "vitest";
import { Candle } from "./indicators";
import { detectSwings, classifySwings } from "./swingPoints";
import { labelStructure } from "./marketStructure";

function zigzag(highs: number[], lows: number[]): Candle[] {
  return highs.map((h, i) => ({
    time: i,
    open: i === 0 ? lows[i] : (highs[i - 1] + lows[i - 1]) / 2,
    high: h,
    low: lows[i],
    close: (h + lows[i]) / 2,
  }));
}

describe("marketStructure", () => {
  it("returns neutral for insufficient swings", () => {
    const candles = zigzag([10, 11, 10], [9, 10, 9]);
    const { currentBias } = labelStructure(candles, { internalLookback: 1, smoothPeriod: 0 });
    expect(currentBias).toBe("neutral");
  });

  it("detects bullish structure from HH+HL", () => {
    // Zigzag: peaks 110, 120, 130 (rising); valleys 93, 103, 113 (rising)
    const candles = zigzag(
      [100, 110, 108, 120, 118, 130, 128],
      [90,  95,  93, 105, 103, 115, 113],
    );
    const { currentBias, points } = labelStructure(candles, {
      internalLookback: 1,
      smoothPeriod: 0,
    });
    const events = points.filter((p) => p.event);
    expect(currentBias).toBe("bullish");
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("detects bearish structure from LH+LL", () => {
    // Zigzag: peaks 125, 115, 105 (falling); valleys 110, 100, 90 (falling)
    const candles = zigzag(
      [130, 120, 125, 110, 115, 100, 105],
      [120, 115, 110, 105, 100,  95,  90],
    );
    const { currentBias, points } = labelStructure(candles, {
      internalLookback: 1,
      smoothPeriod: 0,
    });
    const events = points.filter((p) => p.event);
    expect(currentBias).toBe("bearish");
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("detects CHoCH on trend reversal", () => {
    // Bullish: peaks 110, 120, 130; then bearish: peak 115 (LH)
    // Needs zigzag peaks so swing detector finds them with lookback=1
    const candles = zigzag(
      [100, 110, 105, 120, 115, 130, 120, 110, 115, 100],
      [90,  95,  92, 105, 100, 115, 108,  98, 100,  85],
    );
    const { points } = labelStructure(candles, {
      internalLookback: 1,
      smoothPeriod: 0,
    });
    const choch = points.filter((p) => p.event === "CHoCH");
    expect(choch.length).toBeGreaterThanOrEqual(1);
  });
});

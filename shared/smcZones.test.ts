import { describe, it, expect } from "vitest";
import { Candle } from "./indicators";
import { detectSmcZones } from "./smcZones";

function candle(o: number, h: number, l: number, c: number): Candle {
  return { time: 0, open: o, high: h, low: l, close: c };
}

describe("smcZones", () => {
  it("detects bullish FVG", () => {
    const candles = [
      candle(100, 105, 98, 102),   // c1: high=105
      candle(102, 115, 100, 112),  // impulse
      candle(112, 120, 106, 118),  // c3: low=106
    ];
    const zones = detectSmcZones(candles, { internalLookback: 1, smoothPeriod: 0 });
    const fvg = zones.filter((z) => z.type === "fvg" && z.direction === "bullish");
    expect(fvg.length).toBe(1);
    expect(fvg[0].range).toEqual([105, 106]);
  });

  it("detects bearish FVG", () => {
    const candles = [
      candle(100, 105, 98, 102),  // c1: low=98
      candle(102, 103, 90, 92),   // impulse down
      candle(92, 97, 85, 88),     // c3: high=97
    ];
    const zones = detectSmcZones(candles, { internalLookback: 1, smoothPeriod: 0 });
    const fvg = zones.filter((z) => z.type === "fvg" && z.direction === "bearish");
    expect(fvg.length).toBe(1);
    expect(fvg[0].range).toEqual([97, 98]);
  });

  it("detects bullish order block", () => {
    const candles = [
      candle(100, 102, 98, 99),   // bearish candle (close < open)
      candle(99, 101, 97, 100),
      candle(100, 102, 99, 101),
      candle(101, 103, 100, 102),
      candle(102, 120, 101, 118), // strong bullish impulse
    ];
    const zones = detectSmcZones(candles, { internalLookback: 1, smoothPeriod: 0 });
    const ob = zones.filter((z) => z.type === "order_block" && z.direction === "bullish");
    expect(ob.length).toBeGreaterThanOrEqual(1);
  });

  it("detects liquidity sweeps", () => {
    const candles = [
      candle(85, 90, 82, 88),
      candle(88, 95, 86, 93),
      candle(100, 110, 95, 108),  // swing high at 110 (higher than neighbors)
      candle(108, 105, 100, 102), // lower high
      candle(102, 115, 100, 101), // wick above 110, close below → sweep
    ];
    const zones = detectSmcZones(candles, { internalLookback: 1, smoothPeriod: 0 });
    const sweeps = zones.filter((z) => z.type === "liquidity_sweep");
    expect(sweeps.length).toBe(1);
    expect(sweeps[0].direction).toBe("bearish");
  });

  it("returns empty for short input", () => {
    const candles = [candle(100, 101, 99, 100), candle(100, 101, 99, 100)];
    const zones = detectSmcZones(candles);
    expect(zones).toHaveLength(0);
  });

  it("marks FVG as filled when price returns", () => {
    const candles = [
      candle(100, 105, 98, 102),
      candle(102, 115, 100, 112),
      candle(112, 120, 106, 118),
      candle(118, 119, 104, 105), // price returns into FVG zone
    ];
    const zones = detectSmcZones(candles, { internalLookback: 1, smoothPeriod: 0 });
    const fvg = zones.find((z) => z.type === "fvg" && z.direction === "bullish");
    expect(fvg).toBeDefined();
    expect(fvg!.filled).toBe(true);
  });
});

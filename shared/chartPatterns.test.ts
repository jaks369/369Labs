import { describe, it, expect } from "vitest";
import { Candle } from "./indicators";
import { detectChartPatterns } from "./chartPatterns";

function zigzag(highs: number[], lows: number[]): Candle[] {
  return highs.map((h, i) => ({
    time: i,
    open: i === 0 ? lows[i] : (highs[i - 1] + lows[i - 1]) / 2,
    high: h,
    low: lows[i],
    close: (h + lows[i]) / 2,
  }));
}

describe("chartPatterns", () => {
  it("returns empty for short input", () => {
    const candles = zigzag([10, 11], [9, 10]);
    expect(detectChartPatterns(candles)).toHaveLength(0);
  });

  it("detects head and shoulders", () => {
    // Three peaks: left shoulder ~110, head ~120, right shoulder ~110
    // Two troughs between them forming neckline
    const candles = zigzag(
      [100, 110, 105, 120, 105, 110, 100],
      [90,  98,  95, 100,  95,  98,  90],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    const hs = patterns.filter((p) => p.type === "head_and_shoulders");
    expect(hs.length).toBeGreaterThanOrEqual(1);
    expect(hs[0].direction).toBe("bearish");
    expect(hs[0].levels.some((l) => l.name === "neckline")).toBe(true);
  });

  it("detects double top", () => {
    // Two peaks at same level with trough between
    const candles = zigzag(
      [100, 115, 105, 115, 100],
      [90,  100,  98, 100,  90],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    const dt = patterns.filter((p) => p.type === "double_top");
    expect(dt.length).toBeGreaterThanOrEqual(1);
    expect(dt[0].direction).toBe("bearish");
  });

  it("detects double bottom", () => {
    const candles = zigzag(
      [110, 100, 105, 100, 110],
      [100,  85,  98,  85, 100],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    const db = patterns.filter((p) => p.type === "double_bottom");
    expect(db.length).toBeGreaterThanOrEqual(1);
    expect(db[0].direction).toBe("bullish");
  });

  it("detects ascending triangle", () => {
    // Flat resistance at 110, rising swing lows: 85, 87, 89
    const candles = zigzag(
      [100, 110, 105, 110, 105, 110, 108],
      [90,  85,  95,  87,  97,  89,  99],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    const tri = patterns.filter((p) => p.type === "ascending_triangle");
    expect(tri.length).toBeGreaterThanOrEqual(1);
    expect(tri[0].direction).toBe("bullish");
  });

  it("detects descending triangle", () => {
    // Flat support at 95, falling swing highs: 110, 108, 106
    const candles = zigzag(
      [110, 105, 108, 103, 106, 101, 104],
      [100,  95,  98,  95,  97,  95,  96],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    const tri = patterns.filter((p) => p.type === "descending_triangle");
    expect(tri.length).toBeGreaterThanOrEqual(1);
    expect(tri[0].direction).toBe("bearish");
  });

  it("all results have valid fields", () => {
    const candles = zigzag(
      [100, 115, 105, 125, 105, 115, 100],
      [90, 100, 95, 105, 95, 100, 90],
    );
    const patterns = detectChartPatterns(candles, { internalLookback: 1, smoothPeriod: 0 });
    for (const p of patterns) {
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.reason).toBeTruthy();
      expect(p.swings.length).toBeGreaterThan(0);
      expect(p.levels.length).toBeGreaterThan(0);
    }
  });
});

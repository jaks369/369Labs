import { describe, it, expect } from "vitest";
import { computeStructureTrade, isSweepConfirmedByStructure } from "./structureTrade";
import { Candle } from "./indicators";

/** Helper: generate a simple trending candle series */
function makeCandles(prices: number[], opts?: { volatility?: number }): Candle[] {
  const vol = opts?.volatility ?? 0.5;
  return prices.map((p, i) => ({
    time: i * 60,
    open: p - vol,
    high: p + vol,
    low: p - vol * 2,
    close: p,
    volume: 100,
  }));
}

/** Helper: generate candles with a clear swing structure */
function makeStructuredCandles(): Candle[] {
  // Create a market with: swing low → rally → swing high → pullback → higher low → rally
  const base = 1.1000;
  const candles: Candle[] = [];
  const pattern = [
    // Initial downtrend to swing low
    -2, -3, -4, -5, -6, -5, -4, -3, // swing low at index 7 (price ~1.0994)
    // Rally to swing high
    0, 2, 4, 6, 8, 10, 12, 14, 16, // swing high at index 16 (price ~1.1016)
    // Pullback to higher low
    14, 12, 10, 8, 6, 5, 4, 3, 2, // higher low at index 25 (price ~1.1002)
    // Rally continuation
    4, 6, 8, 10, 12, 14, 16, 18, 20,
  ];

  for (let i = 0; i < pattern.length; i++) {
    const p = base + pattern[i] * 0.0001;
    candles.push({
      time: i * 60,
      open: p - 0.00005,
      high: p + 0.0001,
      low: p - 0.0001,
      close: p,
      volume: 100,
    });
  }
  return candles;
}

describe("computeStructureTrade", () => {
  it("returns valid SL/TP for a long signal with bullish structure", () => {
    const candles = makeStructuredCandles();
    const entryPrice = candles[candles.length - 1].close;

    const result = computeStructureTrade(candles, "up", entryPrice);

    expect(result.stopLoss).not.toBeNull();
    expect(result.stopLoss).toBeLessThan(entryPrice);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.zoneFilter).toBeDefined();
  });

  it("returns valid SL/TP for a short signal with bearish structure", () => {
    // Reverse the candles to create bearish structure
    const structured = makeStructuredCandles();
    const candles = structured.map((c, i) => ({
      ...c,
      time: c.time,
      open: c.close + 0.00005,
      high: c.close + 0.0001,
      low: c.close - 0.0001,
      close: 2 * structured[structured.length - 1].close - c.close, // mirror
    }));
    const entryPrice = candles[candles.length - 1].close;

    const result = computeStructureTrade(candles, "down", entryPrice);

    expect(result.stopLoss).not.toBeNull();
    expect(result.stopLoss).toBeGreaterThan(entryPrice);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("places stop below the nearest bullish zone for a long", () => {
    const candles = makeStructuredCandles();
    const entryPrice = candles[candles.length - 1].close;

    const result = computeStructureTrade(candles, "up", entryPrice);

    if (result.slSource) {
      // Stop should be below the zone range
      expect(result.stopLoss).toBeLessThan(result.slSource.range[0]);
    }
  });

  it("places stop above the nearest bearish zone for a short", () => {
    const candles = makeStructuredCandles();
    const entryPrice = candles[candles.length - 1].close;

    const result = computeStructureTrade(candles, "down", entryPrice);

    if (result.slSource) {
      expect(result.stopLoss).toBeGreaterThan(result.slSource.range[1]);
    }
  });

  it("computes take-profit at minimum 2:1 R:R when no liquidity target", () => {
    // Flat market with no clear structure
    const candles = Array.from({ length: 50 }, (_, i) => ({
      time: i * 60,
      open: 1.1000 + Math.sin(i * 0.3) * 0.0005,
      high: 1.1000 + Math.sin(i * 0.3) * 0.0005 + 0.0001,
      low: 1.1000 + Math.sin(i * 0.3) * 0.0005 - 0.0001,
      close: 1.1000 + Math.sin(i * 0.3) * 0.0005,
      volume: 100,
    }));
    const entryPrice = candles[candles.length - 1].close;

    const result = computeStructureTrade(candles, "up", entryPrice);

    if (result.stopLoss !== null && result.takeProfit !== null) {
      const slDistance = entryPrice - result.stopLoss;
      const tpDistance = result.takeProfit - entryPrice;
      expect(tpDistance / slDistance).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("rejects premium-zone longs via zone filter", () => {
    // Create candles with a clear dealing range using large moves
    // Pattern: starts low, rallies to high, pulls back — dealing range is low→high
    const candles: Candle[] = [];
    // Phase 1 (0-20): ramp up from 1.0950 to 1.1050
    // Phase 2 (21-40): sustain high at 1.1050
    // Phase 3 (41-60): ramp down to 1.1000
    // Phase 4 (61-80): sustain around 1.1000
    for (let i = 0; i < 80; i++) {
      let p: number;
      if (i <= 20) p = 1.0950 + (i / 20) * 0.0100; // ramp to 1.1050
      else if (i <= 40) p = 1.1050; // high plateau
      else if (i <= 60) p = 1.1050 - ((i - 41) / 19) * 0.0050; // ramp down
      else p = 1.1000; // mid plateau

      candles.push({
        time: i * 60,
        open: p - 0.00005,
        high: p + 0.0001,
        low: p - 0.0001,
        close: p,
        volume: 100,
      });
    }
    // Entry at 1.1055 — above the high of the dealing range (premium)
    const entryPrice = 1.1055;

    const result = computeStructureTrade(candles, "up", entryPrice);

    // The zone filter should detect this is above midpoint
    expect(result.zoneFilter.zone).not.toBe("discount");
  });

  it("accepts discount-zone longs via zone filter", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 80; i++) {
      let p: number;
      if (i <= 20) p = 1.0950 + (i / 20) * 0.0100;
      else if (i <= 40) p = 1.1050;
      else if (i <= 60) p = 1.1050 - ((i - 41) / 19) * 0.0050;
      else p = 1.1000;

      candles.push({
        time: i * 60,
        open: p - 0.00005,
        high: p + 0.0001,
        low: p - 0.0001,
        close: p,
        volume: 100,
      });
    }
    // Entry at 1.0945 — below midpoint (discount)
    const entryPrice = 1.0945;

    const result = computeStructureTrade(candles, "up", entryPrice);

    // The zone filter should detect this is below midpoint
    expect(result.zoneFilter.zone).not.toBe("premium");
  });

  it("returns null SL/TP gracefully with minimal data", () => {
    const candles = makeCandles([1.1, 1.1001, 1.1002]);
    const result = computeStructureTrade(candles, "up", 1.1002);

    // Should not crash, even with minimal data
    expect(result).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });
});

describe("isSweepConfirmedByStructure", () => {
  it("returns false when insufficient data after sweep", () => {
    const candles = makeCandles([1, 2, 3, 4, 5]);
    const result = isSweepConfirmedByStructure(candles, 4, "bullish");
    expect(result.confirmed).toBe(false);
  });

  it("returns false when no BOS after sweep", () => {
    // Flat market — no structure break
    const candles = Array.from({ length: 30 }, () => ({
      time: 0,
      open: 1.1,
      high: 1.1001,
      low: 1.0999,
      close: 1.1,
      volume: 100,
    }));
    const result = isSweepConfirmedByStructure(candles, 10, "bullish");
    expect(result.confirmed).toBe(false);
  });
});

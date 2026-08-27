import { describe, it, expect } from "vitest";
import { computeDxyContext } from "./intermarketContext";

describe("computeDxyContext", () => {
  const makePrices = (direction: "up" | "down", count = 20): number[] => {
    const start = 100;
    return Array.from({ length: count }, (_, i) =>
      direction === "up" ? start + i * 0.5 : start - i * 0.5
    );
  };

  it("returns null for insufficient data", () => {
    expect(computeDxyContext([100, 101], "rise", "EURUSD")).toBeNull();
  });

  it("detects bullish DXY with inverse pair (EUR/USD)", () => {
    const prices = makePrices("up");
    const ctx = computeDxyContext(prices, "rise", "EURUSD");
    expect(ctx).not.toBeNull();
    expect(ctx!.trend).toBe("bullish");
    expect(ctx!.aligned).toBe(false);
    expect(ctx!.adjustment).toBe(-8);
  });

  it("detects bearish DXY with inverse pair aligns with rise", () => {
    const prices = makePrices("down");
    const ctx = computeDxyContext(prices, "rise", "EURUSD");
    expect(ctx!.trend).toBe("bearish");
    expect(ctx!.aligned).toBe(true);
    expect(ctx!.adjustment).toBe(0);
  });

  it("detects bullish DXY with direct pair (USD/JPY) aligns", () => {
    const prices = makePrices("up");
    const ctx = computeDxyContext(prices, "rise", "USDJPY");
    expect(ctx!.trend).toBe("bullish");
    expect(ctx!.aligned).toBe(true);
    expect(ctx!.adjustment).toBe(0);
  });

  it("neutral DXY always aligns", () => {
    const flat = Array.from({ length: 20 }, () => 100);
    const ctx = computeDxyContext(flat, "rise", "EURUSD");
    expect(ctx!.trend).toBe("neutral");
    expect(ctx!.aligned).toBe(true);
    expect(ctx!.adjustment).toBe(0);
  });
});

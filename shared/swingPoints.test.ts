import { describe, it, expect } from "vitest";
import { Candle } from "./indicators";
import { detectSwings, classifySwings } from "./swingPoints";

function c(h: number, l: number): Candle {
  return { time: 0, open: h, high: h, low: l, close: (h + l) / 2 };
}

describe("swingPoints", () => {
  it("returns empty for short input", () => {
    const candles = [c(10, 9), c(11, 10), c(12, 11)];
    const { internal, external } = detectSwings(candles);
    expect(internal).toHaveLength(0);
    expect(external).toHaveLength(0);
  });

  it("detects internal swings with small lookback", () => {
    const candles = [c(110, 100), c(109, 99), c(108, 98), c(107, 95), c(108, 98), c(109, 99), c(110, 100)];
    const { internal } = detectSwings(candles, { internalLookback: 2, smoothPeriod: 0 });
    const lows = internal.filter((s) => s.type === "low");
    expect(lows.length).toBeGreaterThanOrEqual(1);
    expect(lows[0].index).toBe(3);
    expect(lows[0].price).toBe(95);
  });

  it("detects external swings with larger lookback", () => {
    const candles = [
      c(112, 102), c(111, 101), c(110, 100), c(109, 99), c(108, 98), c(107, 97), c(106, 95),
      c(107, 97), c(108, 98), c(109, 99), c(110, 100), c(111, 101), c(112, 102),
    ];
    const { external } = detectSwings(candles, { externalLookback: 5, smoothPeriod: 0 });
    const lows = external.filter((s) => s.type === "low");
    expect(lows.length).toBeGreaterThanOrEqual(1);
  });

  it("detects both highs and lows", () => {
    const candles = [
      c(100, 95), c(105, 98), c(110, 103), c(105, 98),
      c(100, 95), c(105, 98), c(110, 103), c(105, 98), c(100, 95),
    ];
    const { internal } = detectSwings(candles, { internalLookback: 2, smoothPeriod: 0 });
    expect(internal.filter((s) => s.type === "high").length).toBeGreaterThanOrEqual(1);
    expect(internal.filter((s) => s.type === "low").length).toBeGreaterThanOrEqual(1);
  });

  it("swings are sorted by index", () => {
    const candles = Array.from({ length: 20 }, (_, i) =>
      c(100 + Math.sin(i * 0.5) * 10, 100 + Math.sin(i * 0.5) * 10 - 5)
    );
    const { internal } = detectSwings(candles, { internalLookback: 3 });
    for (let i = 1; i < internal.length; i++) {
      expect(internal[i].index).toBeGreaterThan(internal[i - 1].index);
    }
  });
});

describe("classifySwings", () => {
  it("labels HH/HL for rising swings", () => {
    const swings = [
      { index: 0, price: 100, type: "high" as const },
      { index: 5, price: 90, type: "low" as const },
      { index: 10, price: 110, type: "high" as const },
      { index: 15, price: 95, type: "low" as const },
    ];
    const classified = classifySwings(swings);
    expect(classified[0].classification).toBe("first");
    expect(classified[1].classification).toBe("first");
    expect(classified[2].classification).toBe("HH");
    expect(classified[3].classification).toBe("HL");
  });

  it("labels LH/LL for falling swings", () => {
    const swings = [
      { index: 0, price: 110, type: "high" as const },
      { index: 5, price: 95, type: "low" as const },
      { index: 10, price: 105, type: "high" as const },
      { index: 15, price: 90, type: "low" as const },
    ];
    const classified = classifySwings(swings);
    expect(classified[2].classification).toBe("LH");
    expect(classified[3].classification).toBe("LL");
  });
});

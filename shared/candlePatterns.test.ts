import { describe, it, expect } from "vitest";
import { Candle } from "./indicators";
import {
  detectDoji, detectSpinningTop, detectHammer, detectShootingStar,
  detectEngulfing, detectDarkCloudCover, detectPiercingLine, detectHarami,
  detectTweezers, detectMorningStar, detectEveningStar,
  detectThreeWhiteSoldiers, detectThreeBlackCrows, scanCandlePatterns,
} from "./candlePatterns";

function c(o: number, h: number, l: number, cl: number): Candle {
  return { time: 0, open: o, high: h, low: l, close: cl };
}

describe("candlePatterns", () => {
  it("detects doji", () => {
    const candles = [c(100, 105, 95, 100.1)];
    const v = detectDoji(candles);
    expect(v).not.toBeNull();
    expect(v!.name).toBe("Doji");
    expect(v!.direction).toBe("neutral");
  });

  it("rejects non-doji", () => {
    const candles = [c(100, 105, 95, 108)];
    expect(detectDoji(candles)).toBeNull();
  });

  it("detects spinning top", () => {
    const candles = [c(100, 105, 95, 100.5)];
    const v = detectSpinningTop(candles);
    expect(v).not.toBeNull();
    expect(v!.name).toBe("Spinning top");
  });

  it("detects hammer in downtrend", () => {
    const down = Array.from({ length: 5 }, (_, i) => c(110 - i * 2, 112 - i * 2, 107 - i * 2, 108 - i * 2));
    down.push(c(98, 102, 90, 101)); // hammer: long lower wick
    const v = detectHammer(down);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
    expect(v!.name).toBe("Hammer");
  });

  it("detects hanging man in uptrend", () => {
    const up = Array.from({ length: 5 }, (_, i) => c(100 + i * 2, 103 + i * 2, 98 + i * 2, 102 + i * 2));
    up.push(c(110, 114, 100, 113)); // hanging man: long lower wick
    const v = detectHammer(up);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
    expect(v!.name).toBe("Hanging man");
  });

  it("detects shooting star in uptrend", () => {
    // Build a clear uptrend (5 candles with rising closes)
    const up: Candle[] = [
      c(100, 103, 99, 102),
      c(102, 105, 101, 104),
      c(104, 107, 103, 106),
      c(106, 109, 105, 108),
      c(108, 111, 107, 110),
    ];
    // Shooting star: open above close, long upper wick, body at bottom, no lower wick
    up.push(c(113, 125, 112.5, 112.5));
    const v = detectShootingStar(up);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
    expect(v!.name).toBe("Shooting star");
  });

  it("detects bullish engulfing", () => {
    const candles = [c(100, 102, 98, 99), c(97, 103, 96, 102)];
    const v = detectEngulfing(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
    expect(v!.name).toBe("Bullish engulfing");
  });

  it("detects bearish engulfing", () => {
    const candles = [c(100, 102, 98, 101), c(102, 103, 97, 98)];
    const v = detectEngulfing(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
  });

  it("detects dark cloud cover", () => {
    const candles = [c(100, 105, 99, 104), c(106, 107, 100, 101)];
    const v = detectDarkCloudCover(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
  });

  it("detects piercing line", () => {
    const candles = [c(100, 101, 95, 96), c(94, 101, 93, 100)];
    const v = detectPiercingLine(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
  });

  it("detects bullish harami", () => {
    const candles = [c(100, 106, 99, 96), c(98, 99, 97, 98.5)];
    const v = detectHarami(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
  });

  it("detects bearish harami", () => {
    const candles = [c(96, 100, 95, 100), c(98, 98.5, 96.5, 97)];
    const v = detectHarami(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
  });

  it("detects tweezer top", () => {
    const candles = [c(100, 105, 99, 104), c(103, 105, 100, 101)];
    const v = detectTweezers(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
    expect(v!.name).toBe("Tweezer top");
  });

  it("detects tweezer bottom", () => {
    const candles = [c(100, 101, 95, 96), c(97, 101, 95, 100)];
    const v = detectTweezers(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
    expect(v!.name).toBe("Tweezer bottom");
  });

  it("detects morning star", () => {
    const candles = [c(100, 102, 97, 97.5), c(98, 99, 97, 98.5), c(98, 103, 97, 102)];
    const v = detectMorningStar(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
    expect(v!.name).toBe("Morning star");
  });

  it("detects evening star", () => {
    const candles = [c(97, 102, 96, 101.5), c(100, 101, 99, 100.5), c(100, 102, 97, 98)];
    const v = detectEveningStar(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
    expect(v!.name).toBe("Evening star");
  });

  it("detects three white soldiers", () => {
    const candles = [c(100, 103.5, 99, 103), c(103, 106.5, 102, 106), c(106, 109.5, 105, 109)];
    const v = detectThreeWhiteSoldiers(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("up");
  });

  it("detects three black crows", () => {
    const candles = [c(100, 101, 96.5, 97), c(98, 99, 95.5, 96), c(97, 98, 94.5, 95)];
    const v = detectThreeBlackCrows(candles);
    expect(v).not.toBeNull();
    expect(v!.direction).toBe("down");
  });

  it("scanCandlePatterns returns all detected patterns", () => {
    const candles = [c(100, 105, 95, 100.1)]; // doji
    const results = scanCandlePatterns(candles);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.name === "Doji")).toBe(true);
  });
});

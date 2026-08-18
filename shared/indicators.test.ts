import { describe, it, expect } from "vitest";
import {
  buildCandles,
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  medianTickGapSec,
  scoreConfluence,
} from "./indicators";

describe("indicators", () => {
  it("aggregates ticks into fixed-timeframe candles", () => {
    const ticks = Array.from({ length: 10 }, (_, i) => ({ price: 100 + i, epoch: 1_600_000_000 + i * 10 }));
    const candles = buildCandles(ticks, 30);
    expect(candles.length).toBeGreaterThan(1);
    expect(candles[0].open).toBe(100);
    expect(candles[candles.length - 1].close).toBe(109);
  });

  it("sma produces values only after the window fills", () => {
    const v = [1, 2, 3, 4, 5];
    const out = sma(v, 3);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it("rsi returns 100 on a strictly rising series", () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)).toBe(100);
  });

  it("macd agrees with the trend direction", () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const m = macd(rising);
    expect(m.macd).toBeGreaterThan(0);
  });

  it("bollinger returns bands with a sane width", () => {
    const v = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const b = bollinger(v, 20);
    expect(b.upper).toBeGreaterThan(b.middle!);
    expect(b.middle).toBeGreaterThan(b.lower!);
  });

  it("median tick gap works", () => {
    const ticks = Array.from({ length: 10 }, (_, i) => ({ price: 1, epoch: i * 2 }));
    expect(medianTickGapSec(ticks)).toBe(2);
  });

  it("full up-agreement yields an up confluence above 60", () => {
    const res = scoreConfluence(true, 70, 1, [1, 2, 3, 4]);
    expect(res.direction).toBe("up");
    expect(res.score).toBeGreaterThanOrEqual(60);
  });

  it("full agreement maps votes to the interpreted score (3/3 agree → 78, not a probability)", () => {
    // All four voting indicators agree up: EMA, RSI, MACD, 3-candle momentum.
    const res = scoreConfluence(true, 70, 1, [1, 2, 3, 4]);
    expect(res.votes).toEqual({ up: 4, down: 0, total: 4, agreement: 1 });
    expect(res.score).toBe(78);
    // The score is ONLY the agreement-weighted read: 50 + round(1.0 * 28).
    expect(res.score).toBe(50 + Math.round(res.votes.agreement * 28));
  });

  it("mixed votes lower the agreement and thus the score", () => {
    // Three up (EMA, MACD, 3-candle momentum) vs one down (RSI):
    // agreement |3-1|/4 = 0.5 → 50 + round(0.5*28) = 64.
    const res = scoreConfluence(true, 30, 1, [1, 2, 3, 4]);
    expect(res.votes).toEqual({ up: 3, down: 1, total: 4, agreement: 0.5 });
    expect(res.score).toBe(50 + Math.round(res.votes.agreement * 28));
  });

  it("full down-agreement yields a down confluence", () => {
    const res = scoreConfluence(false, 30, -1, [4, 3, 2, 1]);
    expect(res.direction).toBe("down");
    expect(res.score).toBeGreaterThanOrEqual(60);
  });

  it("null indicators do not fabricate agreement", () => {
    const res = scoreConfluence(null, null, null, []);
    expect(res.score).toBeLessThanOrEqual(50);
  });
});
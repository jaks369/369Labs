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

  it("full agreement maps votes to the interpreted score (4/4 agree → 78, not a probability)", () => {
    // All four voting indicators agree up: EMA, RSI, MACD, 3-candle momentum.
    const res = scoreConfluence(true, 70, 1, [1, 2, 3, 4]);
    expect(res.votes).toEqual({ up: 4, down: 0, total: 4, agreement: 1 });
    expect(res.score).toBe(78);
    // The score is ONLY the agreement-weighted read: 50 + round(1.0 * 28).
    expect(res.score).toBe(50 + Math.round(res.votes.agreement * 28));
  });

  it("mixed votes lower the agreement and thus the score", () => {
    // Three up (EMA, MACD, 3-candle momentum) vs one down (RSI):
    // agreement max(3,1)/4 = 0.75 → 50 + round(0.75*28) = 71. The score traces
    // to the displayed "3/4 indicators agree" fraction, not |up-down|.
    const res = scoreConfluence(true, 30, 1, [1, 2, 3, 4]);
    expect(res.votes).toEqual({ up: 3, down: 1, total: 4, agreement: 0.75 });
    expect(res.score).toBe(71);
    expect(res.score).toBe(50 + Math.round(res.votes.agreement * 28));
  });

  it("a mid-range RSI counts as a no-agreement vote in the denominator", () => {
    // EMA up, RSI 50 (neutral — votes for no side but still counts a computable
    // read), MACD up, flat 3-candle momentum (also neutral): 2 of 4 computable
    // reads agree → 0.5 → 64. Previously neutral RSI/momentum vanished from the
    // total and this read behaved like a saturating 2/2 → 78.
    const res = scoreConfluence(true, 50, 1, [1, 1, 1, 1]);
    expect(res.votes).toEqual({ up: 2, down: 0, total: 4, agreement: 0.5 });
    expect(res.score).toBe(64);
  });

  it("a neutral RSI dilutes a 3-of-4 read below the 78 cap", () => {
    // EMA up, RSI 50 (neutral), MACD up, momentum up: 3 of 4 computable agree
    // → 0.75 → 71. The same market under the old scoring read as 2/2 → 78.
    const res = scoreConfluence(true, 50, 1, [1, 2, 3, 4]);
    expect(res.votes).toEqual({ up: 3, down: 0, total: 4, agreement: 0.75 });
    expect(res.score).toBe(71);
  });

  it("thin 1-of-4 agreement cannot saturate at the cap", () => {
    // Only EMA is non-null and agrees up; RSI/MACD/momentum read is missing or
    // neutral — 1 of 1 computable... no: RSI/MACD are missing but momentum is
    // flat-neutral. EMA up + momentum flat → votes {up:1, down:0, total:2}.
    const res = scoreConfluence(true, null, null, [3, 3, 3, 3]);
    expect(res.votes).toEqual({ up: 1, down: 0, total: 2, agreement: 0.5 });
    expect(res.score).toBe(64);
    expect(res.score).toBeLessThan(78);
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
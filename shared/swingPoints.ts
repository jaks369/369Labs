/**
 * Swing high/low detection — the shared primitive for market structure, divergence,
 * chart patterns, and SMC zone detection.
 *
 * A candle is a swing high if its high is the local maximum within a configurable
 * lookback window on both sides (a "fractal"). Swing low is the mirror.
 *
 * Two tiers:
 *   - internal (short lookback, default 3): minor pullbacks, fast-moving
 *   - external (long lookback, default 15): major structure, trend-defining
 *
 * Before detection, closes are EMA-smoothed (default period 5) to filter out
 * tick noise — skipping this is the #1 cause of noisy, untrustworthy swing
 * detection on 1s-cadence symbols.
 */

import { Candle, ema } from "./indicators";

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export interface SwingOptions {
  /** Lookback candles on each side for internal swings (default 3). */
  internalLookback?: number;
  /** Lookback candles on each side for external swings (default 15). */
  externalLookback?: number;
  /** EMA smoothing period applied to closes before detection (default 5, 0 = no smoothing). */
  smoothPeriod?: number;
}

/**
 * Detect swing highs and lows on a candle series.
 * Returns two arrays: internal (fast) and external (slow) swings.
 */
export function detectSwings(
  candles: Candle[],
  opts: SwingOptions = {},
): { internal: SwingPoint[]; external: SwingPoint[] } {
  const intLb = opts.internalLookback ?? 3;
  const extLb = opts.externalLookback ?? 15;
  const smooth = opts.smoothPeriod ?? 5;

  // Build smoothed high/low series for swing detection
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  let smoothedHighs = highs;
  let smoothedLows = lows;
  if (smooth > 0 && closes.length > smooth) {
    const emaValues = ema(closes, smooth);
    // Shift highs/lows relative to EMA to preserve swing geometry
    const lastValid = Math.min(smooth, closes.length - 1);
    const offset = closes[lastValid] - emaValues[lastValid];
    smoothedHighs = highs.map((h) => h - offset);
    smoothedLows = lows.map((l) => l - offset);
  }

  const minLen = (lb: number) => lb * 2 + 1;
  const internal = smoothedHighs.length >= minLen(intLb)
    ? findSwings(smoothedHighs, smoothedLows, intLb)
    : [];
  const external = smoothedHighs.length >= minLen(extLb)
    ? findSwings(smoothedHighs, smoothedLows, extLb)
    : [];

  return { internal, external };
}

/**
 * Core swing detection: for each position, check if it's the local extreme
 * within `lookback` candles on each side.
 */
function findSwings(highs: number[], lows: number[], lookback: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const len = highs.length;

  for (let i = lookback; i < len - lookback; i++) {
    // Swing high: high[i] is the max in [i-lookback, i+lookback]
    let isSwingHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) { isSwingHigh = false; break; }
    }
    if (isSwingHigh) {
      swings.push({ index: i, price: highs[i], type: "high" });
    }

    // Swing low: low[i] is the min in [i-lookback, i+lookback]
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (lows[j] <= lows[i]) { isSwingLow = false; break; }
    }
    if (isSwingLow) {
      swings.push({ index: i, price: lows[i], type: "low" });
    }
  }

  // Sort by index for chronological order
  swings.sort((a, b) => a.index - b.index);
  return swings;
}

/**
 * Classify each swing relative to the prior swing of the same type.
 * Returns swings with an added `classification`: "HH", "HL", "LH", "LL".
 */
export interface ClassifiedSwing extends SwingPoint {
  classification: "HH" | "HL" | "LH" | "LL" | "first";
}

export function classifySwings(swings: SwingPoint[]): ClassifiedSwing[] {
  const result: ClassifiedSwing[] = [];
  let lastHigh: { price: number; index: number } | null = null;
  let lastLow: { price: number; index: number } | null = null;

  for (const s of swings) {
    if (s.type === "high") {
      const classification = lastHigh === null ? "first" : s.price > lastHigh.price ? "HH" : "LH";
      result.push({ ...s, classification });
      lastHigh = { price: s.price, index: s.index };
    } else {
      const classification = lastLow === null ? "first" : s.price > lastLow.price ? "HL" : "LL";
      result.push({ ...s, classification });
      lastLow = { price: s.price, index: s.index };
    }
  }

  return result;
}

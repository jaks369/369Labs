/**
 * Price-oscillator divergence detection.
 *
 * Detects regular and hidden divergence between price and an oscillator (RSI, MACD).
 *
 * Regular bullish:  price LL + oscillator HL → bullish reversal
 * Regular bearish:  price HH + oscillator LH → bearish reversal
 * Hidden bullish:   price HL + oscillator LL → bullish continuation
 * Hidden bearish:   price LH + oscillator HH → bearish continuation
 *
 * Depends on shared/swingPoints.ts for swing detection and shared/indicators.ts for RSI/MACD.
 */

import { Candle, rsiSeries, ema } from "./indicators";
import { detectSwings, SwingPoint } from "./swingPoints";

export type DivergenceType = "regular_bullish" | "regular_bearish" | "hidden_bullish" | "hidden_bearish";

export interface Divergence {
  type: DivergenceType;
  /** The two swing points on price that form the divergence. */
  priceSwings: [SwingPoint, SwingPoint];
  /** Corresponding oscillator values at those swing indices. */
  oscillatorValues: [number, number];
  /** Signal direction: "bullish" or "bearish". */
  direction: "bullish" | "bearish";
  /** Strength 0-1 based on how pronounced the divergence is. */
  strength: number;
  /** Human-readable reason. */
  reason: string;
}

export interface DivergenceOptions {
  /** RSI period (default 14). */
  rsiPeriod?: number;
  /** MACD fast/slow/signal (default 12/26/9). */
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  /** Swing detection lookback for internal swings (default 3). */
  swingLookback?: number;
}

/**
 * Detect divergences between price and RSI/MACD oscillators.
 * Returns all found divergences, most recent first.
 */
export function detectDivergences(
  candles: Candle[],
  opts: DivergenceOptions = {},
): Divergence[] {
  const rsiPeriod = opts.rsiPeriod ?? 14;
  const macdFast = opts.macdFast ?? 12;
  const macdSlow = opts.macdSlow ?? 26;
  const macdSignal = opts.macdSignal ?? 9;
  const swingLb = opts.swingLookback ?? 3;

  if (candles.length < Math.max(rsiPeriod + 1, macdSlow + macdSignal, swingLb * 2 + 1)) {
    return [];
  }

  // Compute oscillators
  const closes = candles.map((c) => c.close);
  const rsiValues = rsiSeries(closes, rsiPeriod);

  // Compute MACD histogram as a time series (macd() only returns last value)
  const fastEma = ema(closes, macdFast);
  const slowEma = ema(closes, macdSlow);
  const macdLine: number[] = closes.map((_, i) =>
    fastEma[i] !== undefined && slowEma[i] !== undefined && !Number.isNaN(fastEma[i]) && !Number.isNaN(slowEma[i])
      ? fastEma[i] - slowEma[i]
      : NaN,
  );
  const signalLine = ema(macdLine, macdSignal);
  const histogram: number[] = closes.map((_, i) =>
    !Number.isNaN(macdLine[i]) && !Number.isNaN(signalLine[i])
      ? macdLine[i] - signalLine[i]
      : NaN,
  );

  // Get swing points
  const { internal: swings } = detectSwings(candles, {
    internalLookback: swingLb,
    smoothPeriod: 0,
  });

  const divergences: Divergence[] = [];

  // Check consecutive swing lows for bullish divergence
  const swingLows = swings.filter((s) => s.type === "low");
  for (let i = 1; i < swingLows.length; i++) {
    const prev = swingLows[i - 1];
    const curr = swingLows[i];

    const priceChange = curr.price - prev.price;
    const prevRsi = rsiValues[prev.index];
    const currRsi = rsiValues[curr.index];
    const prevMacd = histogram[prev.index];
    const currMacd = histogram[curr.index];

    // RSI divergence
    if (isFinite(prevRsi) && isFinite(currRsi)) {
      const oscChange = currRsi - prevRsi;
      const div = classifyDivergence(priceChange, oscChange, prev, curr, prevRsi, currRsi, "RSI", "lows");
      if (div) divergences.push(div);
    }

    // MACD histogram divergence
    if (isFinite(prevMacd) && isFinite(currMacd)) {
      const oscChange = currMacd - prevMacd;
      const div = classifyDivergence(priceChange, oscChange, prev, curr, prevMacd, currMacd, "MACD", "lows");
      if (div) divergences.push(div);
    }
  }

  // Check consecutive swing highs for bearish divergence
  const swingHighs = swings.filter((s) => s.type === "high");
  for (let i = 1; i < swingHighs.length; i++) {
    const prev = swingHighs[i - 1];
    const curr = swingHighs[i];

    const priceChange = curr.price - prev.price;
    const prevRsi = rsiValues[prev.index];
    const currRsi = rsiValues[curr.index];
    const prevMacd = histogram[prev.index];
    const currMacd = histogram[curr.index];

    if (isFinite(prevRsi) && isFinite(currRsi)) {
      const oscChange = currRsi - prevRsi;
      const div = classifyDivergence(priceChange, oscChange, prev, curr, prevRsi, currRsi, "RSI", "highs");
      if (div) divergences.push(div);
    }

    if (isFinite(prevMacd) && isFinite(currMacd)) {
      const oscChange = currMacd - prevMacd;
      const div = classifyDivergence(priceChange, oscChange, prev, curr, prevMacd, currMacd, "MACD", "highs");
      if (div) divergences.push(div);
    }
  }

  // Sort by recency (most recent swing index first)
  divergences.sort((a, b) => b.priceSwings[1].index - a.priceSwings[1].index);

  return divergences;
}

function classifyDivergence(
  priceChange: number,
  oscChange: number,
  prevSwing: SwingPoint,
  currSwing: SwingPoint,
  prevOsc: number,
  currOsc: number,
  indicator: string,
  context: "lows" | "highs",
): Divergence | null {
  const eps = 1e-10;

  if (context === "lows") {
    // Checking swing lows: regular bullish (price LL, osc HL) or hidden bullish (price HL, osc LL)
    if (priceChange < -eps && oscChange > eps) {
      const strength = Math.min(1, Math.abs(oscChange) / (Math.abs(prevOsc) + eps));
      return {
        type: "regular_bullish",
        priceSwings: [prevSwing, currSwing],
        oscillatorValues: [prevOsc, currOsc],
        direction: "bullish",
        strength,
        reason: `Regular bullish divergence: price made lower low (${prevSwing.price.toFixed(2)} → ${currSwing.price.toFixed(2)}) but ${indicator} made higher low (${prevOsc.toFixed(1)} → ${currOsc.toFixed(1)})`,
      };
    }
    if (priceChange > eps && oscChange < -eps) {
      const strength = Math.min(1, Math.abs(oscChange) / (Math.abs(prevOsc) + eps));
      return {
        type: "hidden_bullish",
        priceSwings: [prevSwing, currSwing],
        oscillatorValues: [prevOsc, currOsc],
        direction: "bullish",
        strength: strength * 0.8,
        reason: `Hidden bullish divergence: price made higher low (${prevSwing.price.toFixed(2)} → ${currSwing.price.toFixed(2)}) but ${indicator} made lower low (${prevOsc.toFixed(1)} → ${currOsc.toFixed(1)})`,
      };
    }
  } else {
    // Checking swing highs: regular bearish (price HH, osc LH) or hidden bearish (price LH, osc HH)
    if (priceChange > eps && oscChange < -eps) {
      const strength = Math.min(1, Math.abs(oscChange) / (Math.abs(prevOsc) + eps));
      return {
        type: "regular_bearish",
        priceSwings: [prevSwing, currSwing],
        oscillatorValues: [prevOsc, currOsc],
        direction: "bearish",
        strength,
        reason: `Regular bearish divergence: price made higher high (${prevSwing.price.toFixed(2)} → ${currSwing.price.toFixed(2)}) but ${indicator} made lower high (${prevOsc.toFixed(1)} → ${currOsc.toFixed(1)})`,
      };
    }
    if (priceChange < -eps && oscChange > eps) {
      const strength = Math.min(1, Math.abs(oscChange) / (Math.abs(prevOsc) + eps));
      return {
        type: "hidden_bearish",
        priceSwings: [prevSwing, currSwing],
        oscillatorValues: [prevOsc, currOsc],
        direction: "bearish",
        strength: strength * 0.8,
        reason: `Hidden bearish divergence: price made lower high (${prevSwing.price.toFixed(2)} → ${currSwing.price.toFixed(2)}) but ${indicator} made higher high (${prevOsc.toFixed(1)} → ${currOsc.toFixed(1)})`,
      };
    }
  }

  return null;
}

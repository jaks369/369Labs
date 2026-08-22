/**
 * Chart pattern detection: Head & Shoulders, Double Top/Bottom, Triangles.
 *
 * Depends on shared/swingPoints.ts for swing detection.
 */

import { Candle } from "./indicators";
import { detectSwings, ClassifiedSwing, classifySwings, SwingOptions } from "./swingPoints";

export type PatternType = "head_and_shoulders" | "inverse_head_and_shoulders" | "double_top" | "double_bottom" | "ascending_triangle" | "descending_triangle" | "symmetrical_triangle";

export interface ChartPattern {
  type: PatternType;
  direction: "bullish" | "bearish";
  /** Swing points forming the pattern. */
  swings: ClassifiedSwing[];
  /** Key price levels: neckline for H&S, support/resistance for others. */
  levels: { name: string; price: number }[];
  /** Confidence 0-1. */
  confidence: number;
  reason: string;
}

export interface ChartPatternOptions extends SwingOptions {
  /** Tolerance for "equal" price levels as % of price (default 0.5%). */
  tolerancePct?: number;
}

/**
 * Detect chart patterns on a candle series.
 * Returns all detected patterns, most recent first.
 */
export function detectChartPatterns(candles: Candle[], opts: ChartPatternOptions = {}): ChartPattern[] {
  const tolerance = (opts.tolerancePct ?? 0.5) / 100;
  const { internal } = detectSwings(candles, opts);
  const classified = classifySwings(internal);
  const patterns: ChartPattern[] = [];

  patterns.push(...findHeadAndShoulders(classified, tolerance));
  patterns.push(...findDoubleTops(classified, tolerance));
  patterns.push(...findDoubleBottoms(classified, tolerance));
  patterns.push(...findTriangles(classified, candles, tolerance));

  patterns.sort((a, b) => {
    const aIdx = a.swings[a.swings.length - 1].index;
    const bIdx = b.swings[b.swings.length - 1].index;
    return bIdx - aIdx;
  });

  return patterns;
}

/**
 * Head & Shoulders: three peaks where middle is highest (head),
 * left and right shoulders are roughly equal.
 * Neckline connects the two troughs between shoulders.
 */
function findHeadAndShoulders(swings: ClassifiedSwing[], tolerance: number): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  for (let i = 0; i + 2 < highs.length; i++) {
    const left = highs[i];
    const head = highs[i + 1];
    const right = highs[i + 2];

    // Head must be highest
    if (head.price <= left.price || head.price <= right.price) continue;

    // Shoulders should be roughly equal
    const avgShoulder = (left.price + right.price) / 2;
    if (Math.abs(left.price - right.price) / avgShoulder > tolerance) continue;

    // Find neckline: trough between left-head and head-right
    const necklineLows = lows.filter(
      (l) => l.index > left.index && l.index < right.index,
    );
    if (necklineLows.length < 1) continue;

    const neckline = necklineLows.reduce((min, l) => (l.price < min.price ? l : min), necklineLows[0]);

    const confidence = Math.min(1, 0.5 + (head.price - avgShoulder) / (avgShoulder * 0.05));
    patterns.push({
      type: "head_and_shoulders",
      direction: "bearish",
      swings: [left, head, right],
      levels: [
        { name: "neckline", price: neckline.price },
        { name: "head", price: head.price },
      ],
      confidence,
      reason: `Head & Shoulders: head at ${head.price.toFixed(2)}, shoulders ~${avgShoulder.toFixed(2)}, neckline ${neckline.price.toFixed(2)}`,
    });
  }

  return patterns;
}

/**
 * Inverse Head & Shoulders: three troughs where middle is lowest,
 * left and right troughs roughly equal.
 */
function findInverseHeadAndShoulders(swings: ClassifiedSwing[], tolerance: number): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const lows = swings.filter((s) => s.type === "low");
  const highs = swings.filter((s) => s.type === "high");

  for (let i = 0; i + 2 < lows.length; i++) {
    const left = lows[i];
    const head = lows[i + 1];
    const right = lows[i + 2];

    if (head.price >= left.price || head.price >= right.price) continue;

    const avgShoulder = (left.price + right.price) / 2;
    if (Math.abs(left.price - right.price) / avgShoulder > tolerance) continue;

    const necklineHighs = highs.filter(
      (h) => h.index > left.index && h.index < right.index,
    );
    if (necklineHighs.length < 1) continue;

    const neckline = necklineHighs.reduce((max, h) => (h.price > max.price ? h : max), necklineHighs[0]);

    const confidence = Math.min(1, 0.5 + (avgShoulder - head.price) / (avgShoulder * 0.05));
    patterns.push({
      type: "inverse_head_and_shoulders",
      direction: "bullish",
      swings: [left, head, right],
      levels: [
        { name: "neckline", price: neckline.price },
        { name: "head", price: head.price },
      ],
      confidence,
      reason: `Inverse H&S: head at ${head.price.toFixed(2)}, shoulders ~${avgShoulder.toFixed(2)}, neckline ${neckline.price.toFixed(2)}`,
    });
  }

  return patterns;
}

/**
 * Double Top: two peaks at roughly the same level.
 */
function findDoubleTops(swings: ClassifiedSwing[], tolerance: number): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  for (let i = 0; i + 1 < highs.length; i++) {
    const first = highs[i];
    const second = highs[i + 1];

    const avg = (first.price + second.price) / 2;
    if (Math.abs(first.price - second.price) / avg > tolerance) continue;

    // Find support between the two peaks
    const supportLows = lows.filter(
      (l) => l.index > first.index && l.index < second.index,
    );
    if (supportLows.length < 1) continue;

    const support = supportLows.reduce((min, l) => (l.price < min.price ? l : min), supportLows[0]);

    const confidence = 0.6 + (1 - Math.abs(first.price - second.price) / avg) * 0.4;
    patterns.push({
      type: "double_top",
      direction: "bearish",
      swings: [first, second],
      levels: [
        { name: "resistance", price: avg },
        { name: "support", price: support.price },
      ],
      confidence,
      reason: `Double top at ~${avg.toFixed(2)}, support ${support.price.toFixed(2)}`,
    });
  }

  return patterns;
}

/**
 * Double Bottom: two troughs at roughly the same level.
 */
function findDoubleBottoms(swings: ClassifiedSwing[], tolerance: number): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const lows = swings.filter((s) => s.type === "low");
  const highs = swings.filter((s) => s.type === "high");

  for (let i = 0; i + 1 < lows.length; i++) {
    const first = lows[i];
    const second = lows[i + 1];

    const avg = (first.price + second.price) / 2;
    if (Math.abs(first.price - second.price) / avg > tolerance) continue;

    const resistanceHighs = highs.filter(
      (h) => h.index > first.index && h.index < second.index,
    );
    if (resistanceHighs.length < 1) continue;

    const resistance = resistanceHighs.reduce((max, h) => (h.price > max.price ? h : max), resistanceHighs[0]);

    const confidence = 0.6 + (1 - Math.abs(first.price - second.price) / avg) * 0.4;
    patterns.push({
      type: "double_bottom",
      direction: "bullish",
      swings: [first, second],
      levels: [
        { name: "support", price: avg },
        { name: "resistance", price: resistance.price },
      ],
      confidence,
      reason: `Double bottom at ~${avg.toFixed(2)}, resistance ${resistance.price.toFixed(2)}`,
    });
  }

  return patterns;
}

/**
 * Triangles: converging trendlines.
 * Ascending: flat resistance + rising support (bullish).
 * Descending: flat support + falling resistance (bearish).
 * Symmetrical: converging both (direction unclear).
 */
function findTriangles(
  swings: ClassifiedSwing[],
  candles: Candle[],
  tolerance: number,
): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  // Need at least 2 highs and 2 lows for trendline fitting
  if (highs.length < 2 || lows.length < 2) return patterns;

  // Check last 4+ swings for converging lines
  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);

  if (recentHighs.length < 2 || recentLows.length < 2) return patterns;

  // Fit trendlines through highs and lows
  const highSlope = slope(recentHighs.map((h) => ({ x: h.index, y: h.price })));
  const lowSlope = slope(recentLows.map((l) => ({ x: l.index, y: l.price })));

  const avgPrice = (recentHighs[0].price + recentLows[0].price) / 2;
  const slopeThreshold = avgPrice * 0.001; // minimum slope to be considered flat

  const highFlat = Math.abs(highSlope) < slopeThreshold;
  const lowFlat = Math.abs(lowSlope) < slopeThreshold;

  if (highFlat && lowFlat) {
    // Parallel lines — not a triangle
    return patterns;
  }

  if (highFlat && lowSlope > slopeThreshold) {
    // Flat resistance + rising support → ascending triangle (bullish)
    const resistance = recentHighs[recentHighs.length - 1].price;
    const support = recentLows[recentLows.length - 1].price;
    patterns.push({
      type: "ascending_triangle",
      direction: "bullish",
      swings: [...recentHighs, ...recentLows],
      levels: [
        { name: "resistance", price: resistance },
        { name: "support", price: support },
      ],
      confidence: 0.65,
      reason: `Ascending triangle: resistance ${resistance.toFixed(2)}, rising support from ${support.toFixed(2)}`,
    });
  } else if (lowFlat && highSlope < -slopeThreshold) {
    // Flat support + falling resistance → descending triangle (bearish)
    const support = recentLows[recentLows.length - 1].price;
    const resistance = recentHighs[recentHighs.length - 1].price;
    patterns.push({
      type: "descending_triangle",
      direction: "bearish",
      swings: [...recentHighs, ...recentLows],
      levels: [
        { name: "support", price: support },
        { name: "resistance", price: resistance },
      ],
      confidence: 0.65,
      reason: `Descending triangle: support ${support.toFixed(2)}, falling resistance from ${resistance.toFixed(2)}`,
    });
  } else if (highSlope < -slopeThreshold && lowSlope > slopeThreshold) {
    // Both converging → symmetrical triangle
    const resistance = recentHighs[recentHighs.length - 1].price;
    const support = recentLows[recentLows.length - 1].price;
    patterns.push({
      type: "symmetrical_triangle",
      direction: "bullish", // bias toward prior trend direction
      swings: [...recentHighs, ...recentLows],
      levels: [
        { name: "resistance", price: resistance },
        { name: "support", price: support },
      ],
      confidence: 0.5,
      reason: `Symmetrical triangle: converging between ${support.toFixed(2)} and ${resistance.toFixed(2)}`,
    });
  }

  return patterns;
}

/**
 * Simple linear regression slope through points.
 */
function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

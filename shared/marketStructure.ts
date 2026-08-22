/**
 * Market structure labelling: HH/HL/LH/LL sequences, break of structure (BOS),
 * and change of character (CHoCH).
 *
 * Depends on shared/swingPoints.ts for swing detection and classification.
 */

import { Candle } from "./indicators";
import { detectSwings, classifySwings, ClassifiedSwing, SwingOptions } from "./swingPoints";

export type Bias = "bullish" | "bearish" | "neutral";

export interface StructurePoint {
  swing: ClassifiedSwing;
  event?: "BOS" | "CHoCH";
  bias: Bias;
}

export interface StructureResult {
  points: StructurePoint[];
  currentBias: Bias;
  lastBreak?: { event: "BOS" | "CHoCH"; index: number; price: number; bias: Bias };
}

/**
 * Label market structure on a candle series.
 *
 * The classified swings (HH/HL = bullish, LH/LL = bearish) are walked
 * in order. A sequence of HH+HL establishes bullish bias; LH+LL establishes
 * bearish bias. Breaking that sequence generates BOS (continuation) or CHoCH (reversal).
 *
 * BOS = same-direction break (e.g., already bullish, another HH)
 * CHoCH = opposite-direction break (e.g., was bearish, now HH)
 */
export function labelStructure(
  candles: Candle[],
  opts: SwingOptions = {},
): StructureResult {
  const { internal } = detectSwings(candles, opts);
  const classified = classifySwings(internal);

  if (classified.length < 2) {
    return {
      points: classified.map((s) => ({ swing: s, bias: "neutral" })),
      currentBias: "neutral",
    };
  }

  const points: StructurePoint[] = [];
  let currentBias: Bias = "neutral";
  let lastBreak: StructureResult["lastBreak"];
  // Track the most recent swing of each type
  let prevHigh: ClassifiedSwing | null = null;
  let prevLow: ClassifiedSwing | null = null;
  // Track consecutive classification counts for establishing direction
  let bullCount = 0;
  let bearCount = 0;

  for (const swing of classified) {
    let event: "BOS" | "CHoCH" | undefined;

    if (swing.type === "high") {
      if (prevHigh !== null) {
        if (swing.price > prevHigh.price) {
          // Higher high
          if (currentBias === "bearish") {
            event = "CHoCH";
            currentBias = "bullish";
            bullCount = 1;
          } else {
            event = "BOS";
            if (currentBias === "neutral") currentBias = "bullish";
            bullCount++;
          }
        } else {
          // Lower high
          if (currentBias === "bullish") {
            event = "CHoCH";
            currentBias = "bearish";
            bearCount = 1;
          } else {
            event = "BOS";
            if (currentBias === "neutral") currentBias = "bearish";
            bearCount++;
          }
        }
      }
      prevHigh = swing;
    } else {
      // Low
      if (prevLow !== null) {
        if (swing.price > prevLow.price) {
          // Higher low
          if (currentBias === "bearish") {
            event = "CHoCH";
            currentBias = "bullish";
            bullCount = 1;
          } else {
            if (currentBias === "neutral") currentBias = "bullish";
            bullCount++;
          }
        } else {
          // Lower low
          if (currentBias === "bullish") {
            event = "CHoCH";
            currentBias = "bearish";
            bearCount = 1;
          } else {
            event = "BOS";
            if (currentBias === "neutral") currentBias = "bearish";
            bearCount++;
          }
        }
      }
      prevLow = swing;
    }

    if (event) {
      lastBreak = { event, index: swing.index, price: swing.price, bias: currentBias };
    }

    points.push({ swing, event, bias: currentBias });
  }

  return { points, currentBias, lastBreak };
}

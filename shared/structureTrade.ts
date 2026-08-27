/**
 * Structure-based trade construction.
 *
 * Turns detected SMC zones (FVG, order blocks, liquidity sweeps, equal levels)
 * and market structure (BOS/CHoCH, swing points) into actual trade parameters:
 * stop-loss, take-profit, and premium/discount zone filtering.
 *
 * Professional SMC methodology:
 * - Stop-loss goes BEYOND the invalidating structure, not a fixed pip distance
 * - Take-profit targets the next opposing liquidity pool
 * - Premium/discount filtering prevents "valid signal, terrible location" trades
 *
 * This module is pure (no DB / network). It takes candles and zones, returns
 * structured trade parameters.
 */

import { Candle } from "./indicators";
import { SmcZone, detectSmcZones } from "./smcZones";
import { labelStructure, StructureResult } from "./marketStructure";
import { detectSwings, SwingPoint } from "./swingPoints";

export interface StructureTradeParams {
  /** Structure-derived stop-loss price. Null if no valid structure to place against. */
  stopLoss: number | null;
  /** Structure-derived take-profit price. Null if no valid liquidity target found. */
  takeProfit: number | null;
  /** Whether price is in the correct premium/discount zone for this direction. */
  zoneFilter: { inZone: boolean; zone: "premium" | "discount" | "mid"; reason: string };
  /** Reasoning behind the SL/TP placement. */
  reasoning: string[];
  /** The specific zone used for stop-loss placement. */
  slSource: { type: string; range: [number, number]; reason: string } | null;
  /** The specific zone used for take-profit targeting. */
  tpSource: { type: string; range: [number, number]; reason: string } | null;
}

export interface StructureTradeOptions {
  /** Buffer beyond zone boundary for stop-loss (default: 0.1% of price). */
  slBufferPct?: number;
  /** Minimum reward-to-risk ratio for take-profit fallback (default: 2.0). */
  minRR?: number;
  /** Maximum distance for a valid TP target as multiple of SL distance (default: 5.0). */
  maxTPDistanceMultiple?: number;
  /** Whether to apply premium/discount zone filter (default: true). */
  applyZoneFilter?: boolean;
}

const DEFAULT_BUFFER_PCT = 0.001; // 0.1% of price
const DEFAULT_MIN_RR = 2.0;
const DEFAULT_MAX_TP_MULTIPLE = 5.0;

/**
 * Compute structure-based trade parameters from candles and direction.
 *
 * @param candles - recent candle series (enough for swing detection)
 * @param direction - "up" (long/bullish) or "down" (short/bearish)
 * @param entryPrice - the proposed entry price
 * @param opts - configuration options
 */
export function computeStructureTrade(
  candles: Candle[],
  direction: "up" | "down",
  entryPrice: number,
  opts: StructureTradeOptions = {},
): StructureTradeParams {
  const bufferPct = opts.slBufferPct ?? DEFAULT_BUFFER_PCT;
  const minRR = opts.minRR ?? DEFAULT_MIN_RR;
  const maxTPMultiple = opts.maxTPDistanceMultiple ?? DEFAULT_MAX_TP_MULTIPLE;
  const applyZoneFilter = opts.applyZoneFilter ?? true;

  const reasoning: string[] = [];
  const zones = detectSmcZones(candles);
  const structure = labelStructure(candles);
  const { internal: swings } = detectSwings(candles);

  // --- Stop-loss: place beyond the nearest invalidating structure ---
  const slResult = computeStopLoss(candles, direction, entryPrice, zones, swings, bufferPct, reasoning);

  // --- Take-profit: target opposing liquidity or fallback to R:R ---
  const tpResult = computeTakeProfit(direction, entryPrice, slResult.stopLoss, zones, swings, minRR, maxTPMultiple, reasoning);

  // --- Premium/discount zone filter ---
  const zoneFilter = applyZoneFilter
    ? computeZoneFilter(candles, direction, entryPrice, reasoning)
    : { inZone: true, zone: "mid" as const, reason: "Zone filter disabled" };

  return {
    stopLoss: slResult.stopLoss,
    takeProfit: tpResult.takeProfit,
    zoneFilter,
    reasoning,
    slSource: slResult.source,
    tpSource: tpResult.source,
  };
}

interface SlResult {
  stopLoss: number | null;
  source: { type: string; range: [number, number]; reason: string } | null;
}

/**
 * Compute stop-loss beyond the nearest invalidating structure.
 *
 * For a LONG: stop below the nearest bullish OB/FVG/sweep low.
 * For a SHORT: stop above the nearest bearish OB/FVG/sweep high.
 *
 * Only unfilled zones are considered (filled zones are already "used up").
 */
function computeStopLoss(
  candles: Candle[],
  direction: "up" | "down",
  entryPrice: number,
  zones: SmcZone[],
  swings: SwingPoint[],
  bufferPct: number,
  reasoning: string[],
): SlResult {
  const lastPrice = candles[candles.length - 1]?.close ?? entryPrice;
  const buffer = entryPrice * bufferPct;

  // Collect candidate zones for this direction
  // For LONG: bullish zones below entry provide support (stop goes below them)
  // For SHORT: bearish zones above entry provide resistance (stop goes above them)
  const relevantZones = zones.filter((z) => {
    if (z.filled) return false;
    if (direction === "up") {
      // Bullish zones below entry: OB, FVG, or sweep that acts as support
      return z.direction === "bullish" && z.range[1] < entryPrice;
    } else {
      // Bearish zones above entry: OB, FVG, or sweep that acts as resistance
      return z.direction === "bearish" && z.range[0] > entryPrice;
    }
  });

  // Sort by proximity to entry
  relevantZones.sort((a, b) => {
    if (direction === "up") {
      // Closest bullish zone below entry (highest range[1])
      return b.range[1] - a.range[1];
    } else {
      // Closest bearish zone above entry (lowest range[0])
      return a.range[0] - b.range[0];
    }
  });

  // Also consider swing points as structural levels
  const relevantSwings = swings.filter((s) => {
    if (direction === "up") {
      return s.type === "low" && s.price < entryPrice;
    } else {
      return s.type === "high" && s.price > entryPrice;
    }
  });
  relevantSwings.sort((a, b) => {
    if (direction === "up") {
      return b.price - a.price; // closest low below entry
    } else {
      return a.price - b.price; // closest high above entry
    }
  });

  // Find the nearest structural level (zone or swing)
  let slPrice: number | null = null;
  let source: SlResult["source"] = null;

  if (relevantZones.length > 0) {
    const nearest = relevantZones[0];
    if (direction === "up") {
      slPrice = nearest.range[0] - buffer; // below the zone's low
      source = { type: nearest.type, range: nearest.range, reason: nearest.reason };
      reasoning.push(`Stop below ${nearest.type}: ${nearest.range[0].toFixed(2)} - ${(buffer).toFixed(2)} buffer = ${slPrice.toFixed(2)}`);
    } else {
      slPrice = nearest.range[1] + buffer; // above the zone's high
      source = { type: nearest.type, range: nearest.range, reason: nearest.reason };
      reasoning.push(`Stop above ${nearest.type}: ${nearest.range[1].toFixed(2)} + ${(buffer).toFixed(2)} buffer = ${slPrice.toFixed(2)}`);
    }
  } else if (relevantSwings.length > 0) {
    const nearest = relevantSwings[0];
    if (direction === "up") {
      slPrice = nearest.price - buffer;
      source = { type: "swing_low", range: [nearest.price, nearest.price], reason: `Swing low at index ${nearest.index}` };
      reasoning.push(`Stop below swing low: ${nearest.price.toFixed(2)} - ${(buffer).toFixed(2)} buffer = ${slPrice.toFixed(2)}`);
    } else {
      slPrice = nearest.price + buffer;
      source = { type: "swing_high", range: [nearest.price, nearest.price], reason: `Swing high at index ${nearest.index}` };
      reasoning.push(`Stop above swing high: ${nearest.price.toFixed(2)} + ${(buffer).toFixed(2)} buffer = ${slPrice.toFixed(2)}`);
    }
  } else {
    // No structure found — use a tight percentage fallback
    const fallbackPct = 0.005; // 0.5% of price
    if (direction === "up") {
      slPrice = entryPrice * (1 - fallbackPct);
      reasoning.push(`No structure below entry — fallback stop at -${(fallbackPct * 100).toFixed(1)}%: ${slPrice.toFixed(2)}`);
    } else {
      slPrice = entryPrice * (1 + fallbackPct);
      reasoning.push(`No structure above entry — fallback stop at +${(fallbackPct * 100).toFixed(1)}%: ${slPrice.toFixed(2)}`);
    }
  }

  return { stopLoss: slPrice, source };
}

interface TpResult {
  takeProfit: number | null;
  source: { type: string; range: [number, number]; reason: string } | null;
}

/**
 * Compute take-profit targeting opposing liquidity.
 *
 * For a LONG: target the nearest bearish equal-highs or swing high (resistance = liquidity above).
 * For a SHORT: target the nearest bullish equal-lows or swing low (support = liquidity below).
 *
 * Fallback: minimum R:R ratio of the computed stop distance.
 */
function computeTakeProfit(
  direction: "up" | "down",
  entryPrice: number,
  stopLoss: number | null,
  zones: SmcZone[],
  swings: SwingPoint[],
  minRR: number,
  maxTPMultiple: number,
  reasoning: string[],
): TpResult {
  if (stopLoss === null) {
    reasoning.push("No take-profit computed: stop-loss not available");
    return { takeProfit: null, source: null };
  }

  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance <= 0) {
    reasoning.push("No take-profit computed: zero stop distance");
    return { takeProfit: null, source: null };
  }

  // Collect liquidity targets: opposing direction zones
  // For LONG: bearish zones above entry are potential resistance / liquidity pools
  // For SHORT: bullish zones below entry are potential support / liquidity pools
  const liquidityTargets = zones.filter((z) => {
    if (z.filled) return false;
    if (direction === "up") {
      return z.direction === "bearish" && z.range[0] > entryPrice;
    } else {
      return z.direction === "bullish" && z.range[1] < entryPrice;
    }
  });

  // Also use swing points as targets
  const swingTargets = swings.filter((s) => {
    if (direction === "up") {
      return s.type === "high" && s.price > entryPrice;
    } else {
      return s.type === "low" && s.price < entryPrice;
    }
  });

  // Find nearest target within max TP distance
  const maxTPDistance = slDistance * maxTPMultiple;
  let bestTarget: { price: number; type: string; range: [number, number]; reason: string } | null = null;

  // Check zones first (more reliable — they represent institutional levels)
  for (const z of liquidityTargets) {
    const targetPrice = direction === "up" ? z.range[0] : z.range[1];
    const dist = Math.abs(targetPrice - entryPrice);
    if (dist <= maxTPDistance) {
      if (!bestTarget || dist < Math.abs(bestTarget.price - entryPrice)) {
        bestTarget = { price: targetPrice, type: z.type, range: z.range, reason: z.reason };
      }
    }
  }

  // If no zone target found, check swing points
  if (!bestTarget) {
    for (const s of swingTargets) {
      const dist = Math.abs(s.price - entryPrice);
      if (dist <= maxTPDistance) {
        const swingType = s.type === "high" ? "swing_high" : "swing_low";
        if (!bestTarget || dist < Math.abs(bestTarget.price - entryPrice)) {
          bestTarget = {
            price: s.price,
            type: swingType,
            range: [s.price, s.price],
            reason: `${swingType} at index ${s.index}`,
          };
        }
      }
    }
  }

  // Apply minimum R:R check
  if (bestTarget) {
    const tpDistance = Math.abs(bestTarget.price - entryPrice);
    const rr = tpDistance / slDistance;
    if (rr < minRR) {
      reasoning.push(`Target ${bestTarget.price.toFixed(2)} rejected: R:R ${rr.toFixed(1)} below minimum ${minRR}`);
      bestTarget = null;
    }
  }

  // Fallback: minimum R:R from stop distance
  if (!bestTarget) {
    const fallbackTP = direction === "up"
      ? entryPrice + slDistance * minRR
      : entryPrice - slDistance * minRR;
    reasoning.push(`No liquidity target within range — fallback TP at ${minRR}:1 R:R = ${fallbackTP.toFixed(2)}`);
    return {
      takeProfit: fallbackTP,
      source: { type: "rr_fallback", range: [fallbackTP, fallbackTP], reason: `${minRR}:1 R:R fallback` },
    };
  }

  reasoning.push(`Take-profit at ${bestTarget.type}: ${bestTarget.price.toFixed(2)} (R:R ${(Math.abs(bestTarget.price - entryPrice) / slDistance).toFixed(1)}:1)`);
  return {
    takeProfit: bestTarget.price,
    source: { type: bestTarget.type, range: bestTarget.range, reason: bestTarget.reason },
  };
}

/**
 * Premium/discount zone filter.
 *
 * Professional SMC: only take longs in the "discount" zone (lower half of the
 * dealing range), only take shorts in the "premium" zone (upper half).
 *
 * The dealing range is defined by the most recent external swing high and swing low.
 */
function computeZoneFilter(
  candles: Candle[],
  direction: "up" | "down",
  entryPrice: number,
  reasoning: string[],
): { inZone: boolean; zone: "premium" | "discount" | "mid"; reason: string } {
  if (candles.length < 30) {
    return { inZone: true, zone: "mid", reason: "Insufficient candles for zone filter" };
  }

  // Use external swings for the dealing range (major structure)
  const { external: swings } = detectSwings(candles, { externalLookback: 15 });

  if (swings.length < 2) {
    return { inZone: true, zone: "mid", reason: "Insufficient swings for zone filter" };
  }

  // Get the most recent swing high and swing low
  const recentHighs = swings.filter((s) => s.type === "high").slice(-3);
  const recentLows = swings.filter((s) => s.type === "low").slice(-3);

  if (recentHighs.length === 0 || recentLows.length === 0) {
    return { inZone: true, zone: "mid", reason: "No swing highs and lows found" };
  }

  const rangeHigh = Math.max(...recentHighs.map((s) => s.price));
  const rangeLow = Math.min(...recentLows.map((s) => s.price));
  const midpoint = (rangeHigh + rangeLow) / 2;

  const inDiscount = entryPrice < midpoint;
  const inPremium = entryPrice > midpoint;

  let inZone: boolean;
  let zone: "premium" | "discount" | "mid";
  let reason: string;

  if (direction === "up") {
    // Longs should be in discount zone (below midpoint)
    inZone = inDiscount;
    zone = inDiscount ? "discount" : inPremium ? "premium" : "mid";
    if (inDiscount) {
      reason = `Long in discount zone: ${entryPrice.toFixed(2)} below midpoint ${midpoint.toFixed(2)} (range: ${rangeLow.toFixed(2)}-${rangeHigh.toFixed(2)})`;
    } else {
      reason = `Long rejected: ${entryPrice.toFixed(2)} above midpoint ${midpoint.toFixed(2)} — not in discount zone (range: ${rangeLow.toFixed(2)}-${rangeHigh.toFixed(2)})`;
    }
  } else {
    // Shorts should be in premium zone (above midpoint)
    inZone = inPremium;
    zone = inPremium ? "premium" : inDiscount ? "discount" : "mid";
    if (inPremium) {
      reason = `Short in premium zone: ${entryPrice.toFixed(2)} above midpoint ${midpoint.toFixed(2)} (range: ${rangeLow.toFixed(2)}-${rangeHigh.toFixed(2)})`;
    } else {
      reason = `Short rejected: ${entryPrice.toFixed(2)} below midpoint ${midpoint.toFixed(2)} — not in premium zone (range: ${rangeLow.toFixed(2)}-${rangeHigh.toFixed(2)})`;
    }
  }

  reasoning.push(reason);
  return { inZone, zone, reason };
}

/**
 * Check if a liquidity sweep is confirmed by a subsequent BOS.
 * This is the inducement-awareness filter: a shallow sweep without
 * confirming structure is likely an inducement trap, not a real entry.
 */
export function isSweepConfirmedByStructure(
  candles: Candle[],
  sweepIndex: number,
  sweepDirection: "bullish" | "bearish",
): { confirmed: boolean; reason: string } {
  // Check if there's a BOS in the sweep's direction after the sweep
  const afterSweep = candles.slice(sweepIndex);
  if (afterSweep.length < 5) {
    return { confirmed: false, reason: "Insufficient candles after sweep for confirmation" };
  }

  const structure = labelStructure(afterSweep);
  if (!structure.lastBreak) {
    return { confirmed: false, reason: "No structure break after sweep — likely inducement" };
  }

  const { event, bias } = structure.lastBreak;
  if (event !== "BOS") {
    return { confirmed: false, reason: `Structure break after sweep is CHoCH (reversal), not BOS (continuation)` };
  }

  const expectedBias = sweepDirection === "bullish" ? "bullish" : "bearish";
  if (bias !== expectedBias) {
    return { confirmed: false, reason: `BOS bias (${bias}) doesn't match sweep direction (${sweepDirection})` };
  }

  return { confirmed: true, reason: `Sweep confirmed by BOS in ${bias} direction` };
}

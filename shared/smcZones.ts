/**
 * Smart Money Concepts (SMC) zone detection.
 *
 * - Fair Value Gaps (FVG): 3-candle imbalance where price skips a level
 * - Order Blocks: last opposing candle before a strong impulse move
 * - Liquidity Sweeps: price spikes through a level then reverses
 * - Equal Highs/Lows: clustered swing points indicating resting liquidity
 *
 * Depends on shared/swingPoints.ts for swing detection and shared/indicators.ts for Candle.
 */

import { Candle } from "./indicators";
import { detectSwings, SwingPoint, SwingOptions } from "./swingPoints";

export type ZoneType = "fvg" | "order_block" | "liquidity_sweep" | "equal_levels";

export interface SmcZone {
  type: ZoneType;
  /** Direction the zone supports: bullish = buy zone, bearish = sell zone. */
  direction: "bullish" | "bearish";
  /** Price range of the zone [low, high]. */
  range: [number, number];
  /** Index of the candle that created the zone. */
  index: number;
  /** Whether the zone has been filled (price traded back through it). */
  filled: boolean;
  /** Human-readable description. */
  reason: string;
}

export interface SmcOptions extends SwingOptions {
  /** Maximum distance between equal levels as % of price (default 0.2%). */
  equalTolerancePct?: number;
  /** Minimum impulse move size in price units for order block detection (default 0). Auto-scaled if 0. */
  minImpulse?: number;
}

/**
 * Detect all SMC zones in a candle series.
 */
export function detectSmcZones(candles: Candle[], opts: SmcOptions = {}): SmcZone[] {
  const tolerance = (opts.equalTolerancePct ?? 0.2) / 100;
  const zones: SmcZone[] = [];

  zones.push(...findFairValueGaps(candles));
  zones.push(...findOrderBlocks(candles, opts.minImpulse ?? 0));
  zones.push(...findEqualLevels(candles, tolerance, opts));
  zones.push(...findLiquiditySweeps(candles, opts));

  return zones;
}

/**
 * Fair Value Gap: candle 1 high < candle 3 low (bullish) or
 * candle 1 low > candle 3 high (bearish).
 */
function findFairValueGaps(candles: Candle[]): SmcZone[] {
  const zones: SmcZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG: gap up — c1 high < c3 low
    if (c1.high < c3.low) {
      zones.push({
        type: "fvg",
        direction: "bullish",
        range: [c1.high, c3.low],
        index: i - 1,
        filled: isZoneFilled(candles, i, c1.high, c3.low),
        reason: `Bullish FVG: gap between ${c1.high.toFixed(2)} and ${c3.low.toFixed(2)}`,
      });
    }

    // Bearish FVG: gap down — c1 low > c3 high
    if (c1.low > c3.high) {
      zones.push({
        type: "fvg",
        direction: "bearish",
        range: [c3.high, c1.low],
        index: i - 1,
        filled: isZoneFilled(candles, i, c3.high, c1.low),
        reason: `Bearish FVG: gap between ${c3.high.toFixed(2)} and ${c1.low.toFixed(2)}`,
      });
    }
  }
  return zones;
}

/**
 * Order Block: last opposing candle before a strong impulse move.
 * Bullish OB = last bearish candle before a strong bullish move.
 * Bearish OB = last bullish candle before a strong bearish move.
 */
function findOrderBlocks(candles: Candle[], minImpulse: number): SmcZone[] {
  const zones: SmcZone[] = [];
  if (candles.length < 5) return zones;

  // Auto-scale minimum impulse: 0.3% of median price
  const closes = candles.map((c) => c.close);
  const median = closes.slice().sort((a, b) => a - b)[Math.floor(closes.length / 2)];
  const impulse = minImpulse > 0 ? minImpulse : median * 0.003;

  for (let i = 3; i < candles.length; i++) {
    const c0 = candles[i - 3]; // potential OB candle
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish OB: c0 is bearish (close < open), followed by strong bullish move
    const c0Bearish = c0.close < c0.open;
    const bullishMove = c3.close - c0.close;
    if (c0Bearish && bullishMove > impulse) {
      zones.push({
        type: "order_block",
        direction: "bullish",
        range: [Math.min(c0.open, c0.close), c0.high],
        index: i - 3,
        filled: isZoneFilled(candles, i + 1, Math.min(c0.open, c0.close), c0.high),
        reason: `Bullish order block at ${c0.low.toFixed(2)}-${c0.high.toFixed(2)} (impulse +${bullishMove.toFixed(2)})`,
      });
    }

    // Bearish OB: c0 is bullish (close > open), followed by strong bearish move
    const c0Bullish = c0.close > c0.open;
    const bearishMove = c0.close - c3.close;
    if (c0Bullish && bearishMove > impulse) {
      zones.push({
        type: "order_block",
        direction: "bearish",
        range: [c0.low, Math.max(c0.open, c0.close)],
        index: i - 3,
        filled: isZoneFilled(candles, i + 1, c0.low, Math.max(c0.open, c0.close)),
        reason: `Bearish order block at ${c0.low.toFixed(2)}-${c0.high.toFixed(2)} (impulse -${bearishMove.toFixed(2)})`,
      });
    }
  }

  return zones;
}

/**
 * Equal Highs/Lows: two swing points within tolerance % of each other.
 */
function findEqualLevels(
  candles: Candle[],
  tolerancePct: number,
  opts: SmcOptions,
): SmcZone[] {
  const { internal: swings } = detectSwings(candles, opts);
  const zones: SmcZone[] = [];

  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  // Check for equal highs
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const avg = (highs[i].price + highs[j].price) / 2;
      if (Math.abs(highs[i].price - highs[j].price) / avg <= tolerancePct) {
        zones.push({
          type: "equal_levels",
          direction: "bearish", // resistance = liquidity above
          range: [Math.min(highs[i].price, highs[j].price), Math.max(highs[i].price, highs[j].price)],
          index: highs[j].index,
          filled: false,
          reason: `Equal highs at ~${avg.toFixed(2)} (${highs[i].price.toFixed(2)} and ${highs[j].price.toFixed(2)})`,
        });
      }
    }
  }

  // Check for equal lows
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const avg = (lows[i].price + lows[j].price) / 2;
      if (Math.abs(lows[i].price - lows[j].price) / avg <= tolerancePct) {
        zones.push({
          type: "equal_levels",
          direction: "bullish", // support = liquidity below
          range: [Math.min(lows[i].price, lows[j].price), Math.max(lows[i].price, lows[j].price)],
          index: lows[j].index,
          filled: false,
          reason: `Equal lows at ~${avg.toFixed(2)} (${lows[i].price.toFixed(2)} and ${lows[j].price.toFixed(2)})`,
        });
      }
    }
  }

  return zones;
}

/**
 * Liquidity Sweep: price spikes through a swing high/low then reverses.
 * Detected when a candle wick exceeds a recent swing level but closes back inside.
 */
function findLiquiditySweeps(candles: Candle[], opts: SmcOptions): SmcZone[] {
  const { internal: swings } = detectSwings(candles, opts);
  const zones: SmcZone[] = [];

  for (const swing of swings) {
    // Check candles after the swing for a sweep
    for (let i = swing.index + 1; i < Math.min(swing.index + 20, candles.length); i++) {
      const c = candles[i];

      if (swing.type === "high") {
        // Sweep: wick above swing high, but close below it
        if (c.high > swing.price && c.close < swing.price) {
          zones.push({
            type: "liquidity_sweep",
            direction: "bearish",
            range: [swing.price, c.high],
            index: i,
            filled: true,
            reason: `Liquidity sweep above ${swing.price.toFixed(2)} (wick to ${c.high.toFixed(2)}, closed ${c.close.toFixed(2)})`,
          });
          break; // Only first sweep per swing level
        }
      } else {
        // Sweep: wick below swing low, but close above it
        if (c.low < swing.price && c.close > swing.price) {
          zones.push({
            type: "liquidity_sweep",
            direction: "bullish",
            range: [c.low, swing.price],
            index: i,
            filled: true,
            reason: `Liquidity sweep below ${swing.price.toFixed(2)} (wick to ${c.low.toFixed(2)}, closed ${c.close.toFixed(2)})`,
          });
          break;
        }
      }
    }
  }

  return zones;
}

/**
 * Check if a zone has been filled by subsequent price action.
 */
function isZoneFilled(candles: Candle[], afterIndex: number, low: number, high: number): boolean {
  for (let i = afterIndex; i < candles.length; i++) {
    if (candles[i].low <= high && candles[i].high >= low) {
      return true;
    }
  }
  return false;
}

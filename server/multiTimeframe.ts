/**
 * Multi-timeframe confirmation: higher-timeframe trend bias as a filter on
 * lower-timeframe signals.
 *
 * Industry practice: the higher timeframe establishes bias; the lower
 * timeframe times the entry — take a signal only when both agree. Reported
 * to cut false-break losses substantially versus single-timeframe analysis.
 *
 * ANTI-LOOKAHEAD RULE (built in from day one): only CLOSED higher-timeframe
 * candles are used. A still-forming HTF candle embeds information that did
 * not exist at signal time — using it is look-ahead bias and would silently
 * inflate any backtest of this filter. The forming candle is dropped here.
 *
 * Pure functions; reuses the existing candle builder + EMA. No new indicator.
 */

import { buildCandles, ema, type TickLike, type Candle } from "@shared/indicators";
import { labelStructure, type Bias } from "@shared/marketStructure";

export interface HigherTimeframeBias {
  /** Higher timeframe analyzed, in seconds (base × HTF_MULTIPLE). */
  timeframeSec: number;
  /** Trend bias from closed HTF candles: fast EMA above/below slow EMA. */
  bias: "up" | "down" | "neutral";
  /** Structural bias from BOS/CHoCH on the higher timeframe. */
  structureBias: Bias;
  /** Whether the HTF structure clearly opposes the proposed trade direction. */
  structureOpposes: boolean;
  /** Number of CLOSED candles the verdict rests on. */
  closedCandles: number;
  /** False when not enough data — callers must treat as "no opinion". */
  available: boolean;
  reason: string;
}

const HTF_MULTIPLE = 4;
const FAST = 9;
const SLOW = 21;

/**
 * Compute the higher-timeframe bias for a tick stream whose native candle
 * timeframe is `baseTimeframeSec`. Only closed HTF candles are considered:
 * a candle opening at T covers [T, T+htfSec) and is only usable once the
 * newest tick epoch ≥ T+htfSec.
 */
export function higherTimeframeBias(ticks: TickLike[], baseTimeframeSec: number): HigherTimeframeBias {
  const htfSec = baseTimeframeSec * HTF_MULTIPLE;
  const unavailable = (reason: string): HigherTimeframeBias => ({
    timeframeSec: htfSec,
    bias: "neutral",
    structureBias: "neutral",
    structureOpposes: false,
    closedCandles: 0,
    available: false,
    reason,
  });

  if (!ticks || ticks.length < 30) return unavailable("Insufficient ticks");

  const all: Candle[] = buildCandles(ticks, htfSec);
  const lastEpoch = ticks[ticks.length - 1].epoch;
  // Drop any candle that has not closed yet (including the one being formed).
  const closed = all.filter((c) => lastEpoch >= c.time + htfSec);
  if (closed.length < SLOW + 2) {
    return unavailable(`Only ${closed.length} closed ${htfSec}s candles (need ${SLOW + 2})`);
  }

  const closes = closed.map((c) => c.close);
  const fastArr = ema(closes, FAST);
  const slowArr = ema(closes, SLOW);
  const f = fastArr[fastArr.length - 1];
  const s = slowArr[slowArr.length - 1];

  if (!Number.isFinite(f) || !Number.isFinite(s)) return unavailable("EMA warm-up incomplete");

  const bias = f > s ? "up" : f < s ? "down" : "neutral";

  // Structure-based bias: BOS/CHoCH on the higher timeframe
  const structure = labelStructure(closed);
  const structureBias = structure.currentBias;

  const dirWord = bias === "up" ? "above" : bias === "down" ? "below" : "level with";
  const structWord = structureBias === "bullish" ? "bullish BOS" : structureBias === "bearish" ? "bearish BOS" : "no clear structure";

  return {
    timeframeSec: htfSec,
    bias,
    structureBias,
    structureOpposes: false, // caller sets this based on trade direction
    closedCandles: closed.length,
    available: true,
    reason: `${htfSec}s trend bias ${bias} (EMA${FAST} ${dirWord} EMA${SLOW}) · structure: ${structWord} · ${closed.length} closed candles`,
  };
}

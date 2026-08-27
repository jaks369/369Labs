/**
 * Kill-zone session weighting — adjust signal confidence based on
 * liquidity quality at signal time.
 *
 * Professional trading discipline: a signal during the London–NY overlap
 * (peak liquidity, tightest spreads) is more reliable than the same signal
 * at NY close → Sydney open (thin liquidity, gappy prints). The weight
 * is a soft multiplier on confidence, not a hard gate.
 *
 * Pure module (no DB / network).
 */

import { getForexSessionInfo, type LiquidityQuality } from "./forexSessions";

export interface SessionWeight {
  /** Multiplier to apply to signal confidence (0.7–1.0). */
  multiplier: number;
  /** Session quality label. */
  quality: LiquidityQuality;
  /** Active sessions. */
  activeSessions: string[];
  /** Human-readable explanation of the weighting. */
  reasoning: string;
}

/**
 * Session weight multipliers.
 * Peak = full confidence. Thin = reduced by 30%.
 */
const WEIGHTS: Record<LiquidityQuality, number> = {
  peak: 1.0,
  good: 0.95,
  normal: 0.85,
  thin: 0.70,
};

/**
 * Compute session weight for the current time.
 * For forex symbols only — synthetic indices are unaffected by session timing.
 */
export function computeSessionWeight(date: Date = new Date()): SessionWeight {
  const info = getForexSessionInfo(date);
  const multiplier = WEIGHTS[info.liquidity];
  const reasoning = `Session: ${info.liquidity} liquidity (${info.activeSessions.join("+") || "none"}) → ×${multiplier} confidence weight. ${info.note}`;
  return {
    multiplier,
    quality: info.liquidity,
    activeSessions: info.activeSessions,
    reasoning,
  };
}

/**
 * Apply session weight to a confidence score.
 * Returns the adjusted confidence (0–100, clamped).
 */
export function applySessionWeight(confidence: number, weight: SessionWeight): number {
  return Math.round(Math.max(0, Math.min(100, confidence * weight.multiplier)));
}

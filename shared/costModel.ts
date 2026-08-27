/**
 * Execution cost model for net-of-cost signal validation.
 *
 * Every Wilson CI, every walk-forward pass rate, every "VALIDATED" badge
 * in this app is currently computed on gross price movement — not what a
 * trade actually nets after real execution costs. This module closes that gap.
 *
 * Key research findings (2026 best practices):
 * - Intraday strategies need ≥3-5 pips expectancy AFTER costs to survive
 * - Session-varying spreads: London/NY overlap 0.25-0.6 pips, Asia 2-4 pips
 * - Event-day slippage: ±3-5 min around macro releases = 2-3× normal slippage
 * - Trend-following suffers more from slippage; mean-reversion suffers least
 *
 * Pure module (no DB / network). All inputs are explicit.
 */

import { getForexSessionInfo, type LiquidityQuality } from "./forexSessions";

export interface CostEstimate {
  /** Total estimated round-trip cost in pips. */
  totalPips: number;
  /** Spread component in pips. */
  spreadPips: number;
  /** Slippage component in pips. */
  slippagePips: number;
  /** Commission component converted to pips (0 for Deriv — spread-only). */
  commissionPips: number;
  /** Session quality used for the estimate. */
  sessionQuality: LiquidityQuality;
  /** Whether this is an event-day estimate ( boosted slippage). */
  isEventDay: boolean;
  /** Human-readable breakdown. */
  reasoning: string[];
}

export interface CostModelOptions {
  /** Override session detection (for backtesting). */
  sessionQuality?: LiquidityQuality;
  /** Whether today is a major macro event day (NFP, CPI, FOMC, ECB, BOE). */
  isEventDay?: boolean;
  /** Symbol-specific spread override in pips (0 = use default). */
  spreadOverridePips?: number;
  /** Volatility multiplier for slippage (1.0 = normal, 2.0 = high vol). */
  volatilityMultiplier?: number;
}

// --- Default cost parameters per session ---

const SPREAD_DEFAULTS: Record<LiquidityQuality, number> = {
  peak: 0.4,   // London/NY overlap: tightest spreads
  good: 0.8,   // London or NY solo
  normal: 1.5, // Off-peak sessions
  thin: 2.5,   // NY close → Sydney open
};

const SLIPPAGE_DEFAULTS: Record<LiquidityQuality, number> = {
  peak: 0.1,
  good: 0.2,
  normal: 0.4,
  thin: 0.8,
};

const EVENT_SLIPPAGE_MULTIPLIER = 2.5;
const VOLATILITY_SLIPPAGE_SCALE = 1.5; // additional multiplier per 1× volatility above 1.0

/**
 * Estimate the round-trip execution cost for a trade on a real-market symbol.
 *
 * @param symbol - the trading symbol (for synthetic index detection)
 * @param opts - cost model options
 */
export function estimateExecutionCost(
  symbol: string,
  opts: CostModelOptions = {},
): CostEstimate {
  const reasoning: string[] = [];

  // Synthetic indices: no spread, no slippage (constant 1-tick spread by design)
  if (symbol.startsWith("R_") || symbol.startsWith("1HZ") || symbol.startsWith("BOOM") || symbol.startsWith("CRASH")) {
    reasoning.push("Synthetic index: constant 1-tick spread, no slippage model needed");
    return {
      totalPips: 0.1,
      spreadPips: 0.1,
      slippagePips: 0,
      commissionPips: 0,
      sessionQuality: "peak",
      isEventDay: false,
      reasoning,
    };
  }

  // Determine session quality
  const sessionQuality = opts.sessionQuality ?? getForexSessionInfo().liquidity;
  const isEventDay = opts.isEventDay ?? false;

  // Spread
  const baseSpread = opts.spreadOverridePips !== undefined && opts.spreadOverridePips > 0
    ? opts.spreadOverridePips
    : SPREAD_DEFAULTS[sessionQuality];
  reasoning.push(`Base spread: ${baseSpread.toFixed(1)} pips (${sessionQuality} liquidity)`);

  // Slippage
  let baseSlippage = SLIPPAGE_DEFAULTS[sessionQuality];
  if (isEventDay) {
    baseSlippage *= EVENT_SLIPPAGE_MULTIPLIER;
    reasoning.push(`Event-day slippage boost: ×${EVENT_SLIPPAGE_MULTIPLIER}`);
  }
  if (opts.volatilityMultiplier !== undefined && opts.volatilityMultiplier > 1.0) {
    const volBoost = 1 + (opts.volatilityMultiplier - 1) * VOLATILITY_SLIPPAGE_SCALE;
    baseSlippage *= volBoost;
    reasoning.push(`Volatility slippage boost: ×${volBoost.toFixed(2)}`);
  }
  reasoning.push(`Slippage: ${baseSlippage.toFixed(2)} pips`);

  const total = baseSpread + baseSlippage;
  reasoning.push(`Total estimated cost: ${total.toFixed(2)} pips (spread + slippage)`);

  return {
    totalPips: total,
    spreadPips: baseSpread,
    slippagePips: baseSlippage,
    commissionPips: 0,
    sessionQuality,
    isEventDay,
    reasoning,
  };
}

/**
 * Compute net confidence: subtract estimated cost impact from gross confidence.
 *
 * The cost impact is estimated as the percentage of the gross edge that
 * execution costs would consume. For a signal with X pp edge over baseline,
 * if costs eat Y pp, the net edge is X - Y, and net confidence adjusts
 * proportionally.
 *
 * @param grossConfidence - the raw signal confidence (0-100)
 * @param baseline - the fair baseline win rate (0-1)
 * @param edgePp - the observed edge in percentage points
 * @param costPips - estimated round-trip cost in pips
 * @param avgMovePips - average expected move in pips during the trade window
 */
export function computeNetConfidence(
  grossConfidence: number,
  baseline: number,
  edgePp: number,
  costPips: number,
  avgMovePips: number,
): { netConfidence: number; costImpactPp: number; reasoning: string[] } {
  const reasoning: string[] = [];

  if (avgMovePips <= 0 || edgePp <= 0) {
    reasoning.push("No positive edge or no price move — net confidence = gross");
    return { netConfidence: grossConfidence, costImpactPp: 0, reasoning };
  }

  // Cost as fraction of the expected move
  const costFraction = Math.min(1, costPips / avgMovePips);
  reasoning.push(`Cost ${costPips.toFixed(2)} pips = ${(costFraction * 100).toFixed(1)}% of expected move ${avgMovePips.toFixed(1)} pips`);

  // Cost impact on edge: costs reduce the observed edge proportionally
  const costImpactPp = Math.round(edgePp * costFraction * 10) / 10;
  const netEdgePp = Math.max(0, edgePp - costImpactPp);
  reasoning.push(`Gross edge: ${edgePp.toFixed(1)} pp → net edge: ${netEdgePp.toFixed(1)} pp (cost impact: -${costImpactPp.toFixed(1)} pp)`);

  // Scale confidence: if costs eat the entire edge, net confidence = baseline
  // If costs eat nothing, net confidence = gross confidence
  const baselineConfidence = baseline * 100;
  const netConfidence = edgePp > 0
    ? baselineConfidence + (grossConfidence - baselineConfidence) * (netEdgePp / edgePp)
    : grossConfidence;

  reasoning.push(`Net confidence: ${netConfidence.toFixed(1)} (was ${grossConfidence.toFixed(1)})`);

  return {
    netConfidence: Math.round(Math.max(0, Math.min(100, netConfidence)) * 10) / 10,
    costImpactPp,
    reasoning,
  };
}

/**
 * Expected average move in pips during a trade window.
 * Used as denominator for cost-as-fraction-of-edge calculation.
 *
 * For digit contracts: the window is ~1 tick, so the move is small.
 * For CALL/PUT: the window is the trade duration (typically 1-5 ticks).
 * This is a rough heuristic — a proper version would use ATR.
 */
export function expectedMovePips(symbol: string, windowTicks: number): number {
  // Rough heuristic based on symbol type and window
  if (symbol.startsWith("R_")) return windowTicks * 0.5; // Volatility indices: ~0.5 pips/tick
  if (symbol.startsWith("1HZ")) return windowTicks * 0.3;
  if (symbol.startsWith("BOOM") || symbol.startsWith("CRASH")) return windowTicks * 1.0;

  // Forex: typical 1-minute ATR ~3-8 pips depending on pair
  // Scale by window ticks (assuming ~1 tick/second)
  return windowTicks * 0.5; // conservative estimate
}

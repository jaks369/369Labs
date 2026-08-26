/**
 * Edge-aware position sizing via fractional Kelly criterion.
 *
 * Kelly: f* = (bp − q) / b, where b = payout ratio (net odds), p = win
 * probability, q = 1 − p. Full Kelly maximizes long-run compound growth but
 * with drawdowns no retail trader should be sold; standard professional
 * practice is HALF or QUARTER Kelly (~75% of the growth at a fraction of the
 * variance). This module implements quarter-Kelly with hard caps.
 *
 * HONESTY RULES (non-negotiable):
 *  - A suggestion exists ONLY when the signal's win-rate estimate clears its
 *    own uncertainty: the Wilson CI LOW must exceed the baseline. A point
 *    estimate alone never justifies size beyond minimum.
 *  - Sample size gates everything: fewer than MIN samples → no suggestion.
 *  - Output is a SUGGESTION with provenance, never an auto-applied stake.
 *
 * Pure functions only.
 */

/** Minimum settled in-sample trades before any sizing opinion. */
export const KELLY_MIN_SAMPLES = 100;
/** Fraction of full Kelly used (quarter-Kelly). */
export const KELLY_FRACTION = 0.25;
/** Hard cap on suggested fraction of balance per trade. */
export const KELLY_MAX_FRACTION = 0.05; // 5% of balance

export interface KellyInput {
  /** Validated win probability estimate (0..1) — use OOS rate when available. */
  winRate: number;
  /** Lower bound of the win-rate confidence interval (0..1). */
  ciLow: number;
  /** Fair/baseline win probability (0..1) — chance level for this contract. */
  baseline: number;
  /** Payout ratio b: net profit per unit staked on a win (e.g. 0.95). */
  payoutRatio: number;
  /** Settled in-sample trades backing `winRate`. */
  sampleSize: number;
}

export interface KellySuggestion {
  ok: boolean;
  reason: string;
  /** Suggested fraction of balance per trade (0 if no suggestion). */
  fractionOfBalance: number;
  fullKellyFraction: number;
  basis: string;
}

export function kellyStakeSuggestion(input: KellyInput): KellySuggestion {
  const fail = (reason: string): KellySuggestion => ({
    ok: false,
    reason,
    fractionOfBalance: 0,
    fullKellyFraction: 0,
    basis: "",
  });

  const { winRate, ciLow, baseline, payoutRatio, sampleSize } = input;
  for (const [name, v] of [["winRate", winRate], ["ciLow", ciLow], ["baseline", baseline], ["payoutRatio", payoutRatio]] as const) {
    if (!Number.isFinite(v)) return fail(`${name} is not a number`);
  }
  if (sampleSize < KELLY_MIN_SAMPLES) {
    return fail(`Only ${sampleSize} settled samples — need ${KELLY_MIN_SAMPLES}+ before any sizing opinion`);
  }
  if (payoutRatio <= 0) return fail("Payout ratio must be positive");
  if (ciLow <= baseline) {
    return fail(`Edge not established: CI low ${(ciLow * 100).toFixed(1)}% does not clear the ${(
      baseline * 100
    ).toFixed(1)}% fair rate`);
  }

  // Use the CONSERVATIVE estimate (CI low), never the point estimate.
  const p = Math.min(Math.max(ciLow, 0), 1);
  const q = 1 - p;
  const b = payoutRatio;
  const fullKelly = (b * p - q) / b;

  if (fullKelly <= 0) return fail("Conservative estimate implies negative edge");

  const quarterKelly = fullKelly * KELLY_FRACTION;
  const capped = Math.min(quarterKelly, KELLY_MAX_FRACTION);

  return {
    ok: true,
    reason: "ok",
    fractionOfBalance: +capped.toFixed(4),
    fullKellyFraction: +fullKelly.toFixed(4),
    basis:
      `Quarter-Kelly from the conservative estimate: p=CI-low ${(p * 100).toFixed(1)}%, fair ${(baseline * 100).toFixed(1)}%, ` +
      `payout ${b}×, n=${sampleSize}. Capped at ${(KELLY_MAX_FRACTION * 100).toFixed(1)}% of balance.`,
  };
}

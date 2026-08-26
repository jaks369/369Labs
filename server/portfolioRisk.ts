/**
 * Portfolio-level risk: aggregate "heat" across ALL of a user's simultaneously
 * open exposure — the control that per-bot/per-trade limits structurally
 * cannot provide.
 *
 * Professional guidance caps total open risk around 15-20% of account equity
 * regardless of how many individual positions make it up, because correlated
 * positions lose together (five individually-fine trades can be one large
 * bet on a single direction).
 *
 * Heat here = sum of stakes of OPEN/PENDING contracts ÷ account balance.
 * Pending 1-tick contracts are fully at risk (stake -100%), so stake IS the
 * risk measure for this product's contract types.
 *
 * Pure functions only; callers supply open positions and balance.
 */

/** Platform cap on total open risk as a fraction of equity. Overridable via PORTFOLIO_MAX_HEAT_PCT. */
export function maxHeatPct(): number {
  const v = parseFloat(process.env.PORTFOLIO_MAX_HEAT_PCT || "");
  return Number.isFinite(v) && v >= 1 && v <= 100 ? v : 20;
}

export interface HeatResult {
  balance: number;
  openStake: number;
  openCount: number;
  /** Open stake as % of balance. */
  heatPct: number;
  capPct: number;
  /** Would adding `newStake` stay under the cap? */
  wouldAllowNew: (newStake: number) => boolean;
  /** Headroom left before the cap, in currency units. */
  remainingStakeCapacity: number;
}

export const NO_BALANCE: HeatResult = Object.freeze({
  balance: 0,
  openStake: 0,
  openCount: 0,
  heatPct: 0,
  capPct: maxHeatPct(),
  // Without a known balance we cannot compute heat — fail OPEN for display but
  // callers gating real money must treat unknown-balance as not-gateable and
  // fall back to their existing per-bot limits.
  wouldAllowNew: () => true,
  remainingStakeCapacity: Number.POSITIVE_INFINITY,
});

export function computePortfolioHeat(openStakes: Array<number | string>, balance: number): HeatResult {
  const capPct = maxHeatPct();
  if (!Number.isFinite(balance) || balance <= 0) return { ...NO_BALANCE };
  // Stakes frequently arrive as decimal strings from the DB — coerce, then clamp.
  const clean = openStakes.map((v) => (typeof v === "number" ? v : parseFloat(v))).filter((v) => Number.isFinite(v)).map((v) => Math.max(0, v));
  const openStake = clean.reduce((s, v) => s + v, 0);
  const heatPct = (openStake / balance) * 100;
  const capacity = Math.max(0, (balance * capPct) / 100 - openStake);
  return {
    balance,
    openStake,
    openCount: openStakes.length,
    heatPct,
    capPct,
    wouldAllowNew: (newStake: number) => newStake <= capacity,
    remainingStakeCapacity: capacity,
  };
}

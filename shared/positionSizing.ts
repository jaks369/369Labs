/**
 * Position Sizing - Mathematical, not guesswork
 * All methods include safety caps (max 2% balance per trade, min $0.35)
 */

export type SizingMethod = 'kelly' | 'fixed' | 'vol_adjusted';

export interface SizingInput {
  balance: number;
  winRate: number;      // historical win rate for this signal type (0-1)
  payout: number;       // net payout per $1 risked (e.g., 0.95 for 95%)
  riskPct: number;      // user's risk % (e.g., 0.02 = 2%)
  atr?: number;         // for vol-adjusted
  price?: number;       // for vol-adjusted
  kellyFraction?: number; // default 0.25 (25% Kelly)
}

export interface SizingResult {
  stake: number;
  method: SizingMethod;
  maxStake: number;     // 5% balance cap
  riskAmount: number;   // dollars at risk
  maxLossStreak: number; // max consecutive losses at this stake before hitting daily loss cap
  kellyRaw?: number;    // raw Kelly % (uncapped)
  note: string;
}

const MIN_STAKE = 0.35;
const MAX_BALANCE_PCT = 0.02; // 2% hard cap — Kotegawa-style professional ceiling

/** Kelly Criterion: f = (bp - q) / b where b=payout, p=winRate, q=1-p */
export function kellyStake(input: SizingInput): SizingResult {
  const { balance, winRate, payout, riskPct, kellyFraction = 0.25 } = input;
  const b = payout;
  const p = winRate;
  const q = 1 - p;
  
  const kellyRaw = (b * p - q) / b; // can be negative
  const kellySafe = Math.max(0, kellyRaw) * kellyFraction;
  const stake = Math.min(balance * kellySafe, balance * MAX_BALANCE_PCT);
  const finalStake = Math.max(MIN_STAKE, Math.round(stake * 100) / 100);
  
  return {
    stake: finalStake,
    method: 'kelly',
    maxStake: Math.round(balance * MAX_BALANCE_PCT * 100) / 100,
    riskAmount: finalStake,
    maxLossStreak: Math.floor((balance * riskPct) / finalStake) || 1,
    kellyRaw: Math.round(kellyRaw * 10000) / 100,
    note: kellyRaw <= 0 
      ? 'Kelly negative - no mathematical edge detected. Using minimum stake.'
      : `25% Kelly (${(kellyRaw * 100).toFixed(1)}% raw) = ${(kellySafe * 100).toFixed(2)}% of balance`,
  };
}

/** Fixed Fractional: stake = balance * riskPct (capped at 5%) */
export function fixedFractionalStake(input: SizingInput): SizingResult {
  const { balance, riskPct } = input;
  const stake = Math.min(balance * riskPct, balance * MAX_BALANCE_PCT);
  const finalStake = Math.max(MIN_STAKE, Math.round(stake * 100) / 100);
  
  return {
    stake: finalStake,
    method: 'fixed',
    maxStake: Math.round(balance * MAX_BALANCE_PCT * 100) / 100,
    riskAmount: finalStake,
    maxLossStreak: Math.floor((balance * riskPct) / finalStake) || 1,
    note: `Fixed ${(riskPct * 100).toFixed(1)}% of balance = $${finalStake.toFixed(2)}`,
  };
}

/** Volatility-Adjusted: stake = riskAmount / (stopDistance / price) */
export function volatilityAdjustedStake(input: SizingInput): SizingResult {
  const { balance, riskPct, atr, price } = input;
  
  if (!atr || !price || atr <= 0 || price <= 0) {
    // Fallback to fixed fractional
    return fixedFractionalStake(input);
  }
  
  const stopDistance = atr * 1.5; // 1.5x ATR as stop loss distance
  const riskAmount = balance * riskPct;
  const stake = riskAmount / (stopDistance / price);
  const cappedStake = Math.min(stake, balance * MAX_BALANCE_PCT);
  const finalStake = Math.max(MIN_STAKE, Math.round(cappedStake * 100) / 100);
  
  return {
    stake: finalStake,
    method: 'vol_adjusted',
    maxStake: Math.round(balance * MAX_BALANCE_PCT * 100) / 100,
    riskAmount: finalStake * (stopDistance / price),
    maxLossStreak: Math.floor((balance * riskPct) / finalStake) || 1,
    note: `Vol-adjusted: 1.5x ATR($${stopDistance.toFixed(4)}) stop, risk $${riskAmount.toFixed(2)} = $${finalStake.toFixed(2)}`,
  };
}

/** Get stake using user's selected method */
export function getStake(input: SizingInput, method: SizingMethod = 'fixed'): SizingResult {
  switch (method) {
    case 'kelly': return kellyStake(input);
    case 'vol_adjusted': return volatilityAdjustedStake(input);
    case 'fixed':
    default: return fixedFractionalStake(input);
  }
}

/** Expected Value per $1 risked: EV = (winRate * payout) - (1 - winRate) */
export function expectedValue(winRate: number, payout: number): number {
  return (winRate * payout) - (1 - winRate);
}

/** Expected Value in dollars for a given stake */
export function expectedValueDollars(winRate: number, payout: number, stake: number): number {
  return expectedValue(winRate, payout) * stake;
}

/** Format EV for display */
export function formatEV(ev: number): { text: string; color: 'green' | 'red' | 'muted' } {
  if (ev > 0.01) return { text: `+$${ev.toFixed(2)}`, color: 'green' };
  if (ev < -0.01) return { text: `-$${Math.abs(ev).toFixed(2)}`, color: 'red' };
  return { text: `$${ev.toFixed(2)}`, color: 'muted' };
}

/** Format EV% for display */
export function formatEVPercent(winRate: number, payout: number): { text: string; color: 'green' | 'red' | 'muted' } {
  const evPct = expectedValue(winRate, payout) * 100;
  if (evPct > 0.5) return { text: `+${evPct.toFixed(1)}%`, color: 'green' };
  if (evPct < -0.5) return { text: `${evPct.toFixed(1)}%`, color: 'red' };
  return { text: `${evPct.toFixed(1)}%`, color: 'muted' };
}
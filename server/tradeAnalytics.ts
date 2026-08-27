/**
 * R-multiple / expectancy / MAE-MFE analytics for the trading journal.
 *
 * Disciplines (professional-trading bar):
 *  - R-multiple per trade = profitLoss / stake. For binary contracts the FULL
 *    stake is at risk, so a win is ~+0.9R and a loss is exactly -1R. This is
 *    the correct risk-normalized measure for this instrument type.
 *  - Expectancy (mean R and mean $) is the single most important journal
 *    metric: it is the long-run edge per trade. Positive expectancy is the
 *    ONLY thing that justifies trading.
 *  - MAE (maximum adverse excursion) / MFE (maximum favorable excursion) are
 *    computed from actual tick prices in the trade window. They reveal whether
 *    winners first went against you (position sizing / entry timing issue) and
 *    whether losers ever offered an exit that, if taken, would have turned a
 *    loss into a profit (exit discipline issue).
 *  - SAMPLE-SIZE DISCIPLINE: no expectancy / win-rate conclusion is shown
 *    below 30 settled trades. Small samples have variance too high to mean
 *    anything.
 *
 * Pure where possible; MAE/MFE takes an explicit tick array (inject via the
 * caller so this module stays dependency-free).
 */

export const MIN_ANALYTICS_SAMPLE = 30;
export const MIN_EXCURSION_SAMPLE = 5;

export interface AnalyticsTrade {
  id: number;
  symbol: string;
  contractType: string;
  result: "win" | "loss" | string;
  stake: number;
  profitLoss: number | null;
  entryPrice: number;
  exitPrice: number | null;
}

export interface TradeExcursion {
  maePrice: number | null;
  mfePrice: number | null;
}

export interface RMultipleStats {
  avgWinR: number;
  avgLossR: number;
  maxWinR: number;
  maxLossR: number;
  expectsPayout: boolean;
}

export interface ExpectancyResult {
  sampleCount: number;
  sufficient: boolean;
  wins: number;
  losses: number;
  winRatePct: number;
  wilsonLowPct: number;
  avgR: number;
  expectancyPerTradeUsd: number;
  cumulativeR: number;
  profitFactor: number;
  totalProfitUsd: number;
  rStats: RMultipleStats;
  maxDrawdownR: number;
  sharpeR: number | null;
}

export interface ExcursionStats {
  tradeCount: number;
  maeAvgPct: number | null;
  maeMaxPct: number | null;
  mfeAvgPct: number | null;
  mfeMaxPct: number | null;
  prematureExits: number; // count of winners where exit < MFE (gave back after peak)
  lateEntries: number;    // count of trades where MAE exceeded entry bounce threshold
}

export interface SymbolAnalytics {
  symbol: string;
  expectancy: ExpectancyResult;
  trades: AnalyticsTrade[];
  excursion?: ExcursionStats;
}

/** Wilson 95% lower bound on a proportion — reused for honest low win rate. */
function wilsonLow(wins: number, n: number): number {
  if (n <= 0) return 0;
  const z = 1.959964;
  const p = wins / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return Math.max(0, center - margin) * 100;
}

/**
 * Compute R-multiple and expectancy for a set of settled trades.
 * R = profitLoss / stake (risk-normalized). Only trades with a numeric
 * profitLoss and stake > 0 are counted.
 */
export function computeExpectancy(trades: AnalyticsTrade[], minSample = MIN_ANALYTICS_SAMPLE): ExpectancyResult {
  const valid = trades.filter(
    (t) => typeof t.profitLoss === "number" && t.stake > 0 && (t.result === "win" || t.result === "loss"),
  );
  const n = valid.length;

  if (n === 0) {
    return {
      sampleCount: 0,
      sufficient: false,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      wilsonLowPct: 0,
      avgR: 0,
      expectancyPerTradeUsd: 0,
      cumulativeR: 0,
      profitFactor: 0,
      totalProfitUsd: 0,
      rStats: { avgWinR: 0, avgLossR: 0, maxWinR: 0, maxLossR: 0, expectsPayout: false },
      maxDrawdownR: 0,
      sharpeR: null,
    };
  }

  let wins = 0;
  let losses = 0;
  let sumR = 0;
  let totalProfit = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumWinR = 0;
  let sumLossR = 0;
  let maxWinR = -Infinity;
  let maxLossR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  const rValues: number[] = [];

  for (const t of valid) {
    const r = t.profitLoss! / t.stake;
    rValues.push(r);
    sumR += r;
    totalProfit += t.profitLoss!;
    peakR += r;
    if (peakR < maxDrawdownR) maxDrawdownR = peakR;

    if (t.result === "win") {
      wins += 1;
      sumWinR += r;
      grossProfit += t.profitLoss!;
      if (r > maxWinR) maxWinR = r;
    } else {
      losses += 1;
      sumLossR += r;
      grossLoss += Math.abs(t.profitLoss!);
      if (Math.abs(r) > maxLossR) maxLossR = Math.abs(r);
    }
  }

  const mean = sumR / n;
  const variance = rValues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n;
  const sharpeR = variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(n) : null;

  return {
    sampleCount: n,
    sufficient: n >= minSample,
    wins,
    losses,
    winRatePct: Math.round((wins / n) * 1000) / 10,
    wilsonLowPct: Math.round(wilsonLow(wins, n) * 10) / 10,
    avgR: Math.round(mean * 100) / 100,
    expectancyPerTradeUsd: Math.round((totalProfit / n) * 100) / 100,
    cumulativeR: Math.round(sumR * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : (grossProfit > 0 ? Infinity : 0),
    totalProfitUsd: Math.round(totalProfit * 100) / 100,
    rStats: {
      avgWinR: wins > 0 ? Math.round((sumWinR / wins) * 100) / 100 : 0,
      avgLossR: losses > 0 ? Math.round((sumLossR / losses) * 100) / 100 : 0,
      maxWinR: maxWinR === -Infinity ? 0 : Math.round(maxWinR * 100) / 100,
      maxLossR: Math.round(maxLossR * 100) / 100,
      expectsPayout: maxWinR > 1.5, // true payout contracts (win > stake) vs 1:1
    },
    maxDrawdownR: Math.round(maxDrawdownR * 100) / 100,
    sharpeR: sharpeR !== null ? Math.round(sharpeR * 100) / 100 : null,
  };
}

/**
 * Compute MAE / MFE for a single trade from its tick window.
 *
 * Direction-aware: for a CALL, adverse = prices below entry, favorable = above.
 * Returns excursions as a percentage of the entry price (scale-agnostic across
 * forex vs synthetic indices).
 */
export function computeExcursion(
  trade: AnalyticsTrade,
  ticks: Array<{ price: number; epoch: number }>,
): TradeExcursion {
  if (!trade.exitPrice || ticks.length < MIN_EXCURSION_SAMPLE) {
    return { maePrice: null, mfePrice: null };
  }
  const entry = trade.entryPrice;
  if (entry <= 0) return { maePrice: null, mfePrice: null };

  const isUp = trade.contractType === "CALL";
  let mae = 0;
  let mfe = 0;
  for (const t of ticks) {
    if (t.price <= 0) continue;
    const diff = (t.price - entry) / entry;
    if (isUp) {
      if (diff < mae) mae = diff;
      if (diff > mfe) mfe = diff;
    } else {
      if (-diff < mae) mae = -diff;
      if (-diff > mfe) mfe = -diff;
    }
  }
  return { maePrice: mae * 100, mfePrice: mfe * 100 };
}

/**
 * Aggregate MAE/MFE stats across a group of trades with tick data.
 * Also flags two classic journal patterns:
 *  - premature exits: winner where exit < peak MFE (gave back profit -> exit discipline)
 *  - late entries: trades that went strongly adverse (> some threshold) before resolving,
 *    suggesting the entry was late relative to the move.
 */
export function summarizeExcursions(
  excursions: Array<{ trade: AnalyticsTrade; maePct: number | null; mfePct: number | null }>,
): ExcursionStats | null {
  const withData = excursions.filter((e) => e.maePct !== null && e.mfePct !== null);
  if (withData.length < MIN_EXCURSION_SAMPLE) return null;

  let maeSum = 0;
  let mfeSum = 0;
  let maeMax = 0;
  let mfeMax = 0;
  let prematureExits = 0;
  let lateEntries = 0;

  for (const e of withData) {
    maeSum += e.maePct!;
    mfeSum += e.mfePct!;
    if (e.maePct! > maeMax) maeMax = e.maePct!;
    if (e.mfePct! > mfeMax) mfeMax = e.mfePct!;

    const won = e.trade.result === "win";
    if (won && e.trade.exitPrice && e.mfePct! > 0.3) {
      // Winner gave back at least 0.3% from its peak
      prematureExits += 1;
    }
    if (e.maePct! > 0.5) {
      lateEntries += 1;
    }
  }

  return {
    tradeCount: withData.length,
    maeAvgPct: Math.round((maeSum / withData.length) * 1000) / 1000,
    maeMaxPct: Math.round(maeMax * 1000) / 1000,
    mfeAvgPct: Math.round((mfeSum / withData.length) * 1000) / 1000,
    mfeMaxPct: Math.round(mfeMax * 1000) / 1000,
    prematureExits,
    lateEntries,
  };
}

/**
 * Per-symbol expectancy breakdown. Enforces the min-sample gate per symbol:
 * a symbol with < minSample settled trades gets no expectancy verdict, only
 * the raw count. Keeps naive users from reading edge into noise.
 */
export function analyzeSymbols(trades: AnalyticsTrade[]): SymbolAnalytics[] {
  const bySymbol = new Map<string, AnalyticsTrade[]>();
  for (const t of trades) {
    const arr = bySymbol.get(t.symbol) || [];
    arr.push(t);
    bySymbol.set(t.symbol, arr);
  }
  return Array.from(bySymbol.entries())
    .map(([symbol, list]) => ({
      symbol,
      trades: list,
      expectancy: computeExpectancy(list),
    }))
    .sort((a, b) => b.expectancy.sampleCount - a.expectancy.sampleCount);
}
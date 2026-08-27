/**
 * Edge decay monitoring — rolling-window signal performance tracker.
 *
 * Detects when a signal type's historical edge (win rate, R-multiple) is
 * statistically decaying, which indicates regime shift, overfitting, or
 * strategy fatigue. Two rolling windows (30d and 7d) are compared; when
 * the recent window underperforms the long window by more than a threshold
 * AND has enough samples, a DECAYING verdict is emitted.
 *
 * Pure module (no DB / network). Caller provides the outcome stream.
 */

import { wilsonInterval, binomialPvsBaseline } from "./signalStats";
import { MIN_ANALYTICS_SAMPLE } from "./tradeAnalytics";

export interface SignalOutcome {
  symbol: string;
  family: string;
  result: "win" | "loss";
  rMultiple: number;
  tsMs: number;
}

export interface DecayWindow {
  label: string;
  sampleCount: number;
  winRatePct: number;
  avgR: number;
  wilsonLowPct: number;
}

export type DecayVerdict = "STABLE" | "CAUTION" | "DECAYING" | "INSUFFICIENT";

export interface DecayReport {
  symbol: string;
  family: string;
  verdict: DecayVerdict;
  longWindow: DecayWindow;
  recentWindow: DecayWindow;
  degradationPp: number; // long winRate - recent winRate (positive = decay)
  degradationR: number;  // long avgR - recent avgR (positive = decay)
  significant: boolean;  // is the decay statistically significant?
  reasoning: string[];
}

/** Rolling window boundaries in milliseconds. */
export const LONG_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Minimum degradation in win-rate percentage points to flag as CAUTION.
 * A 3pp drop on a ~50% baseline is meaningful (similar to BH-FDR threshold).
 */
export const CAUTION_DEGRADATION_PP = 3;

/**
 * Minimum degradation in win-rate pp to flag as DECAYING.
 */
export const DECAY_DEGRADATION_PP = 6;

/**
 * Minimum sample size per window for a valid comparison.
 */
export const MIN_WINDOW_SAMPLES = 15;

/**
 * Compute a decay window's stats from a set of outcomes.
 */
function computeWindow(outcomes: SignalOutcome[], label: string): DecayWindow {
  const n = outcomes.length;
  if (n === 0) {
    return { label, sampleCount: 0, winRatePct: 0, avgR: 0, wilsonLowPct: 0 };
  }
  const wins = outcomes.filter((o) => o.result === "win").length;
  const ci = wilsonInterval(wins, n);
  const avgR = outcomes.reduce((s, o) => s + o.rMultiple, 0) / n;
  return {
    label,
    sampleCount: n,
    winRatePct: Math.round((wins / n) * 1000) / 10,
    avgR: Math.round(avgR * 100) / 100,
    wilsonLowPct: Math.round(ci.low * 1000) / 10,
  };
}

/**
 * Analyze edge decay for a specific symbol+family combination.
 * Expects outcomes sorted chronologically (oldest first).
 */
export function analyzeDecay(
  outcomes: SignalOutcome[],
  symbol: string,
  family: string,
  nowMs: number = Date.now(),
): DecayReport {
  const reasoning: string[] = [];
  const longCutoff = nowMs - LONG_WINDOW_MS;
  const recentCutoff = nowMs - RECENT_WINDOW_MS;

  const longWindow = outcomes.filter((o) => o.tsMs >= longCutoff && o.tsMs < recentCutoff);
  const recentWindow = outcomes.filter((o) => o.tsMs >= recentCutoff);

  const longStats = computeWindow(longWindow, "30d (excl. recent 7d)");
  const recentStats = computeWindow(recentWindow, "7d");

  reasoning.push(`Long window: ${longStats.sampleCount} trades, ${longStats.winRatePct}% WR, ${longStats.avgR}R`);
  reasoning.push(`Recent window: ${recentStats.sampleCount} trades, ${recentStats.winRatePct}% WR, ${recentStats.avgR}R`);

  // Compare
  const degradationPp = longStats.winRatePct - recentStats.winRatePct;
  const degradationR = longStats.avgR - recentStats.avgR;
  reasoning.push(`Degradation: ${degradationPp.toFixed(1)}pp (${degradationR.toFixed(2)}R)`);

  // Determine verdict
  let verdict: DecayVerdict = "STABLE";
  let significant = false;

  if (longStats.sampleCount < MIN_WINDOW_SAMPLES || recentStats.sampleCount < MIN_WINDOW_SAMPLES) {
    verdict = "INSUFFICIENT";
    reasoning.push("Insufficient samples in one or both windows");
  } else if (degradationPp >= DECAY_DEGRADATION_PP) {
    // Check statistical significance: is the recent window significantly worse?
    // Use a simple two-proportion z-test
    const p1 = longStats.winRatePct / 100;
    const n1 = longStats.sampleCount;
    const p2 = recentStats.winRatePct / 100;
    const n2 = recentStats.sampleCount;
    const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    const z = se > 0 ? (p1 - p2) / se : 0;
    significant = z > 1.645; // one-sided 95% confidence
    verdict = significant ? "DECAYING" : "CAUTION";
    reasoning.push(`Two-proportion z=${z.toFixed(2)}, significant=${significant}`);
  } else if (degradationPp >= CAUTION_DEGRADATION_PP) {
    verdict = "CAUTION";
    reasoning.push("Degradation above caution threshold but below decay threshold");
  }

  reasoning.push(`Verdict: ${verdict}`);

  return {
    symbol,
    family,
    verdict,
    longWindow: longStats,
    recentWindow: recentStats,
    degradationPp,
    degradationR,
    significant,
    reasoning,
  };
}

/**
 * Analyze edge decay across all symbol+family combinations from a set of outcomes.
 * Groups outcomes by symbol+family, runs decay analysis on each.
 */
export function analyzeDecayAll(outcomes: SignalOutcome[], nowMs: number = Date.now()): DecayReport[] {
  const groups = new Map<string, SignalOutcome[]>();
  for (const o of outcomes) {
    const key = `${o.symbol}|${o.family}`;
    const arr = groups.get(key) || [];
    arr.push(o);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const [symbol, family] = key.split("|");
      return analyzeDecay(list.sort((a, b) => a.tsMs - b.tsMs), symbol, family, nowMs);
    })
    .sort((a, b) => {
      const order: Record<DecayVerdict, number> = { DECAYING: 0, CAUTION: 1, STABLE: 2, INSUFFICIENT: 3 };
      return order[a.verdict] - order[b.verdict];
    });
}

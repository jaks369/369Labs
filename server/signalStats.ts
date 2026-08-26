/**
 * Statistical core for the signal engine: baseline-correct binomial tests,
 * Wilson score intervals, Benjamini-Hochberg FDR, and multi-window
 * walk-forward validation. All helpers are pure and dependency-free.
 */

// Wilson score interval around an observed proportion.
export function wilsonInterval(wins: number, n: number, z = 1.959964): { low: number; high: number; point: number } {
  if (n <= 0) return { low: 0, high: 0, point: 0 };
  const p = wins / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin), point: p };
}

function logFac(n: number): number {
  if (n <= 1) return 0;
  if (n > 170) return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function binomPmf(k: number, n: number, p0: number): number {
  if (k < 0 || k > n) return 0;
  return Math.exp(logFac(n) - logFac(k) - logFac(n - k) + k * Math.log(p0) + (n - k) * Math.log(1 - p0));
}

function normCdf(x: number): number {
  if (x < -20) return 0;
  if (x > 20) return 1;
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}

/**
 * Two-sided exact binomial p-value of observing `wins` in `n` trials when the
 * TRUE probability is `baseline` (NOT 0.5). This is the baseline-corrected
 * test the old engine got wrong (it always tested against a 50% coin flip,
 * which made DIGITDIFF ~90% look "significant").
 */
export function binomialPvsBaseline(wins: number, n: number, baseline: number): number {
  if (n <= 0) return 1;
  const p0 = Math.max(1e-9, Math.min(1 - 1e-9, baseline));
  const obs = wins / n;
  if (n >= 100) {
    const mean = n * p0;
    const sd = Math.sqrt(n * p0 * (1 - p0));
    if (sd < 1e-9) return 0;
    const z = (obs > p0 ? (wins - 0.5 - mean) : (wins + 0.5 - mean)) / sd;
    return Math.min(1, 2 * (1 - normCdf(Math.abs(z))));
  }
  const pk = binomPmf(wins, n, p0);
  if (!Number.isFinite(pk)) return 1;
  let twoSided = 0;
  for (let x = 0; x <= n; x++) {
    if (binomPmf(x, n, p0) <= pk + 1e-15) twoSided += binomPmf(x, n, p0);
  }
  return Math.min(1, twoSided);
}

// Benjamini-Hochberg FDR correction. Parallel boolean array: true = rejected.
export function benjaminiHochbergFDR(pValues: number[], fdrLevel = 0.05): boolean[] {
  const m = pValues.length;
  if (m === 0) return [];
  const idx = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const rejected = new Array<boolean>(m).fill(false);
  let largest = -1;
  for (let k = 0; k < m; k++) {
    if (idx[k].p <= ((k + 1) / m) * fdrLevel) largest = k;
  }
  for (let k = 0; k <= largest; k++) rejected[idx[k].i] = true;
  return rejected;
}

// Observed rate difference in percentage points vs a baseline (0-1).
export function edgePp(observed: number, baseline: number): number {
  return Math.round((observed - baseline) * 1000) / 10;
}

export interface WalkForwardWindow {
  wins: number;
  n: number;
  rate: number;
}

/** How many sequential windows a candidate is split into for walk-forward. */
export const WALK_FORWARD_WINDOWS = 5;
/** Minimum windows that must hold (CI low > baseline) for it to count as stable. */
export const WALK_FORWARD_REQUIRED = 3;
/** Minimum samples a window needs before its hold/pass decision is trustworthy. */
export const MIN_WINDOW_SAMPLES = 20;
/** Minimum total out-of-sample samples before a "failed" verdict is permitted. */
export const MIN_OOS_SAMPLES = 40;
/**
 * Minimum absolute edge (percentage points over baseline) a candidate must show
 * in-sample to be worth watching. Kills noise like "51% vs 50% is nothing".
 */
export const MIN_EDGE_PP = 3;

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgRate: number;
  holdCount: number;
  settledCount: number;
  oosTotal: number;
  stable: boolean;
}

export function walkForwardSummary(windowsIn: { wins: number; n: number }[], baseline: number): WalkForwardResult {
  const windows: WalkForwardWindow[] = windowsIn.map((w) => ({ ...w, rate: w.n > 0 ? w.wins / w.n : 0 }));
  const settled = windows.filter((w) => w.n >= MIN_WINDOW_SAMPLES);
  const holdCount = settled.filter((w) => wilsonInterval(w.wins, w.n).low > baseline).length;
  const avgRate = settled.length ? settled.reduce((s, w) => s + w.rate, 0) / settled.length : 0;
  return {
    windows,
    avgRate,
    holdCount,
    settledCount: settled.length,
    oosTotal: windows.reduce((s, w) => s + w.n, 0),
    stable: holdCount >= WALK_FORWARD_REQUIRED,
  };
}

export type SignalTier = "strong" | "watch" | "insufficient" | "failed" | "no_edge";

/**
 * Assign an overall tier from the in-sample significance decision, the
 * in-sample edge magnitude AND the walk-forward hold count.
 *
 * Order of decisions matters (§ spec):
 *  1. no_edge       — not significant vs baseline, CI does not clear baseline,
 *                     or the observed edge is below MIN_EDGE_PP ("51% vs 50%").
 *  2. insufficient  — significant edge exists in-sample but there is NOT enough
 *                     out-of-sample data to judge it. This is a watch-state, NOT
 *                     "failed": a verdict of failure requires adequate forward data.
 *  3. failed        — enough forward data existed and the edge did not hold.
 *  4. strong        — edge held forward across >= WALK_FORWARD_REQUIRED windows.
 *  5. watch         — edge present in-sample, held in some but not all windows.
 */
export function assignTier(
  significant: boolean,
  ciLowClears: boolean,
  edgePp: number,
  oosTotal: number,
  wf: WalkForwardResult,
): SignalTier {
  if (!significant || !ciLowClears || Math.abs(edgePp) < MIN_EDGE_PP) return "no_edge";
  if (oosTotal < MIN_OOS_SAMPLES) return "insufficient";
  if (wf.settledCount === 0) return "insufficient";
  if (wf.holdCount === 0) return "failed";
  if (wf.holdCount >= WALK_FORWARD_REQUIRED) return "strong";
  return "watch";
}

export interface CalibrationBucket {
  label: string;
  statedPct: number; // midpoint of the stated-confidence bucket
  total: number;
  wins: number;
  observedWinRatePct: number;
  wilsonLowPct: number;
  wilsonHighPct: number;
}

export interface CalibrationResult {
  total: number;
  brierScore: number;
  buckets: CalibrationBucket[];
}

/**
 * Reliability calibration: do stated confidence percentages match observed
 * win rates? Buckets settled predictions by stated confidence, compares each
 * against the observed rate with a Wilson 95% CI, and computes an overall
 * Brier score (lower is better; 0.25 = chance for a ~50/50 contract).
 *
 * Confidence on digit reads is deliberately capped near ~58, so buckets cover
 * that honest range without empty high bins.
 */
export function calibrateConfidence(reads: Array<{ confidence: number; win: boolean }>): CalibrationResult {
  const EDGES: Array<{ label: string; lo: number; hi: number; mid: number }> = [
    { label: "50–51%", lo: 50, hi: 51.99, mid: 51 },
    { label: "52–53%", lo: 52, hi: 53.99, mid: 53 },
    { label: "54–55%", lo: 54, hi: 55.99, mid: 55 },
    { label: "56–57%", lo: 56, hi: 57.99, mid: 57 },
    { label: "58%+", lo: 58, hi: Infinity, mid: 58.5 },
  ];

  let brierSum = 0;
  for (const r of reads) {
    const p = r.confidence / 100;
    brierSum += Math.pow(p - (r.win ? 1 : 0), 2);
  }

  const buckets: CalibrationBucket[] = [];
  for (const edge of EDGES) {
    const inBucket = reads.filter((r) => r.confidence >= edge.lo && r.confidence <= edge.hi);
    if (inBucket.length === 0) continue;
    const wins = inBucket.filter((r) => r.win).length;
    const ci = wilsonInterval(wins, inBucket.length);
    buckets.push({
      label: edge.label,
      statedPct: edge.mid,
      total: inBucket.length,
      wins,
      observedWinRatePct: Math.round(ci.point * 100),
      wilsonLowPct: Math.round(ci.low * 100),
      wilsonHighPct: Math.round(ci.high * 100),
    });
  }

  return { total: reads.length, brierScore: brierSum / reads.length, buckets };
}

export interface PooledOutcomeStats {
  total: number;
  wins: number;
  observedWinRatePct: number;
  wilsonLowPct: number;
  wilsonHighPct: number;
}

/**
 * Pooled win-rate stats with Wilson CI for ONE homogeneous group of outcomes.
 *
 * CRITICAL: callers must only pool outcomes sharing the same fair baseline.
 * Mixing contract types (e.g. Differs ~90% fair with Even/Odd ~50% fair)
 * produces a meaningless blended rate that can masquerade as an edge — the
 * whole reason Kelly sizing must be computed PER CONTRACT TYPE.
 */
export function pooledOutcomeStats(reads: Array<{ win: boolean }>): PooledOutcomeStats | null {
  const n = reads.length;
  if (n === 0) return null;
  const wins = reads.filter((r) => r.win).length;
  const ci = wilsonInterval(wins, n);
  return {
    total: n,
    wins,
    observedWinRatePct: Math.round(ci.point * 100),
    wilsonLowPct: Math.round(ci.low * 100),
    wilsonHighPct: Math.round(ci.high * 100),
  };
}
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

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgRate: number;
  holdCount: number;
  stable: boolean;
}

export function walkForwardSummary(windowsIn: { wins: number; n: number }[], baseline: number): WalkForwardResult {
  const windows: WalkForwardWindow[] = windowsIn.map((w) => ({ ...w, rate: w.n > 0 ? w.wins / w.n : 0 }));
  const settled = windows.filter((w) => w.n >= 20);
  const holdCount = settled.filter((w) => wilsonInterval(w.wins, w.n).low > baseline).length;
  const avgRate = settled.length ? settled.reduce((s, w) => s + w.rate, 0) / settled.length : 0;
  return {
    windows,
    avgRate,
    holdCount,
    stable: holdCount >= WALK_FORWARD_REQUIRED,
  };
}

export type SignalTier = "strong" | "watch" | "failed" | "no_edge";

/**
 * Assign an overall tier from the in-sample significance decision AND the
 * walk-forward hold count.
 */
export function assignTier(
  significant: boolean,
  ciLowClears: boolean,
  wf: WalkForwardResult,
): SignalTier {
  if (!significant || !ciLowClears) return "no_edge";
  if (wf.windows.length === 0) return significant ? "watch" : "no_edge";
  // looks good in-sample but failed to hold forward
  if (wf.holdCount === 0) return "failed";
  if (wf.holdCount >= WALK_FORWARD_REQUIRED) return "strong";
  return "watch";
}
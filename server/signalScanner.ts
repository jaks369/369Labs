import { getDb, saveSignal as dbSaveSignal } from "./db";
import { getTickHistory, normalizeSymbol } from "./aitools";
import { notifyUser } from "./_core/notification";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { actionToContractType, simulateOutcome } from "@shared/contractSim";
import { getStandardVolatilitySymbols } from "@shared/symbols";

// Benjamini-Hochberg FDR correction for multiple comparisons
function benjaminiHochbergFDR(pValues: number[], fdrLevel = 0.05): boolean[] {
  const m = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  
  const rejected = new Array(m).fill(false);
  for (let k = 0; k < m; k++) {
    const critical = ((k + 1) / m) * fdrLevel;
    if (indexed[k].p <= critical) {
      rejected[indexed[k].i] = true;
    } else {
      break;
    }
  }
  return rejected;
}

// Binomial test p-value (two-tailed) for win rate vs 50% null
function binomialPValue(wins: number, total: number): number {
  if (total === 0) return 1;
  const p = 0.5;
  const k = wins;
  const n = total;
  
  // Use normal approximation for large n, exact for small n
  if (n >= 20) {
    const mean = n * p;
    const std = Math.sqrt(n * p * (1 - p));
    const z = (k - mean) / std;
    // Two-tailed p-value from standard normal
    return 2 * (1 - normalCDF(Math.abs(z)));
  }
  
  // Exact binomial test (sum of probabilities as or more extreme)
  let pValue = 0;
  const observedProb = binomPMF(k, n, p);
  for (let x = 0; x <= n; x++) {
    if (binomPMF(x, n, p) <= observedProb + 1e-12) {
      pValue += binomPMF(x, n, p);
    }
  }
  return Math.min(1, pValue);
}

function binomPMF(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  // Use log to avoid overflow
  const logP = logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logP);
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  // Stirling's approximation for large n, exact for small
  if (n > 170) {
    return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
  }
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function normalCDF(x: number): number {
  // Approximation of standard normal CDF
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - prob;
}

// Signals decay: digit patterns on volatile symbols lose edge quickly.
// A signal is considered valid for this many minutes after discovery.
export const SIGNAL_TTL_MIN = 60;

// Pattern categories the scanner can detect over a tick window. Covers the
// Digit "markets" offered by Deriv: Rise/Fall, Over/Under, Even/Odd, Match/Diff.
export type PatternType =
  | "digit_bias" // a specific digit -> next tick RISE / FALL
  | "digit_streak" // 3× same digit in a row -> reversion
  | "even_odd_run" // even/odd digit -> RISE / FALL
  | "even_odd" // an even/odd digit -> next digit EVEN / ODD
  | "over_under" // a specific digit -> next digit OVER / UNDER a barrier
  | "match_diff" // a specific digit -> next digit MATCHES / DIFFERS
  | "momentum_after_digit";
export type PatternCat = "any" | PatternType;

interface ScanOptions {
  userId: number;
  symbol: string;
  sampleSize?: number; // number of ticks to analyze
  minWinRate?: number; // 0..100 threshold to record a signal (applied to BOTH in-sample and OOS)
  patternType?: PatternType | "any";
  // Out-of-sample validation: the tick window is split; the rule is discovered
  // on the earlier portion and must also hold forward on the later portion.
  oosSplitRatio?: number; // in (0,1): fraction used for in-sample discovery
  oosMinSamples?: number; // minimum validated samples to accept
}

interface Candidate {
  rule: any;
  desc: string;
  pType: PatternType;
}

// Analyze a window of {price, timestamp(ms)} ticks and emit candidate signals.
// Each candidate is validated out-of-sample (forward half) before being returned.
export async function scanTicks(opts: ScanOptions): Promise<any[]> {
  const symbol = normalizeSymbol(opts.symbol);
  const decimals = getDecimalPlaces(symbol);
  const sample = opts.sampleSize || 300;
  const minWin = opts.minWinRate ?? 55;
  const oosRatio = opts.oosSplitRatio ?? 0.6;
  const oosMin = opts.oosMinSamples ?? 20;
  const ticks = await getTickHistory(symbol, sample); // [{price, timestamp(ms)}] old->new
  if (ticks.length < 30) return [];

  const prices = ticks.map((t) => Number(t.price));
  const digits = prices.map((p) => lastDigitOf(p, decimals));
  const nowSec = Math.floor(Date.now() / 1000);

  // Split: in-sample discovery (earlier) vs out-of-sample forward test (later).
  const splitIdx = Math.max(20, Math.floor(ticks.length * oosRatio));

  // Evidence keeps the digit trail for human inspection, but is never used to
  // tune the rule (it is the whole window, for display only).
  const evidenceTicks = ticks.slice(-60).map((t) => ({
    epoch: Math.floor(t.timestamp / 1000),
    price: Number(t.price),
    lastDigit: lastDigitOf(Number(t.price), decimals),
  }));

  const candidates: { rule: any; desc: string; pType: PatternType; inWins: number; inTotal: number; oosWins: number; oosTotal: number; pValue: number }[] = [];

  const evaluate = (rule: any, desc: string, pType: PatternType) => {
    const is = patternMatches(rule, prices, digits, 0, splitIdx, decimals);
    // Ensure OOS window has at least 2 ticks (need trigger at i and settlement at i+1)
    const oosWindowSize = ticks.length - splitIdx;
    if (oosWindowSize < 2) return;
    const oos = patternMatches(rule, prices, digits, splitIdx, ticks.length, decimals);
    const inTotal = is.wins + is.losses;
    const oosTotal = oos.wins + oos.losses;
    if (inTotal < 20 || oosTotal < oosMin) return;
    
    // Compute p-value for in-sample win rate vs 50% null
    const pValue = binomialPValue(is.wins, inTotal);
    
    candidates.push({ rule, desc, pType, inWins: is.wins, inTotal, oosWins: oos.wins, oosTotal, pValue });
  };
  // --- Digit market conversion of a trigger digit d into the NEXT-tick digit ----
  // The "match" walks the tick stream: if the trigger digit occurs at tick i,
  // we bet the contract and settle on tick i+1's outcome.

  // 1. Rise/Fall (Digit bias): after digit d, next price RISE / FALL
  for (let d = 0; d <= 9; d++) {
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_rise" } },
      `After digit ${d}, price tends to RISE`,
      "digit_bias",
    );
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_fall" } },
      `After digit ${d}, price tends to FALL`,
      "digit_bias",
    );
  }

  // 1b. Even/Odd run: after an even digit, next price direction
  for (const [parity, label] of [[0, "EVEN"], [1, "ODD"]] as [number, string][]) {
    evaluate(
      { condition: { indicator: "parity", comparison: "equals", count: 1, barrier: parity }, action: { tradeType: "buy_rise" } },
      `After an ${label} last digit, price tends to RISE`,
      "even_odd_run",
    );
    evaluate(
      { condition: { indicator: "parity", comparison: "equals", count: 1, barrier: parity }, action: { tradeType: "buy_fall" } },
      `After an ${label} last digit, price tends to FALL`,
      "even_odd_run",
    );
  }

  // 1c. Digit streak: 3 same digits in a row, then reversion
  for (let d = 0; d <= 9; d++) {
    evaluate(
      { condition: { indicator: "digit_streak", comparison: "appears_consecutively", count: 3, barrier: d }, action: { tradeType: "buy_fall" } },
      `After digit ${d} appears 3× in a row, price tends to FALL (reversion)`,
      "digit_streak",
    );
  }

  // 2. Even/Odd (EvenOdd): after trigger digit d, next tick digit EVEN / ODD
  for (let d = 0; d <= 9; d++) {
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_even" } },
      `After digit ${d}, next digit tends to be EVEN`,
      "even_odd",
    );
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_odd" } },
      `After digit ${d}, next digit tends to be ODD`,
      "even_odd",
    );
  }

  // 3. Over/Under: after trigger digit d, next digit OVER / UNDER barrier d
  for (let d = 0; d <= 9; d++) {
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_over", barrier: d } },
      `After digit ${d}, next digit tends to be OVER ${d}`,
      "over_under",
    );
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_under", barrier: d } },
      `After digit ${d}, next digit tends to be UNDER ${d}`,
      "over_under",
    );
  }

  // 4. Match/Diff: after trigger d, next digit MATCHES / DIFFERS from d
  for (let d = 0; d <= 9; d++) {
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_digit_match", barrier: d } },
      `After digit ${d}, next digit tends to MATCH ${d}`,
      "match_diff",
    );
    evaluate(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_digit_diff", barrier: d } },
      `After digit ${d}, next digit tends to DIFFER from ${d}`,
      "match_diff",
    );
  }

  // Apply Benjamini-Hochberg FDR correction to control false discovery rate
  const pValues = candidates.map(c => c.pValue);
  const rejected = benjaminiHochbergFDR(pValues, 0.05);

  const found: any[] = [];

  candidates.forEach((c, idx) => {
    if (!rejected[idx]) return;
    
    const inRate = (c.inWins / c.inTotal) * 100;
    const oosRate = (c.oosWins / c.oosTotal) * 100;
    // Require BOTH halves to clear the bar, so the pattern actually holds forward.
    if (!(inRate >= minWin && oosRate >= minWin)) return;
    if (c.oosTotal < oosMin) return;
    
    found.push({
      symbol,
      title: `${c.desc} on ${symbol}`,
      description: `${c.desc} on ${symbol}: in-sample ${inRate.toFixed(1)}% (${c.inTotal} triggers) — out-of-sample ${oosRate.toFixed(1)}% (${c.oosTotal} triggers) over last ${ticks.length} ticks.`,
      rule: c.rule,
      evidence: evidenceTicks,
      patternType: c.pType,
      sampleSize: c.inTotal,
      winRate: inRate.toFixed(2),
      confidence: Math.min(99, Math.round(oosRate * 100)).toFixed(2),
      oos_sample_size: c.oosTotal,
      oos_win_rate: oosRate.toFixed(2),
      oosValidated: true,
      startEpoch: Math.floor(ticks[Math.min(splitIdx, ticks.length - 1)].timestamp / 1000),
      endEpoch: Math.floor(ticks[ticks.length - 1].timestamp / 1000),
      discoveredAt: nowSec,
      expiresAt: nowSec + SIGNAL_TTL_MIN * 60,
      source: "watch",
    });
  });

  return found;
}

// Evaluate a rule between tick index ranges [start, end). Trigger at i settles on i+1.
function patternMatches(rule: any, prices: number[], digits: number[], start: number, end: number, decimals: number): { wins: number; losses: number } {
  const { contractType, barrier } = actionToContractType(rule);
  let wins = 0, losses = 0;
  for (let i = start; i < end - 1; i++) {
    if (!evaluateTrigger(rule.condition, digits, i)) continue;
    const outcome = simulateOutcome(prices[i], prices[i + 1], contractType, barrier, decimals);
    // "draw" (flat rise/fall tick) counts as neither winner nor loser on Deriv.
    if (outcome === "win") wins++;
    else if (outcome === "loss") losses++;
  }
  return { wins, losses };
}

function evaluateTrigger(cond: any, digits: number[], i: number): boolean {
  if (cond.indicator === "last_digit") return digits[i] === cond.barrier;
  if (cond.indicator === "parity") return digits[i] % 2 === cond.barrier;
  if (cond.indicator === "digit_streak") {
    const d = cond.barrier;
    return digits[i] === d && digits[i - 1] === d && digits[i - 2] === d;
  }
  return false;
}

// Run a scan and persist any signals found (only OOS-validated signals survive).
export async function runWatch(opts: ScanOptions): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const found = await scanTicks(opts);
  const saved = [];
  for (const f of found) {
    try {
      const s = await dbSaveSignal({
        userId: opts.userId,
        symbol: f.symbol,
        title: f.title,
        description: f.description,
        rule: f.rule,
        evidence: f.evidence,
        patternType: f.patternType,
        sampleSize: f.sampleSize,
        winRate: f.winRate,
        confidence: f.confidence,
        oosWinRate: Number(f.oos_win_rate),
        oosSampleSize: f.oos_sample_size,
        oosValidated: f.oosValidated ? "true" : "false",
        discoveredAt: f.discoveredAt,
        expiresAt: f.expiresAt,
        startEpoch: f.startEpoch,
        endEpoch: f.endEpoch,
        source: "watch",
      } as any);
      saved.push(s);
      await notifyUser(
        opts.userId,
        "signalDetected",
        "New Signal Detected",
        `A ${f.patternType} pattern was found on ${f.symbol} (${f.winRate}% in-sample, ${f.oos_win_rate}% out-of-sample).`,
        `Symbol: ${f.symbol}\nPattern: ${f.patternType}\nIn-sample: ${f.winRate}%\nOut-of-sample: ${f.oos_win_rate}% (${f.oos_sample_size} samples)\nDescription: ${f.description}`,
      );
    } catch (e) {
      console.error("[signalScanner] save failed", e);
    }
  }
  return saved;
}

let alwaysOnScannerInterval: ReturnType<typeof setInterval> | null = null;

export function startAlwaysOnScanner(): void {
  if (alwaysOnScannerInterval) return;
  const SYMBOLS = getStandardVolatilitySymbols();
  const INTERVAL_MS = 10 * 60 * 1000;
  const tick = async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const allUsers = await db.select().from((await import("../drizzle/schema")).users);
      for (const u of allUsers) {
        for (const sym of SYMBOLS) {
          try {
            await runWatch({ userId: u.id, symbol: sym, sampleSize: 600, minWinRate: 55, patternType: "any" });
          } catch (e) { console.error("[alwaysOnScanner] symbol", sym, e); }
        }
      }
      console.log("[alwaysOnScanner] cycle complete");
    } catch (e) { console.error("[alwaysOnScanner]", e); }
  };
  setTimeout(tick, 60 * 1000); // first run 1 min after boot
  alwaysOnScannerInterval = setInterval(tick, INTERVAL_MS);
}

export function stopAlwaysOnScanner(): void {
  if (alwaysOnScannerInterval) {
    clearInterval(alwaysOnScannerInterval);
    alwaysOnScannerInterval = null;
    console.log("[alwaysOnScanner] stopped");
  }
}
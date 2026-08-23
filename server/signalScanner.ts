/**
 * Signal scanner — orchestrates the v2 engine (signalEngine.ts) and the
 * indicator-confluence engine (indicatorSignal.ts) for real markets.
 *
 * This file is the ONLY place that knows about the database, notifications and
 * the always-on cron. The engines themselves are pure. It keeps the old exported API
 * (runWatch / scanTicks / startAlwaysOnScanner / stopAlwaysOnScanner /
 * nullWinRate) so routers.ts and _core/index.ts keep working unchanged.
 *
 * Only results that survive the engine's correctness filters (strong / watch
 * tiers) are persisted; failed and no_edge results are NOT written — the
 * Market Intelligence page re-derives them on demand via signals.fit query.
 */
import { getDb, saveSignal as dbSaveSignal } from "./db";
import { getTickHistory, getTickHistoryDeep, normalizeSymbol } from "./aitools";
import { notifyUser } from "./_core/notification";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { getAllSymbols, isSyntheticIndexSymbol } from "@shared/symbols";
import { and, eq, gt } from "drizzle-orm";
import { signals } from "../drizzle/schema";
import { isMarketOpen } from "./tickCollector";
import {
  runAnalysis,
  PatternResult,
  PatternFamily,
  ContractSupport,
} from "./signalEngine";
import { scanSignalForSymbol, GuidingSignalCandidate } from "./indicatorSignal";
import { wilsonInterval, binomialPvsBaseline, benjaminiHochbergFDR, walkForwardSummary, WALK_FORWARD_WINDOWS, MIN_OOS_SAMPLES, MIN_WINDOW_SAMPLES, assignTier, type SignalTier, type WalkForwardResult } from "./signalStats";
import { buildCandles, medianTickGapSec, type TickLike } from "@shared/indicators";

// Pattern categories remain from the v1 API so routers/agents keep compiling.
export type PatternType =
  | "digit_frequency"
  | "parity_transition"
  | "high_low_transition"
  | "over_under_transition"
  | "repeat_change"
  | "streak_followon"
  | "alternation_break"
  | "digit_transition"
  | "hl_alternation"
  | "repeat_change_alternation"
  | "repeat_change_state";
export type PatternCat = "any" | PatternType;

export interface ScanOptions {
  userId: number;
  symbol: string;
  sampleSize?: number;
  minWinRate?: number;
  patternType?: string;
}

/** Convenience for callers that only know contractType + barrier (v1 compat). */
export function nullWinRate(contractType: string, barrier: number | undefined): number {
  switch (contractType) {
    case "DIGITMATCH": return 10;
    case "DIGITDIFF": return 90;
    case "DIGITOVER": {
      const d = Math.min(9, Math.max(0, barrier ?? 5));
      return ((9 - d) / 10) * 100;
    }
    case "DIGITUNDER": {
      const d = Math.min(9, Math.max(0, barrier ?? 5));
      return (d / 10) * 100;
    }
    case "DIGITEVEN":
    case "DIGITODD":
    case "CALL":
    case "PUT":
    default:
      return 50;
  }
}

// ---------------- live analysis (no DB writes) ---------------

/**
 * Run the digit-pattern engine over the symbol's most recent tick window.
 * Only valid for synthetic indices (R_*, 1HZ*, BOOM*, CRASH*).
 */
async function scanDigitPatterns(opts: ScanOptions): Promise<PatternResult[]> {
  const symbol = normalizeSymbol(opts.symbol);
  const decimals = getDecimalPlaces(symbol);
  const sample = Math.min(4000, Math.max(120, opts.sampleSize || 1000));
  const ticks = await getTickHistory(symbol, sample); // [{price, timestamp(ms)}] old->new
  if (ticks.length < 40) return [];

  const digits = ticks.map((t) => lastDigitOf(Number(t.price), decimals));
  const epochs = ticks.map((t) => Math.floor(Number(t.timestamp) / 1000));
  return runAnalysis({ digits, epochs, ctx: { symbol, nowSec: Math.floor(Date.now() / 1000) } });
}

/**
 * Run the indicator-confluence engine for real markets (forex/crypto/stocks).
 * Returns a GuidingSignalCandidate if the engine detects a directional read,
 * null otherwise. Also runs a backtest to validate the signal historically.
 */
export async function scanIndicatorTicks(opts: ScanOptions): Promise<GuidingSignalCandidate | null> {
  const symbol = normalizeSymbol(opts.symbol);
  const ticks = await getTickHistoryDeep(symbol, 2000);
  if (ticks.length < 30) return null;
  const tickLikes = ticks.map((t) => ({ price: Number(t.price), epoch: Math.floor(Number(t.timestamp) / 1000) }));
  const { signal } = scanSignalForSymbol(symbol, tickLikes);
  if (!signal) return null;

  // Run backtest to validate the signal historically
  const backtest = backtestIndicatorSignal(symbol, tickLikes, signal.direction, signal.windowTicks);
  if (backtest) {
    // If the backtest says the signal is no_edge or failed, don't emit it
    if (backtest.tier === "no_edge" || backtest.tier === "failed") return null;
    // Attach backtest-derived confidence and validation data
    signal.confidence = backtest.confidence;
    signal.backtest = {
      confidence: backtest.confidence,
      tier: backtest.tier,
      baseline: backtest.baseline,
      observed: backtest.observed,
      edgePp: backtest.edgePp,
      ciLow: backtest.ciLow,
      ciHigh: backtest.ciHigh,
      pValue: backtest.pValue,
      fdrAdjusted: backtest.fdrAdjusted,
      inSampleSize: backtest.inSampleSize,
      oosAvg: backtest.oosAvg,
      oosTotal: backtest.oosTotal,
      oosInsufficient: backtest.oosInsufficient,
      walks: backtest.walks,
    };
  }

  return signal;
}

// ---------------- indicator backtest (validation layer) ---------------

export interface IndicatorBacktestResult {
  symbol: string;
  direction: "up" | "down";
  confidence: number;
  tier: SignalTier;
  baseline: number;
  observed: number;
  edgePp: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  fdrAdjusted: boolean;
  inSampleSize: number;
  walks: { wins: number; n: number; rate: number }[];
  oosAvg: number;
  holds: number;
  oosTotal: number;
  oosInsufficient: boolean;
  windowTicks: number;
}

/**
 * Backtest an indicator-confluence signal over historical ticks.
 *
 * Defines a concrete outcome: "CALL wins if price is higher after N candles",
 * "PUT wins if price is lower after N candles". Slides the indicator engine
 * over the tick history in windows, counts wins/losses, then applies the same
 * Wilson CI + BH-FDR + walk-forward discipline as the digit-pattern engine.
 *
 * This is the validation layer that makes indicator signals honest — without
 * it, scoreConfluence() is a heuristic with no historical hit-rate evidence.
 */
export function backtestIndicatorSignal(
  symbol: string,
  rawTicks: TickLike[],
  direction: "up" | "down",
  windowTicks: number,
): IndicatorBacktestResult | null {
  if (rawTicks.length < 100) return null;

  const ticks = rawTicks.slice().sort((a, b) => a.epoch - b.epoch);
  const gapSec = medianTickGapSec(ticks) ?? 1;
  const timeframeSec = symbol.startsWith("1HZ") ? 60 : gapSec <= 1 ? 60 : gapSec <= 2 ? 120 : 300;
  const candles = buildCandles(ticks, timeframeSec);
  if (candles.length < 30) return null;

  const closes = candles.map((c) => c.close);

  // Slide the indicator engine over the candles and record signal + outcome
  const MIN_CANDLES = 22; // warmup for EMA(21)
  const STEP = 1; // slide by 1 candle
  const outcomes: { signal: boolean; win: boolean }[] = [];

  for (let i = MIN_CANDLES; i < candles.length - windowTicks; i += STEP) {
    const window = candles.slice(i - MIN_CANDLES, i + 1);
    const windowCloses = window.map((c) => c.close);

    // Check if the indicator would have signaled at this point
    const { signal } = scanSignalForSymbol(symbol, window.map((c) => ({ price: c.close, epoch: c.time })));
    if (!signal || signal.direction !== direction) {
      outcomes.push({ signal: false, win: false });
      continue;
    }

    // Outcome: did price move in the predicted direction after N candles?
    const entryPrice = candles[i].close;
    const exitPrice = candles[Math.min(i + windowTicks, candles.length - 1)].close;
    const win = direction === "up" ? exitPrice > entryPrice : exitPrice < entryPrice;
    outcomes.push({ signal: true, win });
  }

  // Count only the signals that fired
  const signals = outcomes.filter((o) => o.signal);
  if (signals.length < 20) return null;

  const wins = signals.filter((o) => o.win).length;
  const total = signals.length;
  const observed = wins / total;
  const baseline = 0.5; // random direction is 50%

  // Wilson CI
  const ci = wilsonInterval(wins, total);

  // Binomial p-value vs baseline
  const pValue = binomialPvsBaseline(wins, total, baseline);

  // Walk-forward: split into 5 sequential windows
  const wfLen = Math.max(1, Math.floor(signals.length / WALK_FORWARD_WINDOWS));
  const walks: { wins: number; n: number; rate: number }[] = [];
  for (let w = 0; w < WALK_FORWARD_WINDOWS; w++) {
    const s = w * wfLen;
    const e = Math.min(signals.length, s + wfLen);
    if (e <= s) continue;
    const wSlice = signals.slice(s, e);
    const wWins = wSlice.filter((o) => o.win).length;
    walks.push({ wins: wWins, n: wSlice.length, rate: wSlice.length > 0 ? wWins / wSlice.length : 0 });
  }

  const eff = walkForwardSummary(walks, baseline);

  // BH-FDR (single test, but still apply for consistency)
  const rejected = benjaminiHochbergFDR([pValue], 0.05);

  const edgePp = Math.round((observed - baseline) * 1000) / 10;
  const significant = rejected[0] && ci.low > baseline && Math.abs(edgePp) >= 3;

  const tier = assignTier(significant, ci.low > baseline, edgePp, eff.oosTotal, eff);

  return {
    symbol,
    direction,
    confidence: Math.round(observed * 100),
    tier,
    baseline,
    observed,
    edgePp,
    ciLow: ci.low,
    ciHigh: ci.high,
    pValue,
    fdrAdjusted: rejected[0],
    inSampleSize: total,
    walks,
    oosAvg: eff.avgRate,
    holds: eff.holdCount,
    oosTotal: eff.oosTotal,
    oosInsufficient: eff.oosTotal < MIN_OOS_SAMPLES || eff.settledCount === 0,
    windowTicks,
  };
}

/**
 * Run the appropriate engine for a symbol: digit-pattern for synthetic indices,
 * indicator-confluence for real markets. Returns digit results for synthetic,
 * empty array for real markets (indicator results are handled separately by
 * scanIndicatorTicks).
 */
export async function scanTicks(opts: ScanOptions): Promise<PatternResult[]> {
  const symbol = normalizeSymbol(opts.symbol);

  // Digit-pattern analysis is only statistically valid on synthetic indices.
  // Real markets use the indicator engine (scanIndicatorTicks) instead.
  if (!isSyntheticIndexSymbol(symbol)) {
    return [];
  }

  return scanDigitPatterns(opts);
}

// ---------------- persistence + notification ---------------

function ruleFromContract(c: ContractSupport): Record<string, any> {
  // Reuse the strategy representation used everywhere else so a signal can be
  // backtested / deployed without conversion. onTick grammar: digit-contracts.
  const parts: Record<string, any> = {
    action: {},
    condition: {},
  };
  switch (c.contract) {
    case "DIGITMATCH":
      parts.action.tradeType = "buy_digit_match";
      parts.action.barrier = c.digit;
      parts.condition = { indicator: "last_digit", comparison: "equals", barrier: c.digit, count: 1 };
      break;
    case "DIGITDIFF":
      parts.action.tradeType = "buy_digit_diff";
      parts.action.barrier = c.digit;
      parts.condition = { indicator: "last_digit", comparison: "not_equals", barrier: c.digit, count: 1 };
      break;
    case "DIGITEVEN":
      parts.action.tradeType = "buy_even";
      parts.condition = { indicator: "last_digit", parity: "even", count: 1 };
      break;
    case "DIGITODD":
      parts.action.tradeType = "buy_odd";
      parts.condition = { indicator: "last_digit", parity: "odd", count: 1 };
      break;
    case "DIGITOVER":
      parts.action.tradeType = "buy_over";
      parts.action.barrier = c.barrier;
      parts.condition = { indicator: "last_digit", comparison: "greater_than", barrier: c.barrier, count: 1 };
      break;
    case "DIGITUNDER":
      parts.action.tradeType = "buy_under";
      parts.action.barrier = c.barrier;
      parts.condition = { indicator: "last_digit", comparison: "less_than", barrier: c.barrier, count: 1 };
      break;
    case "DIGITREPEAT": // no direct Deriv contract — diagnostics only
    case "DIGITCHANGE":
      return { signalVersion: 2, family: null, patternTypePinned: null, analysisOnly: true, ...c };
  }
  return { signalVersion: 2, family: null, patternTypePinned: null, ...parts };
}

/**
 * Watch a market: run the engine, persist only strong/watch results and
 * notify the user. Returns the list of persisted signals.
 */
export async function runWatch(opts: ScanOptions): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await scanTicks(opts);
  const saved: any[] = [];

  for (const r of results) {
    if (r.tier !== "strong" && r.tier !== "watch") continue; // §3: only tiers that beat baseline with CI + WF
    if (r.supports.contract === "DIGITREPEAT" || r.supports.contract === "DIGITCHANGE") continue; // analysis-only, no Deriv contract
    if (r.oosInsufficient) continue; // do not persist a verdict on insufficient forward data
    const symbol = normalizeSymbol(opts.symbol);
    const edgeText = `${r.edgePp > 0 ? "+" : ""}${r.edgePp} pp`;
    const wfText = `${r.holds}/${r.walks.length} OOS windows held (avg ${(r.oosAvg * 100).toFixed(1)}%)`;
    const title = `${symbol} · ${r.supportsLabel}`;
    const description =
      `${r.describe} Baseline ${(r.baseline * 100).toFixed(1)}%, observed ${(r.observed * 100).toFixed(1)}% (edge ${edgeText}). ` +
      `${wfText}. ${r.fdrAdjusted ? "FDR-adjusted p=" + r.pValue.toFixed(4) : "Not FDR-significant."} Verified ${new Date(r.discoveredAt * 1000).toUTCString()}.`;

    // Dedup: this function is also the always-on scanner's per-symbol worker.
    // If an identical condition (same symbol + rule/supportsLabel) is already
    // persisted and unexpired, skip the re-insert + re-notify so a repeating
    // cron doesn't spam duplicate rows and notifications every cycle.
    try {
      const existing = await db
        .select({ id: signals.id })
        .from(signals)
        .where(
          and(
            eq(signals.userId, opts.userId),
            eq(signals.symbol, symbol),
            eq(signals.title, title),
            gt(signals.expiresAt, Math.floor(Date.now() / 1000)),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    } catch (e) {
      // dedup is best-effort (e.g. schema drift) — never block the scan on it
      console.error("[signalScanner] dedup check failed", e);
    }

    try {
      const s = await dbSaveSignal({
        userId: opts.userId,
        symbol,
        title,
        description,
        rule: ruleFromContract(r.supports),
        evidence: [], // engine result is available via pattern analysis endpoint
        patternType: r.family,
        sampleSize: r.inSampleSize,
        winRate: (r.observed * 100).toFixed(2),
        confidence: Math.min(99, +(r.observed * 100).toFixed(2)),
        baselineWinRate: (r.baseline * 100).toFixed(2),
        oosWinRate: (r.oosAvg * 100).toFixed(2),
        oosSampleSize: r.walks.reduce((sum, w) => sum + w.n, 0),
        oosValidated: "true",
        discoveredAt: r.discoveredAt,
        startEpoch: r.window.startEpoch,
        endEpoch: r.window.endEpoch,
        expiresAt: r.expiresAt,
        source: "watch",
      } as any);
      saved.push(s);
      await notifyUser(
        opts.userId,
        "signalDetected",
        "Condition Detected",
        `A ${r.supportsLabel} condition was verified on ${symbol}: ${description}`,
        `Contract: ${r.supportsLabel}\nTier: ${r.tier}\nBaseline: ${(r.baseline * 100).toFixed(1)}%\nObserved: ${(r.observed * 100).toFixed(1)}%\nEdge: ${edgeText}\nWalk-forward: ${wfText}`,
      );
    } catch (e) {
      console.error("[signalScanner] save failed", e);
    }
  }
  return saved;
}

export interface WatchAllResult {
  symbols: string[];
  saved: any[];
  perSymbol: { symbol: string; found: number }[];
  errors: string[];
}

/**
 * Watch EVERY symbol the app knows about (volatility, 1s indices, boom/crash)
 * in one sweep. The engine evaluates the full fixed pattern library per symbol
 * — every Deriv digit contract type (Matches/Differs, Even/Odd, Over/Under,
 * Repeat/Change diagnostics) — so one run explores all markets and all
 * contract types. One failing market must not abort the rest.
 */
export async function runWatchAll(opts: Omit<ScanOptions, "symbol">): Promise<WatchAllResult> {
  const symbols = getAllSymbols();
  const saved: any[] = [];
  const perSymbol: { symbol: string; found: number }[] = [];
  const errors: string[] = [];
  for (const sym of symbols) {
    try {
      const res = await runWatch({ ...opts, symbol: sym });
      saved.push(...res);
      perSymbol.push({ symbol: sym, found: res.length });
    } catch (e) {
      errors.push(sym);
      console.error("[signalScanner] runWatchAll", sym, e);
    }
  }
  return { symbols, saved, perSymbol, errors };
}

// ---------------- always-on scanner (cron) ---------------

/**
 * Persist pre-scanned results for a specific user. Used by the always-on
 * scanner to avoid re-scanning the same symbol N times for N users.
 */
async function persistResultsForUser(results: PatternResult[], symbol: string, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let saved = 0;
  for (const r of results) {
    if (r.tier !== "strong" && r.tier !== "watch") continue;
    if (r.supports.contract === "DIGITREPEAT" || r.supports.contract === "DIGITCHANGE") continue;
    if (r.oosInsufficient) continue;
    const edgeText = `${r.edgePp > 0 ? "+" : ""}${r.edgePp} pp`;
    const wfText = `${r.holds}/${r.walks.length} OOS windows held (avg ${(r.oosAvg * 100).toFixed(1)}%)`;
    const title = `${symbol} · ${r.supportsLabel}`;
    const description =
      `${r.describe} Baseline ${(r.baseline * 100).toFixed(1)}%, observed ${(r.observed * 100).toFixed(1)}% (edge ${edgeText}). ` +
      `${wfText}. ${r.fdrAdjusted ? "FDR-adjusted p=" + r.pValue.toFixed(4) : "Not FDR-significant."} Verified ${new Date(r.discoveredAt * 1000).toUTCString()}.`;

    try {
      const existing = await db
        .select({ id: signals.id })
        .from(signals)
        .where(
          and(
            eq(signals.userId, userId),
            eq(signals.symbol, symbol),
            eq(signals.title, title),
            gt(signals.expiresAt, Math.floor(Date.now() / 1000)),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    } catch (e) {
      console.error("[signalScanner] dedup check failed", e);
    }

    try {
      await dbSaveSignal({
        userId,
        symbol,
        title,
        description,
        rule: ruleFromContract(r.supports),
        evidence: [],
        patternType: r.family,
        sampleSize: r.inSampleSize,
        winRate: (r.observed * 100).toFixed(2),
        confidence: Math.min(99, +(r.observed * 100).toFixed(2)),
        baselineWinRate: (r.baseline * 100).toFixed(2),
        oosWinRate: (r.oosAvg * 100).toFixed(2),
        oosSampleSize: r.walks.reduce((sum, w) => sum + w.n, 0),
        oosValidated: "true",
        discoveredAt: r.discoveredAt,
        startEpoch: r.window.startEpoch,
        endEpoch: r.window.endEpoch,
        expiresAt: r.expiresAt,
        source: "watch",
      } as any);
      saved++;
      await notifyUser(
        userId,
        "signalDetected",
        "Condition Detected",
        `A ${r.supportsLabel} condition was verified on ${symbol}: ${description}`,
        `Contract: ${r.supportsLabel}\nTier: ${r.tier}\nBaseline: ${(r.baseline * 100).toFixed(1)}%\nObserved: ${(r.observed * 100).toFixed(1)}%\nEdge: ${edgeText}\nWalk-forward: ${wfText}`,
      );
    } catch (e) {
      console.error("[signalScanner] save failed", e);
    }
  }
  return saved;
}

/**
 * Persist an indicator-confluence signal (forex/crypto/stocks) for a user.
 * These signals come from indicatorSignal.ts, not the digit-pattern engine.
 * Only STRONG and MEDIUM signals are persisted — WEAK is too thin to act on.
 */
export async function persistIndicatorSignal(signal: GuidingSignalCandidate, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  if (signal.strength === "WEAK") return false;

  const symbol = signal.symbol;
  const bt = signal.backtest;
  const title = `${symbol} · ${signal.direction === "up" ? "Bullish" : "Bearish"} ${signal.votes.agreement}/${signal.votes.total} confluence`;
  const edgeText = bt ? `edge ${bt.edgePp}pp` : `confidence ${signal.confidence}%`;
  const regimeText = signal.regime ? ` · Regime: ${signal.regime.regime} (${signal.regime.aligned ? "aligned" : "misaligned"})` : "";
  const btText = bt ? ` · Backtest: ${(bt.observed * 100).toFixed(1)}% over ${(bt.baseline * 100).toFixed(1)}% baseline (${bt.oosTotal} OOS samples)` : "";
  const description =
    `${signal.plain.what}. ${signal.plain.why}. ` +
    `${signal.plain.strength}. Risk: ${signal.plain.risk}. ` +
    `${signal.votes.up}/${signal.votes.total} indicators agree · ${edgeText}${regimeText}${btText}`;

  // Dedup: skip if an identical signal already exists and is unexpired
  try {
    const existing = await db
      .select({ id: signals.id })
      .from(signals)
      .where(
        and(
          eq(signals.userId, userId),
          eq(signals.symbol, symbol),
          eq(signals.title, title),
          gt(signals.expiresAt, Math.floor(Date.now() / 1000)),
        ),
      )
      .limit(1);
    if (existing.length > 0) return false;
  } catch (e) {
    console.error("[signalScanner] indicator dedup check failed", e);
  }

  // Expires when the signal window resolves (entryEpoch + windowTicks)
  const expiresAt = signal.entryEpoch + signal.windowTicks * 2;

  try {
    await dbSaveSignal({
      userId,
      symbol,
      title,
      description,
      rule: {
        action: { tradeType: signal.contractType === "CALL" ? "buy_rise" : "buy_fall" },
        condition: { indicator: "momentum_confluence", comparison: signal.direction, count: 1 },
      },
      evidence: signal.reasons,
      patternType: "momentum_confluence",
      sampleSize: bt ? bt.inSampleSize : 0,
      winRate: bt ? (bt.observed * 100).toFixed(2) : signal.confidence.toFixed(2),
      confidence: signal.confidence,
      baselineWinRate: bt ? (bt.baseline * 100).toFixed(2) : "50.00",
      oosWinRate: bt ? (bt.oosAvg * 100).toFixed(2) : signal.confidence.toFixed(2),
      oosSampleSize: bt ? bt.oosTotal : 0,
      oosValidated: bt && !bt.oosInsufficient && bt.ciLow > bt.baseline ? "true" : "false",
      discoveredAt: Math.floor(Date.now() / 1000),
      startEpoch: signal.entryEpoch,
      endEpoch: expiresAt,
      expiresAt,
      source: "indicator",
    } as any);
    await notifyUser(
      userId,
      "signalDetected",
      "Indicator Signal",
      `A ${signal.plain.scoreLabel} signal was detected on ${symbol}: ${description}`,
      `Direction: ${signal.direction.toUpperCase()} · Confidence: ${signal.confidence}% · Strength: ${signal.strength}\n${signal.plain.what}\n${signal.plain.why}\nRisk: ${signal.plain.risk}${bt ? `\nBacktest: ${(bt.observed * 100).toFixed(1)}% win rate, OOS avg ${(bt.oosAvg * 100).toFixed(1)}%` : ""}`,
    );
    return true;
  } catch (e) {
    console.error("[signalScanner] indicator save failed", e);
    return false;
  }
}

let alwaysOnScannerInterval: ReturnType<typeof setInterval> | null = null;

export interface AlwaysOnStatus {
  enabled: boolean;
  inProgress: boolean;
  startedAt: number | null;
  lastScanAt: number | null;
  nextScanAt: number | null;
  intervalMs: number;
  symbols: string[];
  activeSymbol: string | null;
  lastCycle: { startedAt: number; durationMs: number; scans: number } | null;
}

const status: AlwaysOnStatus = {
  enabled: false,
  inProgress: false,
  startedAt: null,
  lastScanAt: null,
  nextScanAt: null,
  intervalMs: 0,
  symbols: [],
  activeSymbol: null,
  lastCycle: null,
};

/** Snapshot of the always-on scanner so the UI can report "watching since/last/next". */
export function getWatchStatus(): AlwaysOnStatus {
  return {
    ...status,
    symbols: [...status.symbols],
    lastCycle: status.lastCycle ? { ...status.lastCycle } : null,
  };
}

export function startAlwaysOnScanner(): void {
  if (alwaysOnScannerInterval) return;
  // Sweep every symbol the app tracks (volatility + 1s + boom/crash) — a true
  // intelligence layer keeps exploring all markets on its own schedule.
  const SYMBOLS = getAllSymbols();
  const INTERVAL_MS = 3 * 60 * 1000; // 3 min — the Signals page is a live watch, not a nightly report
  status.enabled = true;
  status.startedAt = Date.now();
  status.intervalMs = INTERVAL_MS;
  status.symbols = SYMBOLS;

  const tick = async () => {
    if (status.inProgress) return; // never overlap cycles
    status.inProgress = true;
    status.activeSymbol = null;
    const cycleStart = Date.now();
    let scans = 0;
    try {
      const db = await getDb();
      if (db) {
        const allUsers = await db.select().from((await import("../drizzle/schema")).users);
        // O(symbols × users) not O(users × symbols): scan each symbol once,
        // then persist results for each user. The scan (runAnalysis) is pure
        // and doesn't depend on userId — only the dedup/save/notify needs it.
        for (const sym of SYMBOLS) {
          // Skip closed markets — expected silence, not a failure.
          if (!isMarketOpen(sym)) continue;
          status.activeSymbol = sym;

          if (isSyntheticIndexSymbol(sym)) {
            // Synthetic indices: digit-pattern analysis
            let results: PatternResult[] = [];
            try {
              results = await scanTicks({ userId: 0, symbol: sym, sampleSize: 1000 });
            } catch (e: any) {
              // "Invalid symbol" is expected for symbols Deriv doesn't serve via tick history
              const msg = String(e?.message || e);
              if (msg.includes("Invalid symbol")) {
                console.warn("[alwaysOnScanner] skip (no tick data)", sym);
              } else {
                console.error("[alwaysOnScanner] scan failed", sym, e);
              }
              continue;
            }

            for (const u of allUsers) {
              try {
                const saved = await persistResultsForUser(results, sym, u.id);
                scans += saved;
              } catch (e) { console.error("[alwaysOnScanner] persist", sym, u.id, e); }
            }
          } else {
            // Real markets (forex/crypto/stocks): indicator-confluence analysis
            let signal: GuidingSignalCandidate | null = null;
            try {
              signal = await scanIndicatorTicks({ userId: 0, symbol: sym });
            } catch (e: any) {
              const msg = String(e?.message || e);
              if (msg.includes("Invalid symbol")) {
                console.warn("[alwaysOnScanner] skip (no tick data)", sym);
              } else {
                console.error("[alwaysOnScanner] indicator scan failed", sym, e);
              }
              continue;
            }

            if (signal && signal.strength !== "WEAK") {
              for (const u of allUsers) {
                try {
                  const saved = await persistIndicatorSignal(signal, u.id);
                  if (saved) scans++;
                } catch (e) { console.error("[alwaysOnScanner] indicator persist", sym, u.id, e); }
              }
            }
          }
        }
      }
      status.lastCycle = { startedAt: cycleStart, durationMs: Date.now() - cycleStart, scans };
      status.lastScanAt = Date.now();
      status.nextScanAt = Date.now() + INTERVAL_MS;
      console.log(`[alwaysOnScanner] cycle complete (${scans} scans, ${(status.lastCycle.durationMs / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.error("[alwaysOnScanner]", e);
    } finally {
      status.activeSymbol = null;
      status.inProgress = false;
    }
  };
  setTimeout(tick, 15 * 1000); // first run shortly after boot
  alwaysOnScannerInterval = setInterval(tick, INTERVAL_MS);
}

export function stopAlwaysOnScanner(): void {
  if (alwaysOnScannerInterval) {
    clearInterval(alwaysOnScannerInterval);
    alwaysOnScannerInterval = null;
    status.enabled = false;
    status.inProgress = false;
    status.activeSymbol = null;
    console.log("[alwaysOnScanner] stopped");
  }
}
/**
 * Signal scanner — orchestrates the v2 engine (signalEngine.ts).
 *
 * This file is the ONLY place that knows about the database, notifications and
 * the always-on cron. The engine itself is pure. It keeps the old exported API
 * (runWatch / scanTicks / startAlwaysOnScanner / stopAlwaysOnScanner /
 * nullWinRate) so routers.ts and _core/index.ts keep working unchanged.
 *
 * Only results that survive the engine's correctness filters (strong / watch
 * tiers) are persisted; failed and no_edge results are NOT written — the
 * Market Intelligence page re-derives them on demand via signals.fit query.
 */
import { getDb, saveSignal as dbSaveSignal } from "./db";
import { getTickHistory, normalizeSymbol } from "./aitools";
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
 * Run the engine over the symbol's most recent tick window and return the
 * full PatternResult list (all tiers). Used by interactions.listFitSignals →
 * /live and by the Market Intelligence page when the user wants current,
 * not stale, tradeable conditions.
 */
export async function scanTicks(opts: ScanOptions): Promise<PatternResult[]> {
  const symbol = normalizeSymbol(opts.symbol);

  // Digit-pattern analysis (Matches/Differs/Over/Under/Even/Odd) is only statistically
  // valid on Deriv's synthetic/jump indices, whose last digit is engineered to be
  // uniform-random. Real forex/commodities/crypto/stock-index prices have no such
  // property — running this test against them produces spurious, extreme-looking
  // "edges" that are statistical artifacts, not real signals. Do not remove this guard
  // without replacing what it's protecting against — see the companion design doc.
  if (!isSyntheticIndexSymbol(symbol)) {
    return [];
  }

  const decimals = getDecimalPlaces(symbol);
  const sample = Math.min(4000, Math.max(120, opts.sampleSize || 1000));
  const ticks = await getTickHistory(symbol, sample); // [{price, timestamp(ms)}] old->new
  if (ticks.length < 40) return [];

  const digits = ticks.map((t) => lastDigitOf(Number(t.price), decimals));
  const epochs = ticks.map((t) => Math.floor(Number(t.timestamp) / 1000));
  return runAnalysis({ digits, epochs, ctx: { symbol, nowSec: Math.floor(Date.now() / 1000) } });
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
          let results: PatternResult[] = [];
          try {
            results = await scanTicks({ userId: 0, symbol: sym, sampleSize: 1000 });
          } catch (e) { console.error("[alwaysOnScanner] scan failed", sym, e); continue; }

          for (const u of allUsers) {
            try {
              // runWatchWithResults: persist pre-scanned results for this user
              const saved = await persistResultsForUser(results, sym, u.id);
              scans += saved;
            } catch (e) { console.error("[alwaysOnScanner] persist", sym, u.id, e); }
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
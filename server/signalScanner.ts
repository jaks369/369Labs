import { getDb, saveSignal as dbSaveSignal } from "./db";
import { getTickHistory, normalizeSymbol } from "./aitools";
import { notifyUser } from "./_core/notification";

// Signals decay: digit patterns on volatile symbols lose edge quickly.
// A signal is considered valid for this many minutes after discovery.
export const SIGNAL_TTL_MIN = 60;

// Pattern types the scanner knows how to detect over a tick window.
export type PatternType = "digit_streak" | "digit_bias" | "even_odd_run" | "momentum_after_digit";

interface ScanOptions {
  userId: number;
  symbol: string;
  sampleSize?: number;     // number of ticks to analyze
  minWinRate?: number;     // 0..100 threshold to record a signal
  patternType?: PatternType | "any";
}

function lastDigitOf(price: number): number {
  const s = String(price).replace(".", "");
  return parseInt(s[s.length - 1], 10);
}

// Analyze a window of {price, epoch} ticks and emit candidate signals.
export async function scanTicks(opts: ScanOptions): Promise<any[]> {
  const symbol = normalizeSymbol(opts.symbol);
  const sample = opts.sampleSize || 300;
  const minWin = opts.minWinRate ?? 62;
  const ticks = await getTickHistory(symbol, sample); // [{price, timestamp(ms)}]
  if (ticks.length < 30) return [];

  const digits = ticks.map(t => lastDigitOf(Number(t.price)));
  const prices = ticks.map(t => Number(t.price));
  const found: any[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  const testRule = (rule: any, desc: string, pType: PatternType, evidericeTicks: any[]) => {
    // Simulate the rule against the window: count how often entry -> next tick outcome matches action.
    let wins = 0, total = 0;
    for (let i = 0; i < ticks.length - 1; i++) {
      const triggered = evaluateTrigger(rule.condition, digits, i);
      if (!triggered) continue;
      total++;
      const entry = prices[i];
      const next = prices[i + 1];
      const outcome = simulateOutcome(entry, next, rule.action.tradeType);
      if (outcome === "win") wins++;
    }
    if (total >= 20 && (wins / total) * 100 >= minWin) {
      found.push({
        symbol,
        title: `${desc} on ${symbol}`,
        description: `${desc} on ${symbol}: triggered ${total} times, won ${wins} (${((wins/total)*100).toFixed(1)}% win rate over last ${ticks.length} ticks).`,
        rule,
        evidence: evidericeTicks.slice(0, 60),
        patternType: pType,
        sampleSize: total,
        winRate: ((wins / total) * 100).toFixed(2),
        confidence: Math.min(99, Math.round((wins / total) * 100 + Math.min(total, 100) * 0.1)).toFixed(2),
        startEpoch: Math.floor((ticks[0].timestamp) / 1000),
        endEpoch: Math.floor((ticks[ticks.length - 1].timestamp) / 1000),
        discoveredAt: nowSec,
        expiresAt: nowSec + SIGNAL_TTL_MIN * 60,
        source: "watch",
      });
    }
  };

  const evidenceTicks = ticks.slice(-60).map(t => ({ epoch: Math.floor(t.timestamp / 1000), price: Number(t.price), lastDigit: lastDigitOf(Number(t.price)) }));

  // 1. Digit bias: a specific digit appears, next tick rises/falls
  for (let d = 0; d <= 9; d++) {
    testRule(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_rise" } },
      `After digit ${d}, price tends to RISE`,
      "digit_bias",
      evidenceTicks
    );
    testRule(
      { condition: { indicator: "last_digit", comparison: "equals", count: 1, barrier: d }, action: { tradeType: "buy_fall" } },
      `After digit ${d}, price tends to FALL`,
      "digit_bias",
      evidenceTicks
    );
  }

  // 2. Even/Odd run: after an even digit, next tick direction
  testRule(
    { condition: { indicator: "parity", comparison: "equals", count: 1, barrier: 0 }, action: { tradeType: "buy_rise" } },
    `After an EVEN last digit, price tends to RISE`,
    "even_odd_run",
    evidenceTicks
  );
  testRule(
    { condition: { indicator: "parity", comparison: "equals", count: 1, barrier: 0 }, action: { tradeType: "buy_fall" } },
    `After an EVEN last digit, price tends to FALL`,
    "even_odd_run",
    evidenceTicks
  );

  // 3. Digit streak: 3 same digits in a row, then revert
  for (let d = 0; d <= 9; d++) {
    testRule(
      { condition: { indicator: "digit_streak", comparison: "appears_consecutively", count: 3, barrier: d }, action: { tradeType: "buy_fall" } },
      `After digit ${d} appears 3× in a row, price tends to FALL (reversion)`,
      "digit_streak",
      evidenceTicks
    );
  }

  return found;
}

function evaluateTrigger(cond: any, digits: number[], i: number): boolean {
  if (cond.indicator === "last_digit") return digits[i] === cond.barrier;
  if (cond.indicator === "parity") return (digits[i] % 2) === cond.barrier;
  if (cond.indicator === "digit_streak") {
    const d = cond.barrier;
    return digits[i] === d && digits[i-1] === d && digits[i-2] === d;
  }
  return false;
}

function simulateOutcome(entry: number, next: number, tradeType: string): "win" | "loss" {
  const up = next > entry;
  if (tradeType === "buy_rise") return up ? "win" : "loss";
  if (tradeType === "buy_fall") return !up ? "win" : "loss";
  return "loss";
}

// Run a scan and persist any signals found.
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
        discoveredAt: f.discoveredAt,
        expiresAt: f.expiresAt,
        startEpoch: f.startEpoch,
        endEpoch: f.endEpoch,
        source: "watch",
      } as any);
      saved.push(s);
      await notifyUser(opts.userId, "tradeExecuted", "New Signal Detected", `A ${f.patternType} pattern was found on ${f.symbol} with ${f.winRate}% win rate.`, `Symbol: ${f.symbol}\nPattern: ${f.patternType}\nWin Rate: ${f.winRate}%\nConfidence: ${f.confidence}%\nDescription: ${f.description}`);
    } catch (e) { console.error("[signalScanner] save failed", e); }
  }
  return saved;
}
/**
 * Deterministic indicator-confluence signal engine for the AI concierge.
 *
 * Pure module (no DB / network). `scanSignalForSymbol` turns a tick stream
 * into an optional GuidingSignalCandidate — the "active, guiding" layer that
 * the passive digit-pattern engine (signalEngine.ts) does not produce: a
 * plain up/down read with confidence, strength and human reasoning.
 *
 * Honesty constraints (mirroring the repo's design doctrine):
 *  - signals are OBSERVED technicals, never a forecast;
 *  - if there is not enough data to compute an indicator it is treated as a
 *    missing vote (no fabricated agreement);
 *  - WEAK / no-agreement states are returned truthfully so the UI can render a
 *    "nothing to do" state instead of inventing trades.
 */

import { scoreConfluence, explainConfluence, ema, rsi, macd, buildCandles, medianTickGapSec, TickLike, Candle, IndicatorDetail } from "@shared/indicators";

export type GuideStrength = "STRONG" | "MEDIUM" | "WEAK";
export type GuideDirection = "up" | "down";

export interface GuidingSignalCandidate {
  symbol: string;
  family: "momentum_confluence";
  direction: GuideDirection;
  contractType: "CALL" | "PUT";
  confidence: number;
  strength: GuideStrength;
  reasons: string[];
  entryPrice: number;
  entryEpoch: number;
  windowTicks: number;
  /** Vote tally behind `confidence` — e.g. 3/3 indicators agree → 78. */
  votes: { up: number; down: number; total: number; agreement: number };
  /** Plain-English four-layer read (what / why / strength / risk) for the top layer. */
  plain: { scoreLabel: string; what: string; why: string; strength: string; risk: string };
  /** Per-indicator technical reads for the expandable "Technical details" layer. */
  details: IndicatorDetail[];
}

/** Pick a horizon in ticks for outcome resolution given the tick cadence. */
export function windowTicksFor(symbol: string, tickGapSec: number): number {
  if (symbol.startsWith("1HZ")) return 60; // 1s indices: ~1 minute
  if (tickGapSec <= 0) return 20;
  return Math.max(12, Math.min(90, Math.round(60 / tickGapSec)));
}

/** Map 0-100 confluence score to an honest strength bucket. */
export function strengthFor(confidence: number): GuideStrength {
  if (confidence >= 70) return "STRONG";
  if (confidence >= 58) return "MEDIUM";
  return "WEAK";
}

const CANDLE_LOOKBACK = 40; // enough for EMA(9)/EMA(21) AND MACD EMA(26)+signal(9) to warm

export interface ScanResult {
  signal: GuidingSignalCandidate | null;
  candles: Candle[];
  diagnostics: { candles: number; medianGapSec: number | null; available: string[] };
}

export function scanSignalForSymbol(symbol: string, rawTicks: TickLike[]): ScanResult {
  if (!rawTicks || rawTicks.length < 30) {
    return { signal: null, candles: [], diagnostics: { candles: 0, medianGapSec: null, available: [] } };
  }
  const ticks: TickLike[] = rawTicks.slice().sort((a, b) => a.epoch - b.epoch);
  const gapSec = medianTickGapSec(ticks) ?? 1;
  // Timeframe: 1s indices -> 1m candles; tick ~2/s -> 2m; slower -> 5m.
  const timeframeSec = symbol.startsWith("1HZ") ? 60 : gapSec <= 1 ? 60 : gapSec <= 2 ? 120 : 300;
  const candles = buildCandles(ticks, timeframeSec);
  const diagnostics = {
    candles: candles.length,
    medianGapSec: gapSec,
    available: [] as string[],
  };
  if (candles.length < 8) {
    return { signal: null, candles, diagnostics };
  }

  const closes = candles.slice(-CANDLE_LOOKBACK).map((c) => c.close);
  const { macd: macdLine } = macd(closes);
  const macdHist = macdLine === null ? null : macd(closes).histogram;
  const emaUp = computeEmaUp(closes);
  const rsiValue = closes.length >= 15 ? rsi(closes, 14) : null;

  const available: string[] = [];
  if (emaUp !== null) available.push("EMA");
  if (rsiValue !== null) available.push("RSI");
  if (macdHist !== null) available.push("MACD");
  available.push("momentum");
  diagnostics.available = available;

  const confluence = scoreConfluence(emaUp, rsiValue, macdHist, closes);
  const explanation = explainConfluence(confluence);
  const strength = strengthFor(confluence.score);
  const last = candles[candles.length - 1];

  // Do not emit a tradeable card from a bare coin-flip observation. WEAK is
  // only emitted when there is real (if thin) directional agreement.
  const signal: GuidingSignalCandidate | null =
    strength === "WEAK" && confluence.reasons.length === 1
      ? null
      : {
          symbol,
          family: "momentum_confluence",
          direction: confluence.direction,
          contractType: confluence.direction === "up" ? "CALL" : "PUT",
          confidence: confluence.score,
          strength,
          votes: confluence.votes,
          plain: explanation,
          details: confluence.details,
          // First line is the honest vote tally ("2/2 indicators agree") so the
          // persisted ledger and notifications carry the count, not a scaled
          // percentage. Everything that follows is the same technical read.
          reasons: [
            `${Math.max(confluence.votes.up, confluence.votes.down)}/${confluence.votes.total} indicators agree`,
            ...confluence.reasons,
            `Observed over ${candles.length} ${timeframeSec}s candles · ${available.join("+")} · technical read, not a guaranteed edge`,
          ],
          entryPrice: last.close,
          entryEpoch: last.time + timeframeSec, // resolve starting after the candle closes
          windowTicks: windowTicksFor(symbol, gapSec),
        };

  return { signal, candles, diagnostics };
}

function computeEmaUp(closes: number[]): boolean | null {
  if (closes.length < 22) return null;
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const i = closes.length - 1;
  if (Number.isNaN(fast[i]) || Number.isNaN(slow[i])) return null;
  return fast[i] > slow[i];
}
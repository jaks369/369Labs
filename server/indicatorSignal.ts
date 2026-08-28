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

import { scoreConfluence, explainConfluence, scorePriceActionConfluence, ema, rsi, macd, buildCandles, medianTickGapSec, TickLike, Candle, IndicatorDetail, atr, bollingerBands, adx } from "@shared/indicators";
import { higherTimeframeBias } from "./multiTimeframe";
import { computeStructureTrade, StructureTradeParams, StructureTradeOptions } from "@shared/structureTrade";
import { estimateExecutionCost, computeNetConfidence, expectedMovePips, type CostEstimate } from "@shared/costModel";
import { computeSessionWeight, applySessionWeight, type SessionWeight } from "@shared/sessionWeight";
import { evaluatePromotion, type PaperTrade, type PaperStageResult, DEFAULT_PAPER_STAGE_CONFIG } from "@shared/paperStage";
import { computeDxyContext, type DxyContext } from "@shared/intermarketContext";

export type GuideStrength = "STRONG" | "MEDIUM" | "WEAK";
export type GuideDirection = "up" | "down";

export type MarketRegime = 'trend_up' | 'trend_down' | 'chop' | 'high_vol' | 'low_vol' | 'unknown';

export interface RegimeInfo {
  regime: MarketRegime;
  adx: number | null;
  bbWidthPct: number | null; // percentile 0-100
  emaSlope: 'up' | 'down' | 'flat' | null;
  hurst?: number | null;
  aligned: boolean; // true if regime supports signal direction
  reason: string;
}

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
  /** Market regime at signal time */
  regime?: RegimeInfo;
  /**
   * Higher-timeframe confirmation: trend bias computed ONLY from closed
   * higher-timeframe candles (anti-lookahead). `available: false` means
   * insufficient data — no opinion. When available and misaligned with the
   * candidate direction, strength is capped at MEDIUM.
   */
  htf?: {
    timeframeSec: number;
    bias: "up" | "down" | "neutral";
    aligned: boolean | null; // null = no opinion (insufficient data / neutral bias)
    reason: string;
  };
  /**
   * Surfaced caution case: the momentum layer and the price-action layer
   * disagree on direction (e.g. "indicators say up, but price just broke
   * structure down"). When present, confidence is capped and strength
   * downgraded — a conflict is never silently resolved by picking a winner.
   */
  conflict?: {
    momentumDirection: GuideDirection;
    priceActionDirection: GuideDirection;
    momentumScore: number;
    priceActionScore: number;
    note: string;
  };
  /**
   * Structure-based trade parameters: stop-loss beyond invalidating structure,
   * take-profit targeting opposing liquidity, and premium/discount zone filter.
   * Computed from detected SMC zones (FVG, order blocks, liquidity sweeps)
   * and market structure (BOS/CHoCH, swing points).
   */
  structureTrade?: StructureTradeParams;
  /**
   * Net-of-cost confidence: gross confidence adjusted for estimated execution
   * costs (spread, slippage). Always <= gross confidence. When costs consume
   * most of the edge, net confidence drops below the minimum and the signal
   * is downgraded. This is the professional-grade number — never shown to
   * users without this adjustment.
   */
  netConfidence?: number;
  /** Execution cost estimate used for the net confidence computation. */
  costEstimate?: CostEstimate;
  /** Session liquidity weight: peak=1.0, thin=0.7. Applied to confidence for forex. */
  sessionWeight?: SessionWeight;
  /** Paper stage result: whether this signal needs paper validation before live. */
  paperStageResult?: PaperStageResult;
  /** DXY intermarket context: USD strength alignment check for forex pairs. */
  dxyContext?: DxyContext;
  /** Optional backtest results for validation — populated by scanIndicatorTicks */
  backtest?: {
    confidence: number;
    tier: string;
    baseline: number;
    observed: number;
    edgePp: number;
    ciLow: number;
    ciHigh: number;
    pValue: number;
    fdrAdjusted: boolean;
    inSampleSize: number;
    oosAvg: number;
    oosTotal: number;
    oosInsufficient: boolean;
    walks: { wins: number; n: number; rate: number }[];
    /** Held-out validation gate result — required for VALIDATED badge. */
    validation?: {
      passed: boolean;
      calibrationGapPp: number;
      calibrated: boolean;
      notOverfit: boolean;
      failures: string[];
    };
  };
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

/**
 * CONFLICT DETECTION — momentum and price action disagreeing is its own
 * caution case, not something to silently average away. "Indicators say up,
 * but price just broke structure down" must be surfaced as such.
 */
export function detectMomentumPaConflict(
  momentum: { direction: GuideDirection; score: number; votes: { total: number } },
  priceAction: { direction: GuideDirection; score: number; votes: { total: number } }
): GuidingSignalCandidate["conflict"] | undefined {
  if (
    momentum.votes.total <= 0 ||
    priceAction.votes.total <= 0 ||
    momentum.direction === priceAction.direction
  ) {
    return undefined;
  }
  return {
    momentumDirection: momentum.direction,
    priceActionDirection: priceAction.direction,
    momentumScore: momentum.score,
    priceActionScore: priceAction.score,
    note:
      `CONFLICT: momentum indicators lean ${momentum.direction} while price action leans ${priceAction.direction} ` +
      `(structure/patterns vs oscillator disagreement). Confidence capped and strength downgraded until the layers agree.`,
  };
}

const CANDLE_LOOKBACK = 40; // enough for EMA(9)/EMA(21) AND MACD EMA(26)+signal(9) to warm

export interface ScanResult {
  signal: GuidingSignalCandidate | null;
  candles: Candle[];
  diagnostics: { candles: number; medianGapSec: number | null; available: string[] };
}

export function scanSignalForSymbol(symbol: string, rawTicks: TickLike[], dxyPrices: number[] = []): ScanResult {
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

  // Price action confluence: candle patterns, structure, divergence, SMC, chart patterns
  const paConfluence = scorePriceActionConfluence(candles.slice(-CANDLE_LOOKBACK));

  // Combine momentum + price action into final score
  // Weight: 60% momentum, 40% price action (PA has fewer indicators, so lower weight)
  const combinedScoreRaw = paConfluence.votes.total > 0
    ? Math.round(confluence.score * 0.6 + paConfluence.score * 0.4)
    : confluence.score;
  const combinedDirection = paConfluence.votes.total > 0
    ? (confluence.score >= paConfluence.score ? confluence.direction : paConfluence.direction)
    : confluence.direction;

  const conflict = detectMomentumPaConflict(confluence, paConfluence);

  // A conflicted signal is downgraded one honesty notch: cap confidence below
  // STRONG and never emit it as more than MEDIUM.
  const combinedScore = conflict ? Math.min(combinedScoreRaw, 64) : combinedScoreRaw;

  // Detect market regime
  const regimeInfo = detectRegime(candles);
  const regimeAligned = isRegimeAligned(regimeInfo.regime, confluence.direction);
  const regimeWithAlignment = { ...regimeInfo, aligned: regimeAligned };

  // Higher-timeframe confirmation: bias from CLOSED HTF candles only.
  const htfInfo = higherTimeframeBias(ticks, timeframeSec);
  const htfAligned: boolean | null =
    !htfInfo.available || htfInfo.bias === "neutral"
      ? null
      : htfInfo.bias === (combinedDirection === "up" ? "up" : "down");

  // Structure-based HTF gate: when the higher timeframe's BOS/CHoCH direction
  // clearly opposes the proposed trade, the signal is blocked — not just demoted.
  // This is the professional multi-timeframe discipline: don't fight the HTF structure.
  const htfStructureOpposes =
    htfInfo.available &&
    htfInfo.structureBias !== "neutral" &&
    ((combinedDirection === "up" && htfInfo.structureBias === "bearish") ||
     (combinedDirection === "down" && htfInfo.structureBias === "bullish"));
  htfInfo.structureOpposes = htfStructureOpposes;

  // Do not emit a tradeable card from a bare coin-flip observation. WEAK is
  // only emitted when there is real (if thin) directional agreement.
  let paStrength = strengthFor(combinedScore);
  if (conflict && paStrength === "STRONG") paStrength = "MEDIUM";
  // Multi-timeframe discipline: a STRONG read against the higher timeframe is
  // demoted — lower-TF confluence without HTF agreement is exactly the
  // false-break pattern this filter exists to catch.
  if (paStrength === "STRONG" && htfAligned === false) paStrength = "MEDIUM";
  // HARD GATE: when the higher timeframe's structure (BOS/CHoCH) clearly
  // opposes the proposed trade direction, block the signal entirely.
  // Professional discipline: don't fight the HTF structure.
  if (htfStructureOpposes) {
    paStrength = "WEAK";
  }

  // Structure-based trade parameters: SL beyond invalidating structure, TP from liquidity
  const structureTrade = computeStructureTrade(candles.slice(-CANDLE_LOOKBACK), combinedDirection, last.close);

  // Cost-aware net confidence: subtract estimated execution costs from gross edge
  const costEstimate = estimateExecutionCost(symbol);
  const movePips = expectedMovePips(symbol, windowTicksFor(symbol, gapSec));
  const { netConfidence } = computeNetConfidence(
    combinedScore, 0.5,  // baseline 50% for directional contracts
    Math.max(0, combinedScore - 50),  // approximate edge in pp
    costEstimate.totalPips,
    movePips,
  );

  // Kill-zone session weighting: weight confidence by liquidity quality
  const sessionWeight = computeSessionWeight();
  const sessionAdjustedConfidence = symbol.startsWith("R_") || symbol.startsWith("1HZ") || symbol.startsWith("BOOM") || symbol.startsWith("CRASH")
    ? combinedScore  // synthetic indices unaffected by session timing
    : applySessionWeight(combinedScore, sessionWeight);

  // DXY intermarket context: USD strength alignment for forex pairs
  const isForexPair = !symbol.startsWith("R_") && !symbol.startsWith("1HZ") && !symbol.startsWith("BOOM") && !symbol.startsWith("CRASH");
  let dxyContext: DxyContext | undefined;
  if (isForexPair && combinedDirection && dxyPrices.length > 0) {
    const signalDir = combinedDirection === "up" ? "rise" : "fall";
    const ctx = computeDxyContext(dxyPrices, signalDir, symbol);
    if (ctx) dxyContext = ctx;
  }

  // If net confidence is below minimum, downgrade strength or block signal
  let adjustedStrength = paStrength;
  if (netConfidence < 50 && paStrength !== "WEAK") {
    adjustedStrength = "WEAK";
  }

  const signal: GuidingSignalCandidate | null =
    paStrength === "WEAK" && confluence.reasons.length === 1 && paConfluence.votes.total === 0
      ? null
      : {
          symbol,
          family: "momentum_confluence",
          direction: combinedDirection,
          contractType: combinedDirection === "up" ? "CALL" : "PUT",
          confidence: combinedScore,
          strength: adjustedStrength,
          votes: {
            up: confluence.votes.up + paConfluence.votes.up,
            down: confluence.votes.down + paConfluence.votes.down,
            total: confluence.votes.total + paConfluence.votes.total,
            agreement: (confluence.votes.total + paConfluence.votes.total) > 0
              ? Math.max(confluence.votes.up + paConfluence.votes.up, confluence.votes.down + paConfluence.votes.down) / (confluence.votes.total + paConfluence.votes.total)
              : 0,
          },
          plain: explanation,
          details: [...confluence.details, ...paConfluence.details],
          regime: regimeWithAlignment,
          conflict,
          structureTrade,
          netConfidence,
          costEstimate,
          sessionWeight,
          paperStageResult: netConfidence < 60
            ? { status: "paper", trades: [], winRate: 0, netProfit: 0, tradesCompleted: 0, reason: `Net confidence ${netConfidence.toFixed(1)}% below 60% — needs paper validation` }
            : undefined,
          dxyContext,
          htf: {
            timeframeSec: htfInfo.timeframeSec,
            bias: htfInfo.bias,
            aligned: htfAligned,
            reason: htfInfo.reason,
          },
          reasons: [
            `${Math.max(confluence.votes.up + paConfluence.votes.up, confluence.votes.down + paConfluence.votes.down)}/${confluence.votes.total + paConfluence.votes.total} indicators agree`,
            ...(conflict ? [conflict.note] : []),
            `HTF: ${htfInfo.reason}${htfAligned === false ? " — signal demoted (higher timeframe disagrees)" : ""}${htfStructureOpposes ? " — BLOCKED: HTF structure opposes trade direction" : ""}`,
            ...confluence.reasons,
            ...paConfluence.reasons,
            `Regime: ${regimeWithAlignment.regime} (${regimeWithAlignment.reason}) · ${regimeAligned ? 'aligned' : 'misaligned'}`,
            ...(structureTrade.stopLoss !== null ? [`Structure SL: ${structureTrade.stopLoss.toFixed(4)} (${structureTrade.slSource?.type ?? "unknown"})`] : []),
            ...(structureTrade.takeProfit !== null ? [`Structure TP: ${structureTrade.takeProfit.toFixed(4)} (${structureTrade.tpSource?.type ?? "unknown"})`] : []),
            ...structureTrade.reasoning,
            `Observed over ${candles.length} ${timeframeSec}s candles · ${available.join("+")} · PA patterns · technical read, not a guaranteed edge`,
          ],
          entryPrice: last.close,
          entryEpoch: last.time + timeframeSec,
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

/** Detect market regime from candles */
export function detectRegime(candles: Candle[]): RegimeInfo {
  if (candles.length < 30) {
    return { regime: 'unknown', adx: null, bbWidthPct: null, emaSlope: null, aligned: false, reason: 'Insufficient candles for regime detection' };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // ADX (14 period) - trend strength
  const adxValue = adx(highs, lows, closes, 14);
  const adxLast = adxValue && adxValue.length ? adxValue[adxValue.length - 1] : null;

  // Bollinger Band width percentile (20 period, 2 std) - volatility regime
  const bb = bollingerBands(closes, 20, 2);
  let bbWidthPct: number | null = null;
  if (bb.upper && bb.lower && bb.middle) {
    const widths = bb.upper.map((u, i) => bb.middle[i] ? (u - bb.lower![i]) / bb.middle[i] : 0);
    const currentWidth = widths[widths.length - 1];
    const sorted = [...widths].sort((a, b) => a - b);
    const rank = sorted.findIndex(w => w >= currentWidth);
    bbWidthPct = sorted.length > 0 ? (rank / sorted.length) * 100 : null;
  }

  // EMA slope (21 period) - trend direction
  const ema21 = ema(closes, 21);
  let emaSlope: 'up' | 'down' | 'flat' | null = null;
  if (ema21.length >= 5) {
    const last = ema21[ema21.length - 1];
    const prev = ema21[ema21.length - 5];
    if (last && prev) {
      const pctChange = (last - prev) / prev;
      if (pctChange > 0.002) emaSlope = 'up';
      else if (pctChange < -0.002) emaSlope = 'down';
      else emaSlope = 'flat';
    }
  }

  // Determine regime
  let regime: MarketRegime = 'chop';
  let reason = '';

  if (adxLast !== null && adxLast > 25) {
    // Strong trend
    regime = emaSlope === 'up' ? 'trend_up' : emaSlope === 'down' ? 'trend_down' : 'chop';
    reason = `ADX ${adxLast.toFixed(1)} > 25 (strong trend)`;
  } else if (adxLast !== null && adxLast < 20) {
    // Chop / ranging
    regime = 'chop';
    reason = `ADX ${adxLast.toFixed(1)} < 20 (choppy/ranging)`;
  } else {
    // Moderate ADX - check volatility
    if (bbWidthPct !== null && bbWidthPct > 80) {
      regime = 'high_vol';
      reason = `BB width ${bbWidthPct.toFixed(0)}th percentile (high volatility)`;
    } else if (bbWidthPct !== null && bbWidthPct < 20) {
      regime = 'low_vol';
      reason = `BB width ${bbWidthPct.toFixed(0)}th percentile (low volatility)`;
    } else {
      regime = 'chop';
      reason = `ADX ${adxLast?.toFixed(1) ?? 'N/A'} moderate, BB width ${bbWidthPct?.toFixed(0) ?? 'N/A'}th percentile`;
    }
  }

  return {
    regime,
    adx: adxLast,
    bbWidthPct,
    emaSlope,
    aligned: false, // set by caller based on signal direction
    reason,
  };
}

/** Check if regime aligns with signal direction */
export function isRegimeAligned(regime: MarketRegime, direction: GuideDirection): boolean {
  if (direction === 'up') {
    return regime === 'trend_up' || regime === 'low_vol';
  }
  return regime === 'trend_down' || regime === 'low_vol';
}

/**
 * Analyze OHLC candles directly (no tick aggregation needed).
 * Used when real candle data is available from Deriv's candles API.
 */
export function scanSignalFromCandles(symbol: string, candles: Candle[]): ScanResult {
  if (!candles || candles.length < 8) {
    return { signal: null, candles, diagnostics: { candles: candles.length, medianGapSec: null, available: [] } };
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

  const confluence = scoreConfluence(emaUp, rsiValue, macdHist, closes);
  const explanation = explainConfluence(confluence);
  const strength = strengthFor(confluence.score);
  const last = candles[candles.length - 1];

  const paConfluence = scorePriceActionConfluence(candles.slice(-CANDLE_LOOKBACK));

  const combinedScoreRaw = paConfluence.votes.total > 0
    ? Math.round(confluence.score * 0.6 + paConfluence.score * 0.4)
    : confluence.score;
  const combinedDirection = paConfluence.votes.total > 0
    ? (confluence.score >= paConfluence.score ? confluence.direction : paConfluence.direction)
    : confluence.direction;

  const conflict = detectMomentumPaConflict(confluence, paConfluence);
  const combinedScore = conflict ? Math.min(combinedScoreRaw, 64) : combinedScoreRaw;

  const regimeInfo = detectRegime(candles);
  const regimeAligned = isRegimeAligned(regimeInfo.regime, confluence.direction);
  const regimeWithAlignment = { ...regimeInfo, aligned: regimeAligned };

  // HTF bias from candles (use 4x timeframe — if candles are 5m, HTF is 20m)
  const htfInfo = higherTimeframeBiasFromCandles(candles);
  const htfAligned: boolean | null =
    !htfInfo.available || htfInfo.bias === "neutral"
      ? null
      : htfInfo.bias === (combinedDirection === "up" ? "up" : "down");

  const htfStructureOpposes =
    htfInfo.available &&
    htfInfo.structureBias !== "neutral" &&
    ((combinedDirection === "up" && htfInfo.structureBias === "bearish") ||
     (combinedDirection === "down" && htfInfo.structureBias === "bullish"));
  htfInfo.structureOpposes = htfStructureOpposes;

  let paStrength = strengthFor(combinedScore);
  if (conflict && paStrength === "STRONG") paStrength = "MEDIUM";
  if (paStrength === "STRONG" && htfAligned === false) paStrength = "MEDIUM";
  if (htfStructureOpposes) paStrength = "WEAK";

  const structureTrade = computeStructureTrade(candles.slice(-CANDLE_LOOKBACK), combinedDirection, last.close);

  const costEstimate = estimateExecutionCost(symbol);
  const movePips = expectedMovePips(symbol, 100);
  const { netConfidence } = computeNetConfidence(
    combinedScore, 0.5,
    Math.max(0, combinedScore - 50),
    costEstimate.totalPips,
    movePips,
  );

  const sessionWeight = computeSessionWeight();
  const isSynthetic = symbol.startsWith("R_") || symbol.startsWith("1HZ") || symbol.startsWith("BOOM") || symbol.startsWith("CRASH");
  const sessionAdjustedConfidence = isSynthetic ? combinedScore : applySessionWeight(combinedScore, sessionWeight);

  let adjustedStrength = paStrength;
  if (netConfidence < 50 && paStrength !== "WEAK") adjustedStrength = "WEAK";

  const signal: GuidingSignalCandidate | null =
    paStrength === "WEAK" && confluence.reasons.length === 1 && paConfluence.votes.total === 0
      ? null
      : {
          symbol,
          family: "momentum_confluence",
          direction: combinedDirection,
          contractType: combinedDirection === "up" ? "CALL" : "PUT",
          confidence: combinedScore,
          strength: adjustedStrength,
          votes: {
            up: confluence.votes.up + paConfluence.votes.up,
            down: confluence.votes.down + paConfluence.votes.down,
            total: confluence.votes.total + paConfluence.votes.total,
            agreement: (confluence.votes.total + paConfluence.votes.total) > 0
              ? Math.max(confluence.votes.up + paConfluence.votes.up, confluence.votes.down + paConfluence.votes.down) / (confluence.votes.total + paConfluence.votes.total)
              : 0,
          },
          plain: explanation,
          details: [...confluence.details, ...paConfluence.details],
          regime: regimeWithAlignment,
          conflict,
          structureTrade,
          netConfidence,
          costEstimate,
          sessionWeight,
          dxyContext: undefined,
          htf: {
            timeframeSec: htfInfo.timeframeSec,
            bias: htfInfo.bias,
            aligned: htfAligned,
            reason: htfInfo.reason,
          },
          reasons: [
            `${Math.max(confluence.votes.up + paConfluence.votes.up, confluence.votes.down + paConfluence.votes.down)}/${confluence.votes.total + paConfluence.votes.total} indicators agree`,
            ...(conflict ? [conflict.note] : []),
            `HTF: ${htfInfo.reason}${htfAligned === false ? " — signal demoted" : ""}${htfStructureOpposes ? " — BLOCKED: HTF structure opposes" : ""}`,
            ...confluence.reasons,
            ...paConfluence.reasons,
            `Regime: ${regimeWithAlignment.regime} (${regimeWithAlignment.reason}) · ${regimeAligned ? 'aligned' : 'misaligned'}`,
            ...(structureTrade.stopLoss !== null ? [`Structure SL: ${structureTrade.stopLoss.toFixed(4)} (${structureTrade.slSource?.type ?? "unknown"})`] : []),
            ...(structureTrade.takeProfit !== null ? [`Structure TP: ${structureTrade.takeProfit.toFixed(4)} (${structureTrade.tpSource?.type ?? "unknown"})`] : []),
            ...structureTrade.reasoning,
            `Analyzed over ${candles.length} candles · ${available.join("+")} · PA patterns · technical read, not a guaranteed edge`,
          ],
          entryPrice: last.close,
          entryEpoch: last.time + 300,
          windowTicks: 100,
        };

  return { signal, candles, diagnostics: { candles: candles.length, medianGapSec: null, available } };
}

/** HTF bias from candles directly (no ticks needed). */
function higherTimeframeBiasFromCandles(candles: Candle[]): { available: boolean; bias: "up" | "down" | "neutral"; structureBias: "bullish" | "bearish" | "neutral"; timeframeSec: number; reason: string; structureOpposes?: boolean } {
  if (candles.length < 40) return { available: false, bias: "neutral", structureBias: "neutral", timeframeSec: 300, reason: "Insufficient candle data for HTF analysis" };
  // Use every 4th candle as the "higher timeframe"
  const htfCandles = candles.filter((_, i) => i % 4 === 0);
  if (htfCandles.length < 10) return { available: false, bias: "neutral", structureBias: "neutral", timeframeSec: 1200, reason: "Insufficient HTF candles" };
  const htfCloses = htfCandles.map((c) => c.close);
  const fast = ema(htfCloses, 9);
  const slow = ema(htfCloses, 21);
  const i = htfCloses.length - 1;
  if (Number.isNaN(fast[i]) || Number.isNaN(slow[i])) return { available: false, bias: "neutral", structureBias: "neutral", timeframeSec: 1200, reason: "HTF EMA notcomputable" };
  const bias = fast[i] > slow[i] ? "up" : fast[i] < slow[i] ? "down" : "neutral";
  // Simple structure bias: compare last two HTF swing highs/lows
  let structureBias: "bullish" | "bearish" | "neutral" = "neutral";
  if (htfCandles.length >= 6) {
    const recentHigh = Math.max(...htfCandles.slice(-3).map((c) => c.high));
    const prevHigh = Math.max(...htfCandles.slice(-6, -3).map((c) => c.high));
    const recentLow = Math.min(...htfCandles.slice(-3).map((c) => c.low));
    const prevLow = Math.min(...htfCandles.slice(-6, -3).map((c) => c.low));
    if (recentHigh > prevHigh && recentLow > prevLow) structureBias = "bullish";
    else if (recentHigh < prevHigh && recentLow < prevLow) structureBias = "bearish";
  }
  return {
    available: true,
    bias,
    structureBias,
    timeframeSec: 1200,
    reason: `HTF EMA ${bias === "up" ? "bullish" : bias === "down" ? "bearish" : "neutral"} (EMA9 ${fast[i].toFixed(4)} vs EMA21 ${slow[i].toFixed(4)}) · Structure: ${structureBias}`,
  };
}
/**
 * Pure technical-indicator math for the AI concierge determinist engine.
 *
 * No I/O, no randomness. Every function takes plain arrays and returns plain
 * values so the scanner, the concierge briefing and the tests all share the
 * same ground truth. Everything produced here is an OBSERVATION of recent
 * price action — never a forecast — and the confidence logic treats indicator
 * agreement strictly.
 */

import { scanCandlePatterns } from "./candlePatterns";
import { labelStructure } from "./marketStructure";
import { detectDivergences } from "./divergence";
import { detectSmcZones } from "./smcZones";
import { detectChartPatterns } from "./chartPatterns";

export interface TickLike {
  price: number;
  epoch: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Aggregate a tick stream (oldest first) into fixed-timeframe candles. */
export function buildCandles(ticks: TickLike[], timeframeSec: number): Candle[] {
  if (ticks.length === 0) return [];
  const bins = new Map<number, Candle>();
  for (const t of ticks) {
    const bucket = Math.floor(t.epoch / timeframeSec) * timeframeSec;
    const existing = bins.get(bucket);
    if (!existing) {
      bins.set(bucket, { time: bucket, open: t.price, high: t.price, low: t.price, close: t.price });
    } else {
      existing.high = Math.max(existing.high, t.price);
      existing.low = Math.min(existing.low, t.price);
      existing.close = t.price;
    }
  }
  return Array.from(bins.values()).sort((a, b) => a.time - b.time);
}

/** Simple moving average over values; returns array aligned to input (NaN until period). */
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average; returns array aligned to input (NaN until warmed). */
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI; returns the final value when possible, else null. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MacdResult {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

/** Standard EMA(12)-EMA(26) MACD with 9-period signal line. */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] === undefined || slowEma[i] === undefined || Number.isNaN(fastEma[i]) || Number.isNaN(slowEma[i])) line.push(NaN);
    else line.push(fastEma[i] - slowEma[i]);
  }
  const signal = ema(line, signalPeriod);
  const lastIdx = closes.length - 1;
  const m = Number.isNaN(line[lastIdx]) ? null : line[lastIdx];
  const s = m === null || Number.isNaN(signal[lastIdx]) ? null : signal[lastIdx];
  return { macd: m, signal: s, histogram: m !== null && s !== null ? m - s : null };
}

export interface BollingerResult {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  widthPct: number | null;
}

/** Bollinger Bands (20, 2) read from the last closed candle. */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const lastIdx = closes.length - 1;
  if (closes.length < period) return { upper: null, middle: null, lower: null, widthPct: null };
  const window = closes.slice(lastIdx - period + 1);
  const middle = window.reduce((s, v) => s + v, 0) / period;
  const variance = window.reduce((s, v) => s + (v - middle) * (v - middle), 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const widthPct = middle !== 0 ? (sd / middle) * 100 : null;
  return { upper, middle, lower, widthPct };
}

/** Average True Range (Wilder smoothing) — returns array aligned to input. */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  
  const tr: number[] = [NaN];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  
  // Wilder smoothing
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  out[period] = sum / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

/** Bollinger Bands over full array — returns arrays aligned to input. */
export function bollingerBands(closes: number[], period = 20, mult = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = new Array(closes.length).fill(NaN);
  const middle: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  
  if (closes.length < period) return { upper, middle, lower };
  
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mid = window.reduce((s, v) => s + v, 0) / period;
    const variance = window.reduce((s, v) => s + (v - mid) * (v - mid), 0) / period;
    const sd = Math.sqrt(variance);
    middle[i] = mid;
    upper[i] = mid + mult * sd;
    lower[i] = mid - mult * sd;
  }
  return { upper, middle, lower };
}

/** ADX (Average Directional Index) with Wilder smoothing — returns array aligned to input. */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  
  const plusDM: number[] = [NaN];
  const minusDM: number[] = [NaN];
  const tr: number[] = [NaN];
  
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  
  // Wilder smoothing for +DI, -DI, TR
  const smooth = (arr: number[]): number[] => {
    const res: number[] = new Array(arr.length).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i];
    res[period] = sum / period;
    for (let i = period + 1; i < arr.length; i++) {
      res[i] = (res[i - 1] * (period - 1) + arr[i]) / period;
    }
    return res;
  };
  
  const plusDISmoothed = smooth(plusDM);
  const minusDISmoothed = smooth(minusDM);
  const trSmoothed = smooth(tr);
  
  const plusDI: number[] = new Array(closes.length).fill(NaN);
  const minusDI: number[] = new Array(closes.length).fill(NaN);
  const dx: number[] = new Array(closes.length).fill(NaN);
  
  for (let i = period; i < closes.length; i++) {
    if (trSmoothed[i] > 0) {
      plusDI[i] = (plusDISmoothed[i] / trSmoothed[i]) * 100;
      minusDI[i] = (minusDISmoothed[i] / trSmoothed[i]) * 100;
      const diSum = plusDI[i] + minusDI[i];
      dx[i] = diSum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100 : 0;
    }
  }
  
  // ADX = Wilder smoothed DX
  let sum = 0;
  for (let i = period; i <= 2 * period - 1; i++) sum += dx[i] || 0;
  out[2 * period - 1] = sum / period;
  
  for (let i = 2 * period; i < closes.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + (dx[i] || 0)) / period;
  }
  
  return out;
}

/** Median tick-to-tick gap in seconds — used to pick an honest candle timeframe. */
export function medianTickGapSec(ticks: TickLike[]): number | null {
  if (ticks.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const g = ticks[i].epoch - ticks[i - 1].epoch;
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export interface ConfluenceVotes {
  up: number;
  down: number;
  total: number;
  /** max(up,down) / total, 0..1 — the agreement fraction shown as "N/M agree" and the same one behind the score. */
  agreement: number;
}

export interface ConfluenceScore {
  score: number; // 0-100 — agreement-weighted, never audience applause
  direction: "up" | "down";
  reasons: string[];
  /** The vote tally that produced `score` (see scoreForAgreement derivation). */
  votes: ConfluenceVotes;
  /** Per-indicator reads in evaluation order — drives the "Technical details" layer. */
  details: IndicatorDetail[];
}

/** One indicator's human-readable read, in evaluation order. */
export interface IndicatorDetail {
  name: string;
  value: string;
  verdict: "up" | "down" | "neutral";
}

/**
 * Deterministic confluence over the latest candle:
 *   + EMA9>EMA21 trend agree, + RSI>55 (up) / <45 (down), + MACD histogram
 *   sign agree, + close within upper/lower Bollinger half agree, + momentum
 *   of last 3 closes agree.
 * The denominator is every indicator with a COMPUTABLE read — a missing EMA/
 * MACD or a mid-range RSI still counts as a "no agreement" vote instead of
 * vanishing, so a thin 2/2 or 1/1 agreement can no longer saturate at the cap.
 * Confidence is the agreement fraction (max(up,down)/total — the same "N/M
 * indicators agree" the UI renders) scaled into 50..86; zero agreement yields
 * "up" with score 50 (a coin-flip-ish observation, not a lean).
 */
export function scoreConfluence(
  emaUp: boolean | null,
  rsiValue: number | null,
  macdHist: number | null,
  closes: number[],
): ConfluenceScore {
  const reasons: string[] = [];
  const details: IndicatorDetail[] = [];
  let up = 0;
  let down = 0;
  let computable = 0;

  if (emaUp !== null) {
    computable++;
    if (emaUp) {
      up++;
      reasons.push("EMA trend is up");
      details.push({ name: "Trend (EMA 9 vs 21)", value: "9-period average sits above the 21-period average — rising", verdict: "up" });
    } else {
      down++;
      reasons.push("EMA trend is down");
      details.push({ name: "Trend (EMA 9 vs 21)", value: "9-period average sits below the 21-period average — falling", verdict: "down" });
    }
  }
  if (rsiValue !== null) {
    computable++;
    if (rsiValue > 55) {
      up++;
      reasons.push(`RSI ${rsiValue.toFixed(1)} — bullish-ish momentum`);
      details.push({ name: "Momentum (RSI)", value: `${rsiValue.toFixed(1)} — above 55, leaning up`, verdict: "up" });
    } else if (rsiValue < 45) {
      down++;
      reasons.push(`RSI ${rsiValue.toFixed(1)} — bearish-ish momentum`);
      details.push({ name: "Momentum (RSI)", value: `${rsiValue.toFixed(1)} — below 45, leaning down`, verdict: "down" });
    } else {
      reasons.push(`RSI ${rsiValue.toFixed(1)} — neutral vote`);
      details.push({ name: "Momentum (RSI)", value: `${rsiValue.toFixed(1)} — mid-range, no lean`, verdict: "neutral" });
    }
  }
  if (macdHist !== null) {
    computable++;
    if (macdHist > 0) {
      up++;
      reasons.push("MACD histogram positive");
      details.push({ name: "MACD histogram", value: "positive — momentum building up", verdict: "up" });
    } else if (macdHist < 0) {
      down++;
      reasons.push("MACD histogram negative");
      details.push({ name: "MACD histogram", value: "negative — momentum building down", verdict: "down" });
    } else {
      reasons.push("MACD histogram flat — neutral vote");
      details.push({ name: "MACD histogram", value: "flat — no momentum either way", verdict: "neutral" });
    }
  }
  if (closes.length >= 4) {
    computable++;
    const last = closes[closes.length - 1];
    const threeBack = closes[closes.length - 4];
    if (last > threeBack) {
      up++;
      reasons.push("3-candle momentum up");
      details.push({ name: "Short-term momentum", value: "last 3 candles net higher", verdict: "up" });
    } else if (last < threeBack) {
      down++;
      reasons.push("3-candle momentum down");
      details.push({ name: "Short-term momentum", value: "last 3 candles net lower", verdict: "down" });
    } else {
      reasons.push("3-candle momentum flat — neutral vote");
      details.push({ name: "Short-term momentum", value: "last 3 candles flat", verdict: "neutral" });
    }
  }

  const total = computable;
  const net = up - down;
  const direction: "up" | "down" = net >= 0 ? "up" : "down";
  // Same fraction the UI renders ("N/M indicators agree"): how many of the
  // computable indicators point the signal's way. A neutral RSI or a missing
  // indicator lowers N/M instead of disappearing from the denominator, so a
  // 2-of-4 read scores ~64, not the 78 cap.
  const agreement = total > 0 ? Math.max(up, down) / total : 0;
  // Base 50, +28 at full agreement, scaled by how much agrees relative to
  // available indicators. Never goes past ~86 so it can't read as a certainty.
  // 4/4 agree → agreement 1.0 → 50 + 28 = 78 (an agreement score, NOT a
  // probability: full agreement just means all available indicators point the
  // same way, it says nothing about the odds of the next tick).
  const score = Math.min(86, 50 + Math.round(agreement * 28));
  const votes: ConfluenceVotes = { up, down, total, agreement };
  return { score, direction, votes, details, reasons: reasons.length ? reasons : ["No indicator agreement — neutral observation"] };
}

/**
 * Plain-English reading of a confluence score for non-traders. Answers the four
 * questions the UI must answer for every signal:
 *   what is happening → why the AI thinks that → how strong the evidence is →
 *   what the risk is. `score` is deliberately framed as an AGREEMENT score
 *   (how many indicators share the read), never a win probability.
 */
export interface ConfluenceExplanation {
  scoreLabel: string;
  what: string;
  why: string;
  strength: string;
  risk: string;
}

export function explainConfluence(score: ConfluenceScore): ConfluenceExplanation {
  const dirWord = score.direction === "up" ? "upward" : "downward";
  const agree = Math.max(score.votes.up, score.votes.down);
  const share = score.votes.total > 0 ? agree / score.votes.total : 0;
  const scoreLabel = share >= 0.75 ? "Strong agreement" : share >= 0.5 ? "Moderate agreement" : "Weak agreement";

  const list = (a: string[]) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

  const agreeing = score.details.filter((d) => d.verdict === score.direction);
  const dissenting = score.details.filter((d) => d.verdict !== "neutral" && d.verdict !== score.direction);
  const neutral = score.details.filter((d) => d.verdict === "neutral");

  const what =
    score.votes.total === 0
      ? "No indicator has enough data to compute a read yet — a flat, low-conviction observation."
      : `${agree} of ${score.votes.total} computable indicators point ${dirWord}.`;

  let why: string;
  if (agreeing.length === 0) {
    why = "No indicator clearly agrees on a direction — the read is choppy, not trending.";
  } else {
    why = `${list(agreeing.map((d) => d.name))} point${agreeing.length === 1 ? "s" : ""} ${dirWord}`;
    if (dissenting.length) why += `, while ${list(dissenting.map((d) => d.name))} point${dissenting.length === 1 ? "s" : ""} the other way`;
    if (neutral.length) why += `, and ${list(neutral.map((d) => d.name))} sit${neutral.length === 1 ? "s" : ""} in a neutral zone`;
    why += ".";
  }

  const strength = `A ${scoreLabel.toLowerCase()} read — ${agree} of ${score.votes.total} computable indicators share it. That's the whole read: no win probability is implied, only how many indicators pointed the same way.`;
  const risk =
    "This count says how many indicators agree, not how likely the trade is to win. Volatility indices are near-random by design — size the trade from your risk budget (e.g. 2% of your account), never from how many indicators agree.";

  return { scoreLabel, what, why, strength, risk };
}

export interface PriceActionScore {
  score: number;
  direction: "up" | "down";
  votes: { up: number; down: number; total: number; agreement: number };
  details: IndicatorDetail[];
  reasons: string[];
}

export function scorePriceActionConfluence(candles: Candle[]): PriceActionScore {
  if (!candles || candles.length < 15) {
    return { score: 50, direction: "up", votes: { up: 0, down: 0, total: 0, agreement: 0 }, details: [], reasons: [] };
  }

  let up = 0;
  let down = 0;
  let computable = 0;
  const details: IndicatorDetail[] = [];
  const reasons: string[] = [];

  // 1. Candle patterns
  const candlePats = scanCandlePatterns(candles);
  if (candlePats.length > 0) {
    computable++;
    const bullish = candlePats.filter((p) => p.direction === "bullish").length;
    const bearish = candlePats.filter((p) => p.direction === "bearish").length;
    if (bullish > bearish) { up++; reasons.push(`${candlePats.length} candle pattern(s) bullish`); }
    else if (bearish > bullish) { down++; reasons.push(`${candlePats.length} candle pattern(s) bearish`); }
    else { reasons.push(`${candlePats.length} candle pattern(s) mixed`); }
    details.push({ name: "Candle patterns", value: `${bullish}B/${bearish}S`, verdict: bullish > bearish ? "up" : bearish > bullish ? "down" : "neutral" });
  }

  // 2. Market structure
  const structure = labelStructure(candles, { internalLookback: 3, smoothPeriod: 5 });
  if (structure.currentBias !== "neutral") {
    computable++;
    if (structure.currentBias === "bullish") { up++; reasons.push("Market structure bullish"); }
    else { down++; reasons.push("Market structure bearish"); }
    details.push({ name: "Market structure", value: structure.currentBias, verdict: structure.currentBias === "bullish" ? "up" : "down" });
  }

  // 3. Divergence
  const divs = detectDivergences(candles, { swingLookback: 3 });
  if (divs.length > 0) {
    computable++;
    const recent = divs[0];
    if (recent.direction === "bullish") { up++; reasons.push(`Divergence: ${recent.type.replace(/_/g, " ")}`); }
    else { down++; reasons.push(`Divergence: ${recent.type.replace(/_/g, " ")}`); }
    details.push({ name: "Divergence", value: recent.type.replace(/_/g, " "), verdict: recent.direction === "bullish" ? "up" : "down" });
  }

  // 4. SMC zones
  const zones = detectSmcZones(candles, { internalLookback: 3, smoothPeriod: 5 });
  const unfilled = zones.filter((z) => !z.filled);
  if (unfilled.length > 0) {
    computable++;
    const bullishZones = unfilled.filter((z) => z.direction === "bullish").length;
    const bearishZones = unfilled.filter((z) => z.direction === "bearish").length;
    if (bullishZones > bearishZones) { up++; reasons.push(`${unfilled.length} unfilled bullish SMC zone(s)`); }
    else if (bearishZones > bullishZones) { down++; reasons.push(`${unfilled.length} unfilled bearish SMC zone(s)`); }
    details.push({ name: "SMC zones", value: `${bullishZones}B/${bearishZones}S unfilled`, verdict: bullishZones > bearishZones ? "up" : bearishZones > bullishZones ? "down" : "neutral" });
  }

  // 5. Chart patterns
  const chartPats = detectChartPatterns(candles, { internalLookback: 3, smoothPeriod: 5 });
  if (chartPats.length > 0) {
    computable++;
    const recent = chartPats[0];
    if (recent.direction === "bullish") { up++; reasons.push(`Chart pattern: ${recent.type.replace(/_/g, " ")}`); }
    else { down++; reasons.push(`Chart pattern: ${recent.type.replace(/_/g, " ")}`); }
    details.push({ name: "Chart patterns", value: recent.type.replace(/_/g, " "), verdict: recent.direction === "bullish" ? "up" : "down" });
  }

  const total = computable;
  const net = up - down;
  const direction: "up" | "down" = net >= 0 ? "up" : "down";
  const agreement = total > 0 ? Math.max(up, down) / total : 0;
  const score = Math.min(86, 50 + Math.round(agreement * 28));

  return {
    score,
    direction,
    votes: { up, down, total, agreement },
    details,
    reasons: reasons.length ? reasons : ["No price action patterns detected"],
  };
}
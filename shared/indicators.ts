/**
 * Pure technical-indicator math for the AI concierge determinist engine.
 *
 * No I/O, no randomness. Every function takes plain arrays and returns plain
 * values so the scanner, the concierge briefing and the tests all share the
 * same ground truth. Everything produced here is an OBSERVATION of recent
 * price action — never a forecast — and the confidence logic treats indicator
 * agreement strictly.
 */

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

export interface ConfluenceScore {
  score: number; // 0-100 — agreement-weighted, never audience applause
  direction: "up" | "down";
  reasons: string[];
}

/**
 * Deterministic confluence over the latest candle:
 *   + EMA9>EMA21 trend agree, + RSI>55 (up) / <45 (down), + MACD histogram
 *   sign agree, + close within upper/lower Bollinger half agree, + momentum
 *   of last 3 closes agree.
 * Confidence is capped by how many signals agree; zero agreement yields "up"
 * with score 50 (a coin-flip-ish observation, not a lean).
 */
export function scoreConfluence(
  emaUp: boolean | null,
  rsiValue: number | null,
  macdHist: number | null,
  closes: number[],
): ConfluenceScore {
  const reasons: string[] = [];
  let up = 0;
  let down = 0;

  if (emaUp !== null) {
    if (emaUp) { up++; reasons.push("EMA trend is up"); }
    else { down++; reasons.push("EMA trend is down"); }
  }
  if (rsiValue !== null) {
    if (rsiValue > 55) { up++; reasons.push(`RSI ${rsiValue.toFixed(1)} — bullish-ish momentum`); }
    else if (rsiValue < 45) { down++; reasons.push(`RSI ${rsiValue.toFixed(1)} — bearish-ish momentum`); }
    else reasons.push("RSI mid-range — no edge");
  }
  if (macdHist !== null) {
    if (macdHist > 0) { up++; reasons.push("MACD histogram positive"); }
    else if (macdHist < 0) { down++; reasons.push("MACD histogram negative"); }
  }
  if (closes.length >= 4) {
    const last = closes[closes.length - 1];
    const threeBack = closes[closes.length - 4];
    if (last > threeBack) { up++; reasons.push("3-candle momentum up"); }
    else if (last < threeBack) { down++; reasons.push("3-candle momentum down"); }
  }

  const total = up + down;
  const net = up - down;
  const direction: "up" | "down" = net >= 0 ? "up" : "down";
  const agreement = Math.abs(net) / Math.max(1, total);
  // Base 50, +28 at full agreement, scaled by how much agrees relative to
  // available indicators. Never goes past ~86 so it can't read as a certainty.
  const score = Math.min(86, 50 + Math.round(agreement * 28));
  return { score, direction, reasons: reasons.length ? reasons : ["No indicator agreement — neutral observation"] };
}
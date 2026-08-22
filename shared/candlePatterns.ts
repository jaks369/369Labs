import { Candle } from "./indicators";

export interface PatternVote {
  direction: "up" | "down" | "neutral";
  name: string;
  strength: number;
  reason: string;
  index: number;
}

function body(c: Candle): number { return Math.abs(c.close - c.open); }
function range(c: Candle): number { return c.high - c.low; }
function upperWick(c: Candle): number { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle): number { return Math.min(c.open, c.close) - c.low; }
function isBullish(c: Candle): boolean { return c.close > c.open; }
function isBearish(c: Candle): boolean { return c.close < c.open; }
function bodyMidpoint(c: Candle): number { return (c.open + c.close) / 2; }

function priorTrend(candles: Candle[], lookback = 4): "up" | "down" | "flat" {
  const slice = candles.slice(Math.max(0, candles.length - 1 - lookback), candles.length - 1);
  if (slice.length < 3) return "flat";
  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  if (last > first * 1.001) return "up";
  if (last < first * 0.999) return "down";
  return "flat";
}

// --- 1-candle patterns ---

export function detectDoji(candles: Candle[]): PatternVote | null {
  const c = candles[candles.length - 1];
  if (!c || range(c) === 0) return null;
  const ratio = body(c) / range(c);
  if (ratio > 0.1) return null;
  return { direction: "neutral", name: "Doji", strength: 1 - ratio / 0.1,
    reason: `Doji — indecision. Body is ${(ratio * 100).toFixed(1)}% of range.`,
    index: candles.length - 1 };
}

export function detectSpinningTop(candles: Candle[]): PatternVote | null {
  const c = candles[candles.length - 1];
  if (!c || range(c) === 0) return null;
  const ratio = body(c) / range(c);
  if (ratio > 0.2 || ratio < 0.02) return null;
  const r = range(c);
  if (upperWick(c) < r * 0.25 || lowerWick(c) < r * 0.25) return null;
  return { direction: "neutral", name: "Spinning top", strength: 0.7,
    reason: "Spinning top — small body with wicks both sides, market undecided.",
    index: candles.length - 1 };
}

export function detectHammer(candles: Candle[]): PatternVote | null {
  if (candles.length < 5) return null;
  const c = candles[candles.length - 1];
  if (!c || range(c) === 0) return null;
  const b = body(c);
  if (lowerWick(c) < b * 2 || upperWick(c) > b * 0.5) return null;
  if (bodyMidpoint(c) < c.low + range(c) * 0.3) return null;
  const trend = priorTrend(candles);
  if (trend === "down") return { direction: "up", name: "Hammer", strength: 0.8,
    reason: "Hammer at downtrend bottom — buyers rejected lower prices.",
    index: candles.length - 1 };
  if (trend === "up") return { direction: "down", name: "Hanging man", strength: 0.7,
    reason: "Hanging man at uptrend top — long lower wick signals distribution.",
    index: candles.length - 1 };
  return null;
}

export function detectShootingStar(candles: Candle[]): PatternVote | null {
  if (candles.length < 5) return null;
  const c = candles[candles.length - 1];
  if (!c || range(c) === 0) return null;
  const b = body(c);
  if (upperWick(c) < b * 2 || lowerWick(c) > b * 0.5) return null;
  if (bodyMidpoint(c) > c.low + range(c) * 0.7) return null;
  const trend = priorTrend(candles);
  if (trend === "up") return { direction: "down", name: "Shooting star", strength: 0.8,
    reason: "Shooting star at uptrend top — sellers rejected higher prices.",
    index: candles.length - 1 };
  if (trend === "down") return { direction: "up", name: "Inverted hammer", strength: 0.7,
    reason: "Inverted hammer at downtrend bottom — buying pressure emerging.",
    index: candles.length - 1 };
  return null;
}

// --- 2-candle patterns ---

export function detectEngulfing(candles: Candle[]): PatternVote | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const cur = candles[candles.length - 1];
  if (!prev || !cur || range(prev) === 0 || range(cur) === 0) return null;
  const pTop = Math.max(prev.open, prev.close), pBot = Math.min(prev.open, prev.close);
  const cTop = Math.max(cur.open, cur.close), cBot = Math.min(cur.open, cur.close);
  const engulfs = cTop > pTop && cBot < pBot;
  if (!engulfs) return null;
  if (isBullish(cur) && isBearish(prev)) return { direction: "up", name: "Bullish engulfing", strength: 0.85,
    reason: "Bullish engulfing — green candle fully swallowed prior red candle.",
    index: candles.length - 1 };
  if (isBearish(cur) && isBullish(prev)) return { direction: "down", name: "Bearish engulfing", strength: 0.85,
    reason: "Bearish engulfing — red candle fully swallowed prior green candle.",
    index: candles.length - 1 };
  return null;
}

export function detectDarkCloudCover(candles: Candle[]): PatternVote | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (!prev || !cur || !isBullish(prev) || !isBearish(cur)) return null;
  if (cur.open <= prev.close) return null;
  if (cur.close > bodyMidpoint(prev)) return null;
  return { direction: "down", name: "Dark cloud cover", strength: 0.75,
    reason: "Dark cloud cover — opened above prior close but closed deep into prior body.",
    index: candles.length - 1 };
}

export function detectPiercingLine(candles: Candle[]): PatternVote | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (!prev || !cur || !isBearish(prev) || !isBullish(cur)) return null;
  if (cur.open >= prev.close) return null;
  if (cur.close < bodyMidpoint(prev)) return null;
  return { direction: "up", name: "Piercing line", strength: 0.75,
    reason: "Piercing line — opened below prior close but recovered past midpoint.",
    index: candles.length - 1 };
}

export function detectHarami(candles: Candle[]): PatternVote | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (!prev || !cur || range(prev) === 0) return null;
  const pTop = Math.max(prev.open, prev.close), pBot = Math.min(prev.open, prev.close);
  const cTop = Math.max(cur.open, cur.close), cBot = Math.min(cur.open, cur.close);
  if (!(cTop < pTop && cBot > pBot)) return null;
  const isCross = range(cur) > 0 && body(cur) / range(cur) < 0.1;
  if (isBearish(prev) && isBullish(cur)) return { direction: "up",
    name: isCross ? "Harami cross" : "Bullish harami", strength: isCross ? 0.7 : 0.6,
    reason: isCross ? "Harami cross — doji inside bearish candle, potential reversal."
      : "Bullish harami — small green inside prior large red, sellers losing steam.",
    index: candles.length - 1 };
  if (isBullish(prev) && isBearish(cur)) return { direction: "down",
    name: isCross ? "Harami cross" : "Bearish harami", strength: isCross ? 0.7 : 0.6,
    reason: isCross ? "Harami cross — doji inside bullish candle, potential reversal."
      : "Bearish harami — small red inside prior large green, buyers losing steam.",
    index: candles.length - 1 };
  return null;
}

export function detectTweezers(candles: Candle[]): PatternVote | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (!prev || !cur) return null;
  const tol = 0.001;
  if (Math.abs(prev.high - cur.high) / Math.max(prev.high, cur.high) < tol && isBullish(prev) && isBearish(cur))
    return { direction: "down", name: "Tweezer top", strength: 0.7,
      reason: "Tweezer top — two candles rejected the same high, potential resistance.",
      index: candles.length - 1 };
  if (Math.abs(prev.low - cur.low) / Math.max(prev.low, cur.low) < tol && isBearish(prev) && isBullish(cur))
    return { direction: "up", name: "Tweezer bottom", strength: 0.7,
      reason: "Tweezer bottom — two candles rejected the same low, potential support.",
      index: candles.length - 1 };
  return null;
}

// --- 3-candle patterns ---

export function detectMorningStar(candles: Candle[]): PatternVote | null {
  if (candles.length < 3) return null;
  const [a, b, c] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]];
  if (!a || !b || !c) return null;
  if (!isBearish(a) || !isBullish(c)) return null;
  if (body(a) < range(a) * 0.5) return null;
  if (body(b) > body(a) * 0.3) return null;
  if (c.close < bodyMidpoint(a)) return null;
  return { direction: "up", name: "Morning star", strength: 0.85,
    reason: "Morning star — large red, small indecision, strong green recovery.",
    index: candles.length - 1 };
}

export function detectEveningStar(candles: Candle[]): PatternVote | null {
  if (candles.length < 3) return null;
  const [a, b, c] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]];
  if (!a || !b || !c) return null;
  if (!isBullish(a) || !isBearish(c)) return null;
  if (body(a) < range(a) * 0.5) return null;
  if (body(b) > body(a) * 0.3) return null;
  if (c.close > bodyMidpoint(a)) return null;
  return { direction: "down", name: "Evening star", strength: 0.85,
    reason: "Evening star — large green, small indecision, strong red reversal.",
    index: candles.length - 1 };
}

export function detectThreeWhiteSoldiers(candles: Candle[]): PatternVote | null {
  if (candles.length < 3) return null;
  const [a, b, c] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]];
  if (!a || !b || !c) return null;
  if (!isBullish(a) || !isBullish(b) || !isBullish(c)) return null;
  if (b.close <= a.close || c.close <= b.close) return null;
  if (upperWick(a) > body(a) * 0.3 || upperWick(b) > body(b) * 0.3 || upperWick(c) > body(c) * 0.3) return null;
  return { direction: "up", name: "Three white soldiers", strength: 0.8,
    reason: "Three white soldiers — three consecutive strong green candles closing higher.",
    index: candles.length - 1 };
}

export function detectThreeBlackCrows(candles: Candle[]): PatternVote | null {
  if (candles.length < 3) return null;
  const [a, b, c] = [candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]];
  if (!a || !b || !c) return null;
  if (!isBearish(a) || !isBearish(b) || !isBearish(c)) return null;
  if (b.close >= a.close || c.close >= b.close) return null;
  if (lowerWick(a) > body(a) * 0.3 || lowerWick(b) > body(b) * 0.3 || lowerWick(c) > body(c) * 0.3) return null;
  return { direction: "down", name: "Three black crows", strength: 0.8,
    reason: "Three black crows — three consecutive strong red candles closing lower.",
    index: candles.length - 1 };
}

// --- Master scanner ---

export const ALL_DETECTORS = [
  detectDoji, detectSpinningTop, detectHammer, detectShootingStar,
  detectEngulfing, detectDarkCloudCover, detectPiercingLine, detectHarami,
  detectTweezers, detectMorningStar, detectEveningStar,
  detectThreeWhiteSoldiers, detectThreeBlackCrows,
] as const;

export function scanCandlePatterns(candles: Candle[]): PatternVote[] {
  const results: PatternVote[] = [];
  for (const detector of ALL_DETECTORS) {
    const vote = detector(candles);
    if (vote) results.push(vote);
  }
  return results;
}

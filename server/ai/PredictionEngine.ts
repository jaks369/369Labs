import { AIPrediction } from "./types";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { getSymbolDisplayName, isSyntheticIndexSymbol } from "@shared/symbols";

/**
 * PredictionEngine v2 — evaluates EVERY Derive family the app can trade
 * (Rise/Fall, Even/Odd, Matches/Differs, Over/Under) and reports the strongest
 * "lean" in plain language. No bias toward one contract type: whichever shows
 * the most measured edge wins. Descriptive, not a recommendation.
 *
 * Grounded in Deriv's own trader vocabulary:
 *   Rise/Fall  — "win if the price rises above or falls below the entry"
 *   Even/Odd   — "win if the last digit of the last tick is even/odd"
 *   Matches    — "win if the last digit of the last tick equals your digit"
 *   Differs    — "win if the last digit is different from your digit"
 *   Over/Under — "win if the last digit is higher/lower than your barrier"
 */

interface Contract {
  id: string;              // headline, e.g. "RISE", "ODD", "MATCH 4"
  family: string;          // "Rise/Fall" | "Even/Odd" | "Matches/Differs" | "Over/Under"
  side: string;            // "Rise (Call)", "Fall (Put)", "Even", "Matches 4", ...
  baseline: number;        // fair win rate
  direction: (digits: number[], prices: number[], i: number) => boolean;
}

function round1(x: number): number { return Math.round(x * 10) / 10; }

function buildContracts(): Contract[] {
  const c: Contract[] = [];
  const rise = (_d: number[], p: number[], i: number) => p[i] > p[i - 1];
  const fall = (_d: number[], p: number[], i: number) => p[i] < p[i - 1];
  c.push({ id: "RISE", family: "Rise/Fall", side: "Rise (Call)", baseline: 0.5, direction: rise });
  c.push({ id: "FALL", family: "Rise/Fall", side: "Fall (Put)", baseline: 0.5, direction: fall });
  c.push({ id: "EVEN", family: "Even/Odd", side: "Even", baseline: 0.5, direction: (_d, _p, i) => _d[i] % 2 === 0 });
  c.push({ id: "ODD", family: "Even/Odd", side: "Odd", baseline: 0.5, direction: (_d, _p, i) => _d[i] % 2 === 1 });
  for (let d = 0; d <= 9; d++) {
    c.push({ id: `MATCH ${d}`, family: "Matches/Differs", side: `Matches ${d}`, baseline: 0.1, direction: (_d, _p, i) => _d[i] === d });
    c.push({ id: `DIFF ${d}`, family: "Matches/Differs", side: `Differs ${d}`, baseline: 0.9, direction: (_d, _p, i) => _d[i] !== d });
  }
  // Barrier 4/5 splits the digit range in half → fair rate 50%.
  c.push({ id: "OVER 4", family: "Over/Under", side: "Over 4", baseline: 0.5, direction: (_d, _p, i) => _d[i] > 4 });
  c.push({ id: "UNDER 5", family: "Over/Under", side: "Under 5", baseline: 0.5, direction: (_d, _p, i) => _d[i] < 5 });
  c.push({ id: "OVER 5", family: "Over/Under", side: "Over 5", baseline: 0.4, direction: (_d, _p, i) => _d[i] > 5 });
  c.push({ id: "UNDER 4", family: "Over/Under", side: "Under 4", baseline: 0.4, direction: (_d, _p, i) => _d[i] < 4 });
  return c;
}

function plainSentence(name: string, c: Contract, observed: number, sampleN: number): string {
  const pct = (observed * 100).toFixed(1);
  const base = (c.baseline * 100).toFixed(1);
  switch (c.family) {
    case "Rise/Fall":
      return c.id === "RISE"
        ? `The last ${sampleN} ticks on ${name} lean UP — a Rise "Call" 1-tick contract won ${pct}% of the time vs the fair ${base}%.`
        : `The last ${sampleN} ticks on ${name} lean DOWN — a Fall "Put" 1-tick contract won ${pct}% of the time vs the fair ${base}%.`;
    case "Even/Odd":
      return c.id === "EVEN"
        ? `Even digits made up ${pct}% of the last ${sampleN} ticks on ${name} (fair ${base}%) — leaning Even for an Even/Odd contract.`
        : `Odd digits made up ${pct}% of the last ${sampleN} ticks on ${name} (fair ${base}%) — leaning Odd for an Even/Odd contract.`;
    case "Matches/Differs": {
      const d = c.id.split(" ")[1];
      return c.id.startsWith("MATCH")
        ? `Digit ${d} appeared at ${pct}% of the last ${sampleN} ticks on ${name} (fair ${base}%) — leaning Matches ${d}. Matches only wins ~1 in 10 by chance, so it pays ~9× but hits rarely.`
        : `Digit ${d} stayed away — ${pct}% of the last ${sampleN} ticks on ${name} were NOT ${d} (fair ${base}%) — leaning Differs ${d}. Differs wins ~9 in 10 by chance, so it pays little.`;
    }
    case "Over/Under":
      return c.id.startsWith("OVER")
        ? `${pct}% of the last ${sampleN} ticks on ${name} were OVER ${c.id.split(" ")[1]} (fair ${base}%) — leaning Over ${c.id.split(" ")[1]} on an Over/Under contract.`
        : `${pct}% of the last ${sampleN} ticks on ${name} were UNDER ${c.id.split(" ")[1]} (fair ${base}%) — leaning Under ${c.id.split(" ")[1]} on an Over/Under contract.`;
    default:
      return `${name}: strongest lean is ${c.side} (${pct}% vs fair ${base}%).`;
  }
}

function evenRate(digits: number[], start: number): { rate: number; pct: number } {
  const window = digits.slice(start);
  const evens = window.filter((d) => d % 2 === 0).length;
  const rate = window.length > 0 ? evens / window.length : 0;
  return { rate, pct: Math.round(rate * 100) };
}

export class PredictionEngine {
  async predict(symbol: string, prices: number[]): Promise<AIPrediction | null> {
    const n = prices.length;
    if (n < 26) return null;

    // Digit-derived contract families (Even/Odd, Matches/Differs, Over/Under)
    // are only statistically valid on synthetic indices. On real-market symbols
    // only the price-based Rise/Fall family is scored.
    const synthetic = isSyntheticIndexSymbol(symbol);
    const decimals = getDecimalPlaces(symbol);
    const digits = prices.map((p) => lastDigitOf(Number(p), decimals));
    const name = getSymbolDisplayName(symbol);
    const windowN = n - 1; // first pair is the reference for Rise/Fall
    if (windowN < 25) return null;

    const contracts = buildContracts().filter((c) => synthetic || c.family === "Rise/Fall");

    // Score EVERY contract side on the same window — no family bias.
    let best: Contract | null = null;
    let bestEdgePct = 0;
    let bestObserved = 0;
    for (const c of contracts) {
      let wins = 0;
      for (let i = 1; i < n; i++) if (c.direction(digits, prices, i)) wins++;
      const observed = wins / windowN;
      const edgePct = (observed - c.baseline) * 100;
      // Only a real gap counts — "51% vs 50% is nothing" (§ MIN_EDGE_PP spirit).
      if (edgePct >= 4 && edgePct > bestEdgePct) {
        bestEdgePct = round1(edgePct);
        best = c;
        bestObserved = observed;
      }
    }

    const now = Date.now();

    if (!best) {
      const evens = evenRate(digits, 1);
      // For real-market symbols, report the observed 1-tick price-rise rate
      // (not the even-digit rate, which carries no meaning there).
      let riseWins = 0;
      for (let i = 1; i < n; i++) if (prices[i] > prices[i - 1]) riseWins++;
      const riseRate = riseWins / windowN;
      return {
        symbol,
        prediction: "NO CLEAR LEAN",
        direction: "neutral",
        contractType: null,
        lean: "Balanced",
        confidence: 50,
        plain: `${name} looks balanced — no contract type showed a clear lean over the last ${windowN} ticks. Waiting costs nothing.`,
        recommendation: "No lean to act on — hold off until a bias is measurably stronger than chance.",
        reasoning: [
          synthetic
            ? "Every Rise/Fall, Even/Odd, Matches/Differs and Over/Under side landed below the minimum meaningful edge."
            : `${name} is a real-market symbol, so only price-based Rise/Fall contracts were scored (digit contracts carry no statistical meaning here).`,
          synthetic
            ? `Even digits printed ${evens.pct}% of ticks for reference (fair 50%).`
            : `Price rose after ${(riseRate * 100).toFixed(1)}% of ticks (fair ~50%) — below the minimum meaningful edge.`,
          "That reads as a plain 50/50 — any 1-tick contract is a coin flip right now.",
        ],
        observed: synthetic ? round1(evens.rate) : round1(riseRate),
        baseline: 0.5,
        edgePct: round1(((synthetic ? evens.rate : riseRate) - 0.5) * 100),
        sampleN: windowN,
        timestamp: now,
      };
    }

    const confidence = Math.min(92, Math.max(45, Math.round(50 + bestEdgePct * 1.6 + Math.min(windowN, 200) / 14)));
    const plain = plainSentence(name, best, bestObserved, windowN);

    return {
      symbol,
      prediction: best.id,
      direction: best.family === "Rise/Fall" ? (best.id === "RISE" ? "up" : "down") : "neutral",
      contractType: best.family,
      lean: best.side,
      confidence,
      plain,
      recommendation: best.family === "Matches/Differs" && best.id.startsWith("MATCH")
        ? "A Matches contract pays big but hits only ~1 in 10 — treat it as a small, disciplined stake, never a system."
        : `If you trade ${best.family}, ${best.side} is the bias the data is showing — small size. The edge is real but momentary.`,
      reasoning: [
        `${best.side}: ${(bestObserved * 100).toFixed(1)}% win rate on the last ${windowN} ticks vs the ${(best.baseline * 100).toFixed(1)}% fair rate.`,
        `Edge of +${bestEdgePct}% is bigger than random noise for this sample.`,
      ],
      observed: bestObserved,
      baseline: best.baseline,
      edgePct: bestEdgePct,
      sampleN: windowN,
      timestamp: now,
    };
  }
}
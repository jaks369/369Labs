import * as db from "../db";
import { AIInsight } from "./types";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { getSymbolDisplayName } from "@shared/symbols";

function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export class InsightEngine {
  async generateAll(): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];
    const symbols = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];
    const now = Date.now();

    for (const symbol of symbols) {
      try {
        const displayName = getSymbolDisplayName(symbol);
        const decimals = getDecimalPlaces(symbol);
        const ticks = await db.getTickHistory(symbol, 100);
        if (ticks.length < 20) continue;

        const prices = ticks.map((t: any) => Number(t.price)).filter((p: number) => !isNaN(p));
        const digits = prices.map(p => lastDigitOf(p, decimals));
        const n = digits.length;

        // ---- Parity lean (Even/Odd) — every digit family is explored, not just direction ----
        const evenCount = digits.filter((d) => d % 2 === 0).length;
        const evenPct = pctOf(evenCount, n);
        if (Math.abs(evenPct - 50) >= 5) {
          const isEven = evenPct > 50;
          insights.push({
            id: `parity_lean_${symbol}`,
            market: symbol,
            displayName,
            type: "digit_bias",
            message: `${isEven ? "Even" : "Odd"} digits made up ${evenPct}% of the last ${n} ticks on ${displayName} (fair 50%) — that's a nudge toward “${isEven ? "Even" : "Odd"}” on an Even/Odd contract. Not a guarantee.`,
            confidence: Math.min(80, Math.round(50 + Math.abs(evenPct - 50) * 3)),
            reasoning: [
              `Even digits: ${evenCount}/${n} (${evenPct}%)`,
              `Odd digits: ${n - evenCount}/${n} (${100 - evenPct}%)`,
              "Even/Odd pays ~90% on a win; a 5%+ tilt is the strongest digit-family signal currently visible.",
            ],
            timestamp: now,
          });
        }

        // Digit bias (Matches/Differs)
        const digitCounts: Record<number, number> = {};
        for (const d of digits) digitCounts[d] = (digitCounts[d] || 0) + 1;
        const sorted = Object.entries(digitCounts).sort((a, b) => b[1] - a[1]);
        const hottest = sorted[0];
        const coldest = sorted[sorted.length - 1];
        const distinctDigits = sorted.length;

        if (
          hottest &&
          Number(hottest[1]) > n * 0.15 &&
          distinctDigits >= 3 &&
          distinctDigits <= 8
        ) {
          const pct = pctOf(Number(hottest[1]), digits.length);
          const pctCold = pctOf(Number(coldest[1]), digits.length);
          const spread = pct - pctCold;
          if (spread >= 8) {
            insights.push({
              id: `digit_bias_${symbol}_${hottest[0]}`,
              market: symbol,
              displayName,
              type: "digit_bias",
              message: `Digit ${hottest[0]} appeared ${pct}% of the last ${n} ticks (fair 10%) — that's a nudge toward “Matches ${hottest[0]}” on a Matches/Differs contract. At fair 10% it should show up about half that often.`,
              confidence: Math.min(80, Math.round(pct)),
              reasoning: [
                `Digit ${hottest[0]}: ${hottest[1]}/${digits.length} (${pct}%)`,
                `Coldest digit ${coldest[0]}: ${coldest[1]}/${digits.length} (${pctCold}%)`,
                `A Matches ${hottest[0]} pays ~9× but only truly wins ~1 in 10 by chance — treat this as a tilt, not a system.`,
              ],
              timestamp: now,
            });
          }
        }

        // Over/Under lean (barrier 4/5 split — fair 50%)
        const over4Count = digits.filter((d) => d > 4).length;
        const over4Pct = pctOf(over4Count, n);
        if (Math.abs(over4Pct - 50) >= 5) {
          const leanOver = over4Pct > 50;
          insights.push({
            id: `overunder_lean_${symbol}`,
            market: symbol,
            displayName,
            type: "digit_bias",
            message: `${over4Pct}% of the last ${n} ticks on ${displayName} were OVER 4 (fair 50%) — that's a tilt toward ${leanOver ? "Over 4" : "Under 5"} on an Over/Under contract.`,
            confidence: Math.min(80, Math.round(50 + Math.abs(over4Pct - 50) * 3)),
            reasoning: [
              `Over 4 (digits 5–9): ${over4Count}/${digits.length} (${over4Pct}%)`,
              `Under 5 (digits 0–4): ${digits.length - over4Count}/${digits.length} (${100 - over4Pct}%)`,
              `Over/Under pays ~90% on a 50/50 barrier; a ±5pp tilt is notable in a 100-tick window.`,
            ],
            timestamp: now,
          });
        }

        // Volatility regime — plain language
        const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        const variance = prices.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / prices.length;
        const std = Math.sqrt(variance);
        const recentPrices = prices.slice(-20);
        const recentMean = recentPrices.reduce((a: number, b: number) => a + b, 0) / recentPrices.length;
        const recentVar = recentPrices.reduce((a: number, b: number) => a + (b - recentMean) ** 2, 0) / recentPrices.length;
        const recentStd = Math.sqrt(recentVar);

        if (recentStd > std * 1.5 && std > 0) {
          insights.push({
            id: `vol_spike_${symbol}`,
            market: symbol,
            displayName,
            type: "volatility_change",
            message: `${displayName} has suddenly gotten wilder — recent ticks move about ${(recentStd / (std || 1)).toFixed(1)}× their normal range. Digits stay random, so use smaller stakes; there is no “certain” side.`,
            confidence: 75,
            reasoning: [
              `Recent swings: ${recentStd.toFixed(4)} vs the recent baseline ${std.toFixed(4)}.`,
              `Bigger price moves do NOT change the fair 10%/50%/90% digits.`,
              `Higher variance mainly means you may be whipsawed more — size down.`,
            ],
            timestamp: now,
          });
        } else if (recentStd < std * 0.5 && std > 0) {
          insights.push({
            id: `vol_compress_${symbol}`,
            market: symbol,
            displayName,
            type: "volatility_change",
            message: `${displayName} has gone quiet — recent swings are ~${(recentStd / std).toFixed(2)}× their normal size. A quiet market often ends with a sharp tick, but for the digits that tiny tick is still 50/50. Don't chase a “breakout”.`,
            confidence: 65,
            reasoning: [
              `Recent swings: ${recentStd.toFixed(4)} vs the recent baseline ${std.toFixed(4)}.`,
              `Calm feeds a sharp move some of the time — not most of the time.`,
              `For Even/Odd or Matches the digit distribution stays fair while it's quiet.`,
            ],
            timestamp: now,
          });
        }

        // Drift (context only — not a Rise/Fall edge)
        const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
        const secondHalf = prices.slice(Math.floor(prices.length / 2));
        const firstMean = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
        const secondMean = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
        const changePct = firstMean !== 0 ? ((secondMean - firstMean) / Math.abs(firstMean)) * 100 : 0;

        if (Math.abs(changePct) > 0.05) {
          insights.push({
            id: `trend_${symbol}`,
            market: symbol,
            displayName,
            type: "momentum_change",
            message: `${displayName} drifted ${changePct > 0 ? "up" : "down"} about ${Math.abs(changePct).toFixed(3)}% across the last ${prices.length} ticks. That's a mild drift, NOT a strong Rise/Fall edge — a 1-tick Rise/Fall literally looks like 50/50.`,
            confidence: Math.min(55, Math.round(Math.abs(changePct) * 800 + 35)),
            reasoning: [
              `First half average: ${firstMean.toFixed(4)}`,
              `Second half average: ${secondMean.toFixed(4)}`,
              `Drift this small does not beat the house's built-in edge.`,
            ],
            timestamp: now,
          });
        }
      } catch {
        continue;
      }
    }

    return insights;
  }
}
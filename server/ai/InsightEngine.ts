import * as db from "../db";
import { AIInsight } from "./types";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { getSymbolDisplayName } from "@shared/symbols";

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

        // Digit distribution analysis
        const digitCounts: Record<number, number> = {};
        for (const d of digits) digitCounts[d] = (digitCounts[d] || 0) + 1;
        const sorted = Object.entries(digitCounts).sort((a, b) => b[1] - a[1]);
        const hottest = sorted[0];
        const coldest = sorted[sorted.length - 1];
        const distinctDigits = sorted.length;

        // Hottest first | second half splits to detect an actual forward-holding bias.
        // A "100% digit 0" on a coarse 1-second index is a rounding/scale artifact, not
        // an edge — so we require the digit to vary within the window before claiming bias.
        if (
          hottest &&
          Number(hottest[1]) > digits.length * 0.15 &&
          distinctDigits >= 3 &&
          distinctDigits <= 8
        ) {
          const pct = (Number(hottest[1]) / digits.length) * 100;
          const pctCold = (Number(coldest[1]) / digits.length) * 100;
          const spread = pct - pctCold;
          // Only surface as a candidate when the hot digit clearly dominates the cold one.
          if (spread >= 8) {
            insights.push({
              // Stable content-derived ID (no Date.now): AIOrchestrator dedupes
              // the live feed by insight.id, so a time-based ID meant the same
              // bias was re-emitted every poll.
              id: `digit_bias_${symbol}_${hottest[0]}`,
              market: symbol,
              displayName,
              type: "digit_bias",
              message: `${displayName}: Digit ${hottest[0]} appears ${pct.toFixed(0)}% of the time — a noticeable (not guaranteed) frequency tilt.`,
              confidence: Math.min(80, Math.round(pct)),
              reasoning: [
                `Digit ${hottest[0]} count: ${hottest[1]} / ${digits.length} (${pct.toFixed(0)}%)`,
                `Coldest digit ${coldest[0]}: ${coldest[1]} / ${digits.length} (${pctCold.toFixed(0)}%)`,
                `Distinct digits sampled: ${distinctDigits}`,
              ],
              timestamp: now,
            });
          }
        }

        // Volatility regime detection
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
            message: `${displayName}: Volatility spike detected — recent std ${recentStd.toFixed(4)} vs baseline ${std.toFixed(4)}. Caution advised.`,
            confidence: 75,
            reasoning: [`Recent std: ${recentStd.toFixed(4)}`, `Baseline std: ${std.toFixed(4)}`, `Ratio: ${(recentStd / std).toFixed(2)}x`],
            timestamp: now,
          });
        } else if (recentStd < std * 0.5 && std > 0) {
          insights.push({
            id: `vol_compress_${symbol}`,
            market: symbol,
            displayName,
            type: "volatility_change",
            message: `${displayName}: Volatility compression — market noise decreased. Potential breakout imminent.`,
            confidence: 65,
            reasoning: [`Recent std: ${recentStd.toFixed(4)}`, `Baseline std: ${std.toFixed(4)}`, `Ratio: ${(recentStd / std).toFixed(2)}x`],
            timestamp: now,
          });
        }

        // Trend strength
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
            message: `${displayName}: ${changePct > 0 ? "Upward" : "Downward"} trend of ${Math.abs(changePct).toFixed(3)}% over last ${prices.length} ticks.`,
            confidence: Math.min(80, Math.round(Math.abs(changePct) * 1000)),
            reasoning: [`First half avg: ${firstMean.toFixed(4)}`, `Second half avg: ${secondMean.toFixed(4)}`, `Change: ${changePct.toFixed(3)}%`],
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

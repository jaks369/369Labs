import * as db from "../db";
import { AIInsight } from "./types";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";

export class InsightEngine {
  async generateAll(): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];
    const symbols = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];
    const now = Date.now();

    for (const symbol of symbols) {
      try {
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

        if (hottest && Number(hottest[1]) > digits.length * 0.15) {
          insights.push({
            id: `digit_bias_${symbol}_${now}`,
            market: symbol,
            message: `${symbol}: Digit ${hottest[0]} appears ${((Number(hottest[1]) / digits.length) * 100).toFixed(0)}% of the time — significant bias.`,
            confidence: Math.min(90, Math.round((Number(hottest[1]) / digits.length) * 100)),
            reasoning: [`Digit ${hottest[0]} count: ${hottest[1]} / ${digits.length}`, `Expected ~10% per digit, actual ${((Number(hottest[1]) / digits.length) * 100).toFixed(0)}%`],
            timestamp: now,
          });
        }

        // Volatility regime detection
        const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        const variance = prices.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / prices.length;
        const std = Math.sqrt(variance);
        const recentPrices = prices.slice(-20);
        const recentMean = recentPrices.reduce((a: number, b: number) => a + b, 0) / recentPrices.length;
        const recentVar = recentPrices.reduce((a: number, b: number) => a + (b - recentMean) ** 2, 0) / recentPrices.length;
        const recentStd = Math.sqrt(recentVar);

        if (recentStd > std * 1.5) {
          insights.push({
            id: `vol_spike_${symbol}_${now}`,
            market: symbol,
            message: `${symbol}: Volatility spike detected — recent std ${recentStd.toFixed(4)} vs baseline ${std.toFixed(4)}. Caution advised.`,
            confidence: 75,
            reasoning: [`Recent std: ${recentStd.toFixed(4)}`, `Baseline std: ${std.toFixed(4)}`, `Ratio: ${(recentStd / std).toFixed(2)}x`],
            timestamp: now,
          });
        } else if (recentStd < std * 0.5) {
          insights.push({
            id: `vol_compress_${symbol}_${now}`,
            market: symbol,
            message: `${symbol}: Volatility compression — market noise decreased. Potential breakout imminent.`,
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
            id: `trend_${symbol}_${now}`,
            market: symbol,
            message: `${symbol}: ${changePct > 0 ? "Upward" : "Downward"} trend of ${Math.abs(changePct).toFixed(3)}% over last ${prices.length} ticks.`,
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

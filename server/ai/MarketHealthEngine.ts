import * as db from "../db";
import { MarketHealth } from "./types";
import { VOLATILITY_SYMBOLS } from "@shared/symbols";

const SYMBOL_NAMES: Record<string, string> = Object.fromEntries(
  VOLATILITY_SYMBOLS.map(s => [s.symbol, s.displayName.replace(" Index", "")])
);

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));
}

export class MarketHealthEngine {
  async score(symbol: string, prices: number[]): Promise<MarketHealth> {
    const displayName = SYMBOL_NAMES[symbol] || symbol;
    if (prices.length < 10) {
      return {
        symbol, displayName,
        score: 50, trend: 50, momentum: 50, noise: 50,
        volatility: "Medium", tradeQuality: 5, recommendation: "Insufficient data",
      };
    }

    const half = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, half);
    const secondHalf = prices.slice(half);

    const firstMean = mean(firstHalf);
    const secondMean = mean(secondHalf);
    const changePct = firstMean !== 0 ? ((secondMean - firstMean) / Math.abs(firstMean)) * 100 : 0;
    const trendScore = Math.min(Math.abs(changePct) * 500, 100);

    const vol = stddev(prices);
    const baselineVol = stddev(prices.slice(0, Math.min(20, prices.length)));
    const recentVol = stddev(prices.slice(-Math.min(20, prices.length)));
    const momentumRaw = baselineVol !== 0 ? ((recentVol - baselineVol) / baselineVol) * 100 : 0;
    const momentumScore = Math.max(0, Math.min(100, 50 + momentumRaw));

    const pricesMean = mean(prices);
    const noiseScore = pricesMean !== 0 ? Math.min((vol / Math.abs(pricesMean)) * 10000, 100) : 50;

    const volLabel = noiseScore > 70 ? "High" : noiseScore > 40 ? "Medium" : "Low";

    const tradeQuality = Math.max(1, Math.min(10, 10 - (noiseScore / 10) + (trendScore / 20)));

    let recommendation = "Suitable for trend-following strategies";
    if (noiseScore > 70) recommendation = "High noise ΓÇö consider filtering or waiting";
    if (trendScore < 20 && noiseScore > 60) recommendation = "Unfavorable ΓÇö avoid trading";
    if (trendScore > 70 && noiseScore < 40) recommendation = "Excellent conditions for trend-following strategies";

    const overallScore = Math.round((trendScore + momentumScore + (100 - noiseScore)) / 3);

    return {
      symbol,
      displayName,
      score: Math.round(overallScore),
      trend: Math.round(trendScore),
      momentum: Math.round(momentumScore),
      noise: Math.round(noiseScore),
      volatility: volLabel as "Low" | "Medium" | "High",
      tradeQuality: Math.round(tradeQuality * 10) / 10,
      recommendation,
    };
  }

  async scoreAll(): Promise<MarketHealth[]> {
    const symbols = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];
    const results: MarketHealth[] = [];
    for (const symbol of symbols) {
      try {
        const ticks = await db.getTickHistory(symbol, 60);
        const prices = ticks.map((t: any) => Number(t.price)).filter((p: number) => !isNaN(p));
        results.push(await this.score(symbol, prices));
      } catch {
        continue;
      }
    }
    return results;
  }
}

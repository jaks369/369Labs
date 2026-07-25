import * as db from "../db";
import { AIPrediction } from "./types";

export class PredictionEngine {
  async predict(symbol: string, prices: number[]): Promise<AIPrediction | null> {
    if (prices.length < 20) return null;

    const now = Date.now();

    // Short-term trend (last 10 ticks vs previous 10)
    const recent = prices.slice(-10);
    const older = prices.slice(-20, -10);
    const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderMean = older.reduce((a, b) => a + b, 0) / older.length;
    const shortTrend = olderMean !== 0 ? ((recentMean - olderMean) / Math.abs(olderMean)) : 0;

    // Momentum: rate of change over last 5 ticks
    const last5 = prices.slice(-5);
    const momentum = last5.length >= 2 ? (last5[last5.length - 1] - last5[0]) / Math.abs(last5[0] || 1) : 0;

    // Volatility: std dev of recent prices
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
    const std = Math.sqrt(variance);

    // Combined prediction
    const compositeScore = shortTrend * 0.6 + momentum * 0.4;
    const absScore = Math.abs(compositeScore);

    if (absScore < 0.001) {
      return {
        symbol,
        prediction: "SIDEWAYS",
        confidence: Math.round(Math.max(30, 70 - absScore * 10000)),
        reasoning: [
          `Short trend: ${(shortTrend * 100).toFixed(3)}%`,
          `Momentum: ${(momentum * 100).toFixed(3)}%`,
          `Volatility: ${std.toFixed(4)}`,
          "Direction unclear — insufficient momentum.",
        ],
        timestamp: now,
      };
    }

    const direction = compositeScore > 0 ? "RISE" : "FALL";
    const confidence = Math.min(85, Math.round(Math.abs(compositeScore) * 5000 + 30));

    const reasons = [
      `${direction === "RISE" ? "Upward" : "Downward"} short-term trend: ${(shortTrend * 100).toFixed(3)}%`,
      `Momentum score: ${(momentum * 100).toFixed(3)}%`,
      `Volatility: ${std.toFixed(4)}`,
    ];

    if (absScore > 0.01) reasons.push("Strong directional bias detected.");
    if (std > mean * 0.01) reasons.push("Elevated volatility — wider stop-losses recommended.");

    return {
      symbol,
      prediction: direction,
      confidence,
      reasoning: reasons,
      timestamp: now,
    };
  }
}

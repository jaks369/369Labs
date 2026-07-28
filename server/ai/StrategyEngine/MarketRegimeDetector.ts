import * as db from "../../db";
import type { MarketRegime, RegimeResult } from "./StrategyTypes";
import { getAllVolatilitySymbols } from "@shared/symbols";

export class MarketRegimeDetector {
  async detect(symbol: string): Promise<RegimeResult> {
    const ticks = await db.getTickHistory(symbol, 100);
    const prices = ticks.map((t) => Number(t.price)).filter((p) => !isNaN(p));

    if (prices.length < 20) {
      return {
        regime: "sideways",
        confidence: 0,
        indicators: { trend: 0, momentum: 0, volatility: 0, noise: 0 },
        explanation: "Insufficient data for regime detection",
      };
    }

    const trend = this.calcTrendStrength(prices);
    const momentum = this.calcMomentum(prices);
    const volatility = this.calcVolatility(prices);
    const noise = this.calcNoise(prices);

    let regime: MarketRegime;
    let confidence: number;
    let explanation: string;

    const isTrending = Math.abs(trend) > 30;
    const isHighVol = volatility > 60;
    const isLowVol = volatility < 25;
    const isNoisy = noise > 50;

    if (isHighVol && isNoisy && !isTrending) {
      regime = "volatile";
      confidence = Math.round(Math.min(95, (volatility + noise) / 2));
      explanation = "High volatility with elevated noise and weak trend — choppy, volatile regime";
    } else if (isHighVol && isTrending) {
      regime = trend > 0 ? "bullish" : "bearish";
      confidence = Math.round(Math.min(90, (Math.abs(trend) + 100 - volatility) / 2));
      explanation = `Strong ${trend > 0 ? "upward" : "downward"} trend with high volatility — directional momentum`;
    } else if (isLowVol && !isTrending) {
      regime = "calm";
      confidence = Math.round(Math.min(85, (100 - volatility + 100 - noise) / 2));
      explanation = "Low volatility and noise — calm, stable conditions";
    } else if (isTrending && !isHighVol) {
      regime = trend > 0 ? "bullish" : "bearish";
      confidence = Math.round(Math.min(85, Math.abs(trend) + 30));
      explanation = `Steady ${trend > 0 ? "upward" : "downward"} trend with moderate volatility`;
    } else {
      regime = "sideways";
      confidence = Math.round(Math.min(60, (100 - Math.abs(trend))));
      explanation = "No dominant trend, moderate volatility — range-bound conditions";
    }

    return {
      regime,
      confidence,
      indicators: { trend: Math.round(trend), momentum: Math.round(momentum), volatility: Math.round(volatility), noise: Math.round(noise) },
      explanation,
    };
  }

  async detectAll(): Promise<Record<string, RegimeResult>> {
    const symbols = getAllVolatilitySymbols();
    const results: Record<string, RegimeResult> = {};
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.detect(symbol);
      } catch {
        continue;
      }
    }
    return results;
  }

  async detectFromPrices(prices: number[]): Promise<RegimeResult> {
    if (prices.length < 20) {
      return { regime: "sideways", confidence: 0, indicators: { trend: 0, momentum: 0, volatility: 0, noise: 0 }, explanation: "Insufficient data" };
    }

    const trend = this.calcTrendStrength(prices);
    const momentum = this.calcMomentum(prices);
    const volatility = this.calcVolatility(prices);
    const noise = this.calcNoise(prices);

    let regime: MarketRegime;
    if (volatility > 60 && noise > 50 && Math.abs(trend) < 30) regime = "volatile";
    else if (volatility > 50 && Math.abs(trend) > 30) regime = trend > 0 ? "bullish" : "bearish";
    else if (volatility < 25 && Math.abs(trend) < 20) regime = "calm";
    else if (Math.abs(trend) > 30) regime = trend > 0 ? "bullish" : "bearish";
    else regime = "sideways";

    return {
      regime,
      confidence: Math.round(Math.min(90, (100 - noise + Math.abs(trend)) / 2 + 20)),
      indicators: { trend: Math.round(trend), momentum: Math.round(momentum), volatility: Math.round(volatility), noise: Math.round(noise) },
      explanation: `Regime classified as ${regime} based on trend(${trend.toFixed(0)}%), vol(${volatility.toFixed(0)}%), noise(${noise.toFixed(0)}%)`,
    };
  }

  private calcTrendStrength(prices: number[]): number {
    const half = Math.floor(prices.length / 2);
    const first = prices.slice(0, half);
    const second = prices.slice(half);
    const fMean = first.reduce((a, b) => a + b, 0) / first.length;
    const sMean = second.reduce((a, b) => a + b, 0) / second.length;
    const changePct = fMean !== 0 ? ((sMean - fMean) / Math.abs(fMean)) * 100 : 0;
    const recent = prices.slice(-10);
    const rMean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const older = prices.slice(-20, -10);
    const oMean = older.reduce((a, b) => a + b, 0) / older.length;
    const shortTrend = oMean !== 0 ? ((rMean - oMean) / Math.abs(oMean)) * 100 : 0;
    return changePct * 0.4 + shortTrend * 0.6;
  }

  private calcMomentum(prices: number[]): number {
    const last5 = prices.slice(-5);
    if (last5.length < 2) return 0;
    const changes = last5.map((p, i) => i > 0 ? p - last5[i - 1] : 0).slice(1);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    return mean !== 0 ? (avgChange / Math.abs(mean)) * 10000 : 0;
  }

  private calcVolatility(prices: number[]): number {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const std = Math.sqrt(variance);
    return Math.min(100, mean !== 0 ? (std / Math.abs(mean)) * 10000 : 0);
  }

  private calcNoise(prices: number[]): number {
    let directional = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) directional++;
      else directional--;
    }
    const netDirectionality = Math.abs(directional) / prices.length;
    return Math.round((1 - netDirectionality) * 100);
  }
}

export const marketRegimeDetector = new MarketRegimeDetector();

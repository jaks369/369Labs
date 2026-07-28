import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class SimpleMovingAverageCrossover extends BaseStrategy {
  meta: StrategyMeta = {
    id: "sma_crossover",
    name: "SMA Crossover",
    description: "Generates signals when fast SMA crosses above (BUY) or below (SELL) slow SMA",
    category: "trend_following",
    version: "1.0.0",
    minDataPoints: 50,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices, symbol } = market;
    const fastPeriod = 10;
    const slowPeriod = 30;

    if (prices.length < slowPeriod) {
      return {
        strategyId: this.meta.id,
        strategyName: this.meta.name,
        category: this.meta.category,
        action: "WAIT",
        confidence: 0,
        risk: 100,
        riskRewardRatio: 0,
        explanation: "Insufficient data for SMA analysis",
        reasoning: [`Need at least ${slowPeriod} price points, have ${prices.length}`],
        timestamp: Date.now(),
      };
    }

    const fastSMA = this.sma(prices, fastPeriod);
    const slowSMA = this.sma(prices, slowPeriod);
    const prevFast = fastSMA[fastSMA.length - 2];
    const currFast = fastSMA[fastSMA.length - 1];
    const prevSlow = slowSMA[slowSMA.length - 2];
    const currSlow = slowSMA[slowSMA.length - 1];

    const prevDiff = prevFast - prevSlow;
    const currDiff = currFast - currSlow;

    const trend = this.calculateTrend(prices);

    if (prevDiff <= 0 && currDiff > 0) {
      const confidence = this.calculateConfidence(Math.min(85, Math.abs(currDiff) * 2000 + 50));
      return {
        strategyId: this.meta.id,
        strategyName: this.meta.name,
        category: this.meta.category,
        action: "BUY",
        confidence,
        risk: this.calculateRisk(100 - confidence, 100 - trend),
        riskRewardRatio: this.calculateRiskRewardRatio(confidence, 100 - trend),
        explanation: `Bullish crossover: fast SMA (${currFast.toFixed(2)}) crossed above slow SMA (${currSlow.toFixed(2)})`,
        reasoning: [
          `Fast SMA (${fastPeriod}): ${currFast.toFixed(4)} → ${currFast.toFixed(4)}`,
          `Slow SMA (${slowPeriod}): ${currSlow.toFixed(4)} → ${currSlow.toFixed(4)}`,
          `Trend strength: ${trend}%`,
        ],
        timestamp: Date.now(),
      };
    }

    if (prevDiff >= 0 && currDiff < 0) {
      const confidence = this.calculateConfidence(Math.min(85, Math.abs(currDiff) * 2000 + 50));
      return {
        strategyId: this.meta.id,
        strategyName: this.meta.name,
        category: this.meta.category,
        action: "SELL",
        confidence,
        risk: this.calculateRisk(100 - confidence, 100 - trend),
        riskRewardRatio: this.calculateRiskRewardRatio(confidence, 100 - trend),
        explanation: `Bearish crossover: fast SMA (${currFast.toFixed(2)}) crossed below slow SMA (${currSlow.toFixed(2)})`,
        reasoning: [
          `Fast SMA (${fastPeriod}): ${prevFast.toFixed(4)} → ${currFast.toFixed(4)}`,
          `Slow SMA (${slowPeriod}): ${prevSlow.toFixed(4)} → ${currSlow.toFixed(4)}`,
          `Trend strength: ${trend}%`,
        ],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id,
      strategyName: this.meta.name,
      category: this.meta.category,
      action: "WAIT",
      confidence: 30,
      risk: 50,
      riskRewardRatio: 0.6,
      explanation: `No crossover detected — fast SMA (${currFast.toFixed(2)}) is ${currDiff > 0 ? "above" : "below"} slow SMA (${currSlow.toFixed(2)})`,
      reasoning: [
        `Fast SMA: ${currFast.toFixed(4)}`,
        `Slow SMA: ${currSlow.toFixed(4)}`,
        `Difference: ${currDiff.toFixed(4)}`,
      ],
      timestamp: Date.now(),
    };
  }

  private sma(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j];
      result.push(sum / period);
    }
    return result;
  }

  private calculateTrend(prices: number[]): number {
    const half = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, half);
    const secondHalf = prices.slice(half);
    const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const changePct = firstMean !== 0 ? ((secondMean - firstMean) / Math.abs(firstMean)) * 100 : 0;
    return Math.min(100, Math.max(0, Math.abs(changePct) * 500));
  }
}

export const smaCrossover = new SimpleMovingAverageCrossover();

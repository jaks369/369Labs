import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class MACDStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "macd",
    name: "MACD",
    description: "Uses MACD line, signal line crossovers, and histogram divergence for trend signals",
    category: "trend_following",
    version: "1.0.0",
    minDataPoints: 40,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices, symbol } = market;
    if (prices.length < 40) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: "Insufficient data for MACD", reasoning: [`Need 40+ points, have ${prices.length}`], timestamp: Date.now() };
    }

    const ema12 = this.ema(prices, 12);
    const ema26 = this.ema(prices, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = this.ema(macdLine, 9);
    const histogram = macdLine.slice(-signalLine.length).map((v, i) => v - signalLine[i]);

    const currMacd = macdLine[macdLine.length - 1];
    const prevMacd = macdLine[macdLine.length - 2];
    const currSignal = signalLine[signalLine.length - 1];
    const prevSignal = signalLine[signalLine.length - 2];
    const currHist = histogram[histogram.length - 1];

    const trendStrength = this.calculateTrendStrength(prices);
    const prevDiff = prevMacd - prevSignal;
    const currDiff = currMacd - currSignal;

    if (prevDiff <= 0 && currDiff > 0) {
      const confidence = this.calculateConfidence(55 + trendStrength * 0.3 + Math.abs(currHist) * 500);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY", confidence, risk: this.calculateRisk(100 - trendStrength, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(confidence, 100 - trendStrength),
        explanation: `Bullish MACD crossover: MACD (${currMacd.toFixed(4)}) crossed above signal (${currSignal.toFixed(4)})`,
        reasoning: [`MACD: ${prevMacd.toFixed(4)} → ${currMacd.toFixed(4)}`, `Signal: ${prevSignal.toFixed(4)} → ${currSignal.toFixed(4)}`, `Histogram: ${currHist.toFixed(4)}`, `Trend strength: ${trendStrength.toFixed(0)}%`],
        timestamp: Date.now(),
      };
    }

    if (prevDiff >= 0 && currDiff < 0) {
      const confidence = this.calculateConfidence(55 + trendStrength * 0.3 + Math.abs(currHist) * 500);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "SELL", confidence, risk: this.calculateRisk(100 - trendStrength, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(confidence, 100 - trendStrength),
        explanation: `Bearish MACD crossover: MACD (${currMacd.toFixed(4)}) crossed below signal (${currSignal.toFixed(4)})`,
        reasoning: [`MACD: ${prevMacd.toFixed(4)} → ${currMacd.toFixed(4)}`, `Signal: ${prevSignal.toFixed(4)} → ${currSignal.toFixed(4)}`, `Histogram: ${currHist.toFixed(4)}`, `Trend strength: ${trendStrength.toFixed(0)}%`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: currMacd > currSignal ? "BUY" : "SELL",
      confidence: 35, risk: 50,
      riskRewardRatio: 0.7,
      explanation: `MACD ${currMacd > currSignal ? "above" : "below"} signal — no crossover, existing ${currMacd > currSignal ? "bullish" : "bearish"} alignment`,
      reasoning: [`MACD: ${currMacd.toFixed(4)}`, `Signal: ${currSignal.toFixed(4)}`, `Trend: ${trendStrength.toFixed(0)}%`],
      timestamp: Date.now(),
    };
  }

  private ema(data: number[], period: number): number[] {
    const result: number[] = [];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(ema);
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  private calculateTrendStrength(prices: number[]): number {
    const half = Math.floor(prices.length / 2);
    const first = prices.slice(0, half);
    const second = prices.slice(half);
    const fMean = first.reduce((a, b) => a + b, 0) / first.length;
    const sMean = second.reduce((a, b) => a + b, 0) / second.length;
    const change = fMean !== 0 ? Math.abs((sMean - fMean) / fMean) * 100 : 0;
    return Math.min(100, change * 200);
  }
}

export const macdStrategy = new MACDStrategy();

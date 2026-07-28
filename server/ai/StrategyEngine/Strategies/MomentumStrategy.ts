import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class MomentumStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "momentum",
    name: "Price Momentum",
    description: "Measures rate of price change over lookback period to detect accelerating trends",
    category: "momentum",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 20) {
      return this.wait(`Need 20+ points, have ${prices.length}`);
    }

    const period = 10;
    const currROC = this.roc(prices, period);
    const prevROC = this.roc(prices.slice(0, -1), period);
    const acceleration = currROC - prevROC;

    const volatility = this.calcStddev(prices);
    const mean = this.calcMean(prices);
    const volRatio = mean !== 0 ? volatility / Math.abs(mean) : 0;

    if (currROC > 0.005 && acceleration > 0) {
      const strength = Math.min(100, currROC * 10000);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY", confidence: this.calculateConfidence(50 + strength),
        risk: this.calculateRisk(Math.round(volRatio * 10000), 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, Math.round(volRatio * 10000)),
        explanation: `Positive momentum accelerating — ROC ${(currROC * 100).toFixed(2)}% with acceleration ${(acceleration * 100).toFixed(2)}%`,
        reasoning: [`ROC(${period}): ${(currROC * 100).toFixed(2)}%`, `Acceleration: ${(acceleration * 100).toFixed(2)}%`, `Vol ratio: ${(volRatio * 10000).toFixed(1)}`],
        timestamp: Date.now(),
      };
    }

    if (currROC < -0.005 && acceleration < 0) {
      const strength = Math.min(100, Math.abs(currROC) * 10000);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "SELL", confidence: this.calculateConfidence(50 + strength),
        risk: this.calculateRisk(Math.round(volRatio * 10000), 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, Math.round(volRatio * 10000)),
        explanation: `Negative momentum accelerating — ROC ${(currROC * 100).toFixed(2)}% with acceleration ${(acceleration * 100).toFixed(2)}%`,
        reasoning: [`ROC(${period}): ${(currROC * 100).toFixed(2)}%`, `Acceleration: ${(acceleration * 100).toFixed(2)}%`, `Vol ratio: ${(volRatio * 10000).toFixed(1)}`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: currROC > 0 ? "BUY" : "SELL",
      confidence: 30, risk: 50,
      riskRewardRatio: 0.6,
      explanation: `Momentum ${currROC > 0 ? "positive" : "negative"} but not accelerating — ROC ${(currROC * 100).toFixed(2)}%`,
      reasoning: [`ROC(${period}): ${(currROC * 100).toFixed(2)}%`, `Acceleration: ${(acceleration * 100).toFixed(2)}%`],
      timestamp: Date.now(),
    };
  }

  private roc(data: number[], period: number): number {
    if (data.length < period + 1) return 0;
    const current = data[data.length - 1];
    const previous = data[data.length - 1 - period];
    return previous !== 0 ? (current - previous) / previous : 0;
  }

  private calcMean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  }

  private calcStddev(arr: number[]): number {
    const m = this.calcMean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const momentumStrategy = new MomentumStrategy();

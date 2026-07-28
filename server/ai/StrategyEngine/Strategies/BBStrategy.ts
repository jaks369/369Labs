import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class BollingerBandsStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "bollinger_bands",
    name: "Bollinger Bands",
    description: "Detects overbought/oversold conditions and squeeze/expansion events using Bollinger Bands",
    category: "mean_reversion",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) {
      return this.wait("Insufficient data", [`Need 30+ points, have ${prices.length}`]);
    }

    const period = 20;
    const multiplier = 2;
    const { middle, upper, lower, bandwidth } = this.calcBB(prices, period, multiplier);
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const bbPercent = (lastPrice - lower) / (upper - lower);

    const squeezeThreshold = 0.05;
    const isSqueeze = bandwidth < squeezeThreshold;
    const prevSqueeze = this.calcBB(prices.slice(0, -1), period, multiplier).bandwidth < squeezeThreshold;

    if (isSqueeze && !prevSqueeze) {
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "WAIT", confidence: 70, risk: 30,
        riskRewardRatio: 2.33,
        explanation: `Bollinger Band squeeze detected (bandwidth: ${(bandwidth * 100).toFixed(2)}%) — potential breakout imminent`,
        reasoning: [`Bandwidth: ${(bandwidth * 100).toFixed(2)}%`, `Upper: ${upper.toFixed(4)}`, `Middle: ${middle.toFixed(4)}`, `Lower: ${lower.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`],
        timestamp: Date.now(),
      };
    }

    if (lastPrice > upper) {
      const distance = ((lastPrice - upper) / upper) * 100;
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "SELL", confidence: this.calculateConfidence(50 + distance * 10),
        risk: this.calculateRisk(40, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + distance * 10, 40),
        explanation: `Price (${lastPrice.toFixed(2)}) touched upper band (${upper.toFixed(2)}) — potential overbought, mean reversion expected`,
        reasoning: [`BB%: ${(bbPercent * 100).toFixed(0)}%`, `Distance above upper: ${distance.toFixed(2)}%`, `Bandwidth: ${(bandwidth * 100).toFixed(2)}%`],
        timestamp: Date.now(),
      };
    }

    if (lastPrice < lower) {
      const distance = ((lower - lastPrice) / lower) * 100;
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY", confidence: this.calculateConfidence(50 + distance * 10),
        risk: this.calculateRisk(40, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + distance * 10, 40),
        explanation: `Price (${lastPrice.toFixed(2)}) touched lower band (${lower.toFixed(2)}) — potential oversold, mean reversion expected`,
        reasoning: [`BB%: ${(bbPercent * 100).toFixed(0)}%`, `Distance below lower: ${distance.toFixed(2)}%`, `Bandwidth: ${(bandwidth * 100).toFixed(2)}%`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: "WAIT", confidence: 30, risk: 50,
      riskRewardRatio: 0.6,
      explanation: `Price within bands — BB% at ${(bbPercent * 100).toFixed(0)}%`,
      reasoning: [`Upper: ${upper.toFixed(4)}`, `Lower: ${lower.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `BB%: ${(bbPercent * 100).toFixed(0)}%`],
      timestamp: Date.now(),
    };
  }

  private calcBB(data: number[], period: number, mult: number) {
    const middle = this.sma(data, period);
    const lastMid = middle[middle.length - 1];
    const slice = data.slice(-period);
    const variance = slice.reduce((a, b) => a + (b - lastMid) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const upper = lastMid + std * mult;
    const lower = lastMid - std * mult;
    const bandwidth = (upper - lower) / lastMid;
    return { middle: lastMid, upper, lower, bandwidth };
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

  private wait(explanation: string, reasoning: string[]): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning, timestamp: Date.now() };
  }
}

export const bbStrategy = new BollingerBandsStrategy();

import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class BreakoutStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "breakout",
    name: "Price Breakout",
    description: "Detects breakouts above resistance or below support levels from recent price range",
    category: "breakout",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) {
      return this.wait(`Need 30+ points, have ${prices.length}`);
    }

    const lookback = 20;
    const tradingRange = prices.slice(-lookback - 5, -5);
    const recent = prices.slice(-5);
    const high = Math.max(...tradingRange);
    const low = Math.min(...tradingRange);
    const range = high - low;
    const lastPrice = recent[recent.length - 1];
    const avgVolume = this.calcAvgRange(tradingRange);

    if (range === 0) {
      return this.wait("Price range is zero — cannot detect breakout");
    }

    const breakoutPct = range !== 0 ? ((lastPrice - high) / range) * 100 : 0;
    const breakdownPct = range !== 0 ? ((low - lastPrice) / range) * 100 : 0;

    if (lastPrice > high) {
      const strength = Math.min(100, breakoutPct * 2);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY", confidence: this.calculateConfidence(50 + strength),
        risk: this.calculateRisk(40, 20),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40),
        explanation: `Price broke above resistance at ${high.toFixed(4)} — currently at ${lastPrice.toFixed(4)} (${breakoutPct.toFixed(1)}% above)`,
        reasoning: [`Resistance: ${high.toFixed(4)}`, `Breakout: ${breakoutPct.toFixed(1)}%`, `Range: ${range.toFixed(4)}`, `Avg range: ${avgVolume.toFixed(4)}`],
        timestamp: Date.now(),
      };
    }

    if (lastPrice < low) {
      const strength = Math.min(100, breakdownPct * 2);
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "SELL", confidence: this.calculateConfidence(50 + strength),
        risk: this.calculateRisk(40, 20),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40),
        explanation: `Price broke below support at ${low.toFixed(4)} — currently at ${lastPrice.toFixed(4)} (${breakdownPct.toFixed(1)}% below)`,
        reasoning: [`Support: ${low.toFixed(4)}`, `Breakdown: ${breakdownPct.toFixed(1)}%`, `Range: ${range.toFixed(4)}`, `Avg range: ${avgVolume.toFixed(4)}`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: "WAIT", confidence: 30, risk: 50,
      riskRewardRatio: 0.6,
      explanation: `Price within range — no breakout`,
      reasoning: [`Support: ${low.toFixed(4)}`, `Resistance: ${high.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`],
      timestamp: Date.now(),
    };
  }

  private calcAvgRange(prices: number[]): number {
    if (prices.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < prices.length; i++) {
      total += Math.abs(prices[i] - prices[i - 1]);
    }
    return total / (prices.length - 1);
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const breakoutStrategy = new BreakoutStrategy();

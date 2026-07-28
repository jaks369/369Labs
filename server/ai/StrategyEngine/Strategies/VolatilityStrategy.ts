import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class VolatilityStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "volatility_regime",
    name: "Volatility Regime",
    description: "Trades based on volatility regime — range-bound strategies in low vol, trend in high vol",
    category: "volatility",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) {
      return this.wait(`Need 30+ points, have ${prices.length}`);
    }

    const vol = this.calcVolatility(prices);
    const recentVol = this.calcVolatility(prices.slice(-15));
    const baselineVol = this.calcVolatility(prices.slice(0, 15));
    const volChange = baselineVol !== 0 ? (recentVol - baselineVol) / baselineVol : 0;
    const trend = this.calcTrend(prices);

    const isHighVol = vol > 60;
    const isLowVol = vol < 30;
    const volIncreasing = volChange > 0.2;
    const volDecreasing = volChange < -0.2;

    if (isHighVol && volIncreasing && Math.abs(trend) > 20) {
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: trend > 0 ? "BUY" : "SELL",
        confidence: this.calculateConfidence(60 + Math.abs(trend) * 0.3),
        risk: this.calculateRisk(vol, 50),
        riskRewardRatio: this.calculateRiskRewardRatio(60 + Math.abs(trend) * 0.3, vol),
        explanation: `High volatility with increasing volume and strong trend — favoring ${trend > 0 ? "bullish" : "bearish"} direction`,
        reasoning: [`Volatility: ${vol}%`, `Vol change: ${(volChange * 100).toFixed(0)}%`, `Trend: ${trend.toFixed(1)}%`, `Regime: high vol trending`],
        timestamp: Date.now(),
      };
    }

    if (isLowVol && volDecreasing) {
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "WAIT", confidence: 60, risk: 20,
        riskRewardRatio: 3.0,
        explanation: `Low and decreasing volatility — market compressing, wait for expansion`,
        reasoning: [`Volatility: ${vol}%`, `Vol change: ${(volChange * 100).toFixed(0)}%`, `Regime: compression`],
        timestamp: Date.now(),
      };
    }

    if (isHighVol && !volIncreasing) {
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "WAIT", confidence: 40, risk: 70,
        riskRewardRatio: 0.57,
        explanation: `High but stable volatility — choppy conditions, avoid directional bias`,
        reasoning: [`Volatility: ${vol}%`, `Vol change: ${(volChange * 100).toFixed(0)}%`, `Regime: high vol choppy`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: "WAIT", confidence: 30, risk: 40,
      riskRewardRatio: 0.75,
      explanation: `Moderate volatility — no clear regime signal`,
      reasoning: [`Volatility: ${vol}%`, `Vol change: ${(volChange * 100).toFixed(0)}%`, `Trend: ${trend.toFixed(1)}%`],
      timestamp: Date.now(),
    };
  }

  private calcVolatility(prices: number[]): number {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    return Math.min(100, Math.round(Math.sqrt(variance) / Math.abs(mean || 1) * 5000));
  }

  private calcTrend(prices: number[]): number {
    const half = Math.floor(prices.length / 2);
    const first = prices.slice(0, half);
    const second = prices.slice(half);
    const fMean = first.reduce((a, b) => a + b, 0) / first.length;
    const sMean = second.reduce((a, b) => a + b, 0) / second.length;
    return fMean !== 0 ? ((sMean - fMean) / Math.abs(fMean)) * 100 : 0;
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const volatilityStrategy = new VolatilityStrategy();

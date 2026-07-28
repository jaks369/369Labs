import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class RSIStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "rsi",
    name: "RSI Mean Reversion",
    description: "Trades RSI overbought (>70) for SELL and oversold (<30) for BUY signals",
    category: "mean_reversion",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 20) {
      return this.wait(`Need 20+ points, have ${prices.length}`);
    }

    const period = 14;
    const rsi = this.calcRSI(prices, period);
    const currRSI = rsi[rsi.length - 1];
    const prevRSI = rsi[rsi.length - 2];
    const volatility = this.calcVolatility(prices);

    if (currRSI > 70) {
      const strength = (currRSI - 70) / 30;
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "SELL", confidence: this.calculateConfidence(50 + strength * 40),
        risk: this.calculateRisk(volatility, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength * 40, volatility),
        explanation: `RSI at ${currRSI.toFixed(1)} — overbought territory`,
        reasoning: [`RSI(14): ${prevRSI.toFixed(1)} → ${currRSI.toFixed(1)}`, `Threshold: >70 overbought`, `Volatility: ${volatility}%`],
        timestamp: Date.now(),
      };
    }

    if (currRSI < 30) {
      const strength = (30 - currRSI) / 30;
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY", confidence: this.calculateConfidence(50 + strength * 40),
        risk: this.calculateRisk(volatility, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(50 + strength * 40, volatility),
        explanation: `RSI at ${currRSI.toFixed(1)} — oversold territory`,
        reasoning: [`RSI(14): ${prevRSI.toFixed(1)} → ${currRSI.toFixed(1)}`, `Threshold: <30 oversold`, `Volatility: ${volatility}%`],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: "WAIT", confidence: 30, risk: 50,
      riskRewardRatio: 0.6,
      explanation: `RSI at ${currRSI.toFixed(1)} — neutral range`,
      reasoning: [`RSI(14): ${currRSI.toFixed(1)}`, `Neutral range: 30-70`],
      timestamp: Date.now(),
    };
  }

  private calcRSI(data: number[], period: number): number[] {
    const changes: number[] = [];
    for (let i = 1; i < data.length; i++) changes.push(data[i] - data[i - 1]);

    const rsi: number[] = [];
    let avgGain = 0, avgLoss = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss !== 0 ? avgGain / avgLoss : 100;
    rsi.push(100 - 100 / (1 + rs));

    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rs = avgLoss !== 0 ? avgGain / avgLoss : 100;
      rsi.push(100 - 100 / (1 + rs));
    }

    return rsi;
  }

  private calcVolatility(prices: number[]): number {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    return Math.min(100, Math.round(Math.sqrt(variance) / Math.abs(mean || 1) * 10000));
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const rsiStrategy = new RSIStrategy();

import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

/* ===== Mean Reversion (Statistical) ===== */
class MeanReversionStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "mean_reversion",
    name: "Statistical Mean Reversion",
    description: "Trades when price deviates significantly from its statistical mean — expects reversion",
    category: "mean_reversion",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) return this.wait(`Need 30+ points, have ${prices.length}`);

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const std = Math.sqrt(variance);
    const lastPrice = prices[prices.length - 1];
    const zScore = std !== 0 ? (lastPrice - mean) / std : 0;
    const vol = std / Math.abs(mean || 1);

    if (zScore > 2.0) {
      const strength = Math.min(100, (zScore - 2) * 30);
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(55 + strength), risk: this.calculateRisk(Math.round(vol * 5000), 30), riskRewardRatio: this.calculateRiskRewardRatio(55 + strength, Math.round(vol * 5000)), explanation: `Price at Z-score ${zScore.toFixed(2)}σ above mean — extreme deviation, expect reversion down`, reasoning: [`Z-score: ${zScore.toFixed(2)}`, `Mean: ${mean.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `Std: ${std.toFixed(4)}`], timestamp: Date.now() };
    }

    if (zScore < -2.0) {
      const strength = Math.min(100, Math.abs(zScore + 2) * 30);
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(55 + strength), risk: this.calculateRisk(Math.round(vol * 5000), 30), riskRewardRatio: this.calculateRiskRewardRatio(55 + strength, Math.round(vol * 5000)), explanation: `Price at Z-score ${zScore.toFixed(2)}σ below mean — extreme deviation, expect reversion up`, reasoning: [`Z-score: ${zScore.toFixed(2)}`, `Mean: ${mean.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `Std: ${std.toFixed(4)}`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 40, riskRewardRatio: 0.625, explanation: `Price within 2σ of mean (Z=${zScore.toFixed(2)}) — no reversion opportunity`, reasoning: [`Z-score: ${zScore.toFixed(2)}`, `Mean: ${mean.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`], timestamp: Date.now() };
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Pair Reversion (Channel) ===== */
class PairReversionStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "pair_reversion",
    name: "Channel Reversion",
    description: "Uses recent price channel extremes to trade reversals back toward the median",
    category: "mean_reversion",
    version: "1.0.0",
    minDataPoints: 25,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 25) return this.wait(`Need 25+ points, have ${prices.length}`);

    const channelPeriod = 20;
    const channel = prices.slice(-channelPeriod);
    const high = Math.max(...channel);
    const low = Math.min(...channel);
    const mid = (high + low) / 2;
    const lastPrice = prices[prices.length - 1];
    const pos = high !== low ? (lastPrice - low) / (high - low) : 0.5;
    const touchDistance = Math.min(lastPrice - high, low - lastPrice);

    if (pos > 0.9) {
      const strength = (pos - 0.9) * 10 * 100;
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(50 + strength), risk: this.calculateRisk(40, 20), riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40), explanation: `Price near channel top (${(pos * 100).toFixed(0)}% of range) — expect reversion to ${mid.toFixed(4)}`, reasoning: [`Position: ${(pos * 100).toFixed(0)}%`, `High: ${high.toFixed(4)}`, `Low: ${low.toFixed(4)}`, `Mid: ${mid.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`], timestamp: Date.now() };
    }

    if (pos < 0.1) {
      const strength = (0.1 - pos) * 10 * 100;
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(50 + strength), risk: this.calculateRisk(40, 20), riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40), explanation: `Price near channel bottom (${(pos * 100).toFixed(0)}% of range) — expect reversion to ${mid.toFixed(4)}`, reasoning: [`Position: ${(pos * 100).toFixed(0)}%`, `High: ${high.toFixed(4)}`, `Low: ${low.toFixed(4)}`, `Mid: ${mid.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 40, riskRewardRatio: 0.625, explanation: `Price within channel middle (${(pos * 100).toFixed(0)}%) — no reversal opportunity`, reasoning: [`Position: ${(pos * 100).toFixed(0)}%`, `Channel: ${low.toFixed(4)}–${high.toFixed(4)}`], timestamp: Date.now() };
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Stochastic Momentum ===== */
class StochasticMomentumStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "stochastic_momentum",
    name: "Stochastic Momentum",
    description: "Uses stochastic oscillator to identify momentum shifts and overbought/oversold levels",
    category: "momentum",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 20) return this.wait(`Need 20+ points, have ${prices.length}`);

    const period = 14;
    const stoch = this.calcStochastic(prices, period);
    const currK = stoch.k[stoch.k.length - 1];
    const prevK = stoch.k[stoch.k.length - 2];
    const currD = stoch.d[stoch.d.length - 1];
    const prevD = stoch.d[stoch.d.length - 2];
    const volatility = this.calcVol(prices);

    const kCrossAboveD = prevK <= prevD && currK > currD;
    const kCrossBelowD = prevK >= prevD && currK < currD;

    if (kCrossAboveD && currK < 30) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(60 + (30 - currK)), risk: this.calculateRisk(volatility, 30), riskRewardRatio: this.calculateRiskRewardRatio(60, volatility), explanation: `Stochastic %K(${currK.toFixed(0)}) crossed above %D in oversold — bullish momentum`, reasoning: [`%K: ${prevK.toFixed(0)} → ${currK.toFixed(0)}`, `%D: ${prevD.toFixed(0)} → ${currD.toFixed(0)}`, `Oversold < 30`], timestamp: Date.now() };
    }

    if (kCrossBelowD && currK > 70) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(60 + (currK - 70)), risk: this.calculateRisk(volatility, 30), riskRewardRatio: this.calculateRiskRewardRatio(60, volatility), explanation: `Stochastic %K(${currK.toFixed(0)}) crossed below %D in overbought — bearish momentum`, reasoning: [`%K: ${prevK.toFixed(0)} → ${currK.toFixed(0)}`, `%D: ${prevD.toFixed(0)} → ${currD.toFixed(0)}`, `Overbought > 70`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 50, riskRewardRatio: 0.5, explanation: `Stochastic %K(${currK.toFixed(0)}) / %D(${currD.toFixed(0)}) — neutral`, reasoning: [`%K: ${currK.toFixed(0)}`, `%D: ${currD.toFixed(0)}`], timestamp: Date.now() };
  }

  private calcStochastic(prices: number[], period: number): { k: number[]; d: number[] } {
    const k: number[] = [];
    for (let i = period; i < prices.length; i++) {
      const slice = prices.slice(i - period, i);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      const rawK = high !== low ? ((prices[i - 1] - low) / (high - low)) * 100 : 50;
      k.push(rawK);
    }
    const d: number[] = [];
    for (let i = 2; i < k.length; i++) d.push((k[i] + k[i - 1] + k[i - 2]) / 3);
    return { k, d };
  }

  private calcVol(p: number[]): number {
    const m = p.reduce((a, b) => a + b, 0) / p.length;
    return Math.min(100, Math.round(Math.sqrt(p.reduce((a, b) => a + (b - m) ** 2, 0) / p.length) / Math.abs(m || 1) * 5000));
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Price Rate of Change Strategy ===== */
class PriceROCStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "price_roc",
    name: "Price Rate of Change",
    description: "Measures percentage price change over multiple lookback periods for momentum detection",
    category: "momentum",
    version: "1.0.0",
    minDataPoints: 25,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 25) return this.wait(`Need 25+ points, have ${prices.length}`);

    const roc5 = this.roc(prices, 5);
    const roc10 = this.roc(prices, 10);
    const roc20 = this.roc(prices, 20);
    const avgROC = (roc5 + roc10 + roc20) / 3;
    const momentumConsistent = (roc5 > 0 && roc10 > 0 && roc20 > 0) || (roc5 < 0 && roc10 < 0 && roc20 < 0);
    const strength = Math.min(100, Math.abs(avgROC) * 5000);

    if (momentumConsistent && avgROC > 0) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(50 + strength), risk: this.calculateRisk(40, 20), riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40), explanation: `Positive ROC across all periods — strong consistent upward momentum`, reasoning: [`ROC(5): ${(roc5 * 100).toFixed(2)}%`, `ROC(10): ${(roc10 * 100).toFixed(2)}%`, `ROC(20): ${(roc20 * 100).toFixed(2)}%`, `Avg: ${(avgROC * 100).toFixed(2)}%`], timestamp: Date.now() };
    }

    if (momentumConsistent && avgROC < 0) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(50 + strength), risk: this.calculateRisk(40, 20), riskRewardRatio: this.calculateRiskRewardRatio(50 + strength, 40), explanation: `Negative ROC across all periods — strong consistent downward momentum`, reasoning: [`ROC(5): ${(roc5 * 100).toFixed(2)}%`, `ROC(10): ${(roc10 * 100).toFixed(2)}%`, `ROC(20): ${(roc20 * 100).toFixed(2)}%`, `Avg: ${(avgROC * 100).toFixed(2)}%`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 50, riskRewardRatio: 0.5, explanation: `Mixed ROC signals — momentum not consistent across periods`, reasoning: [`ROC(5): ${(roc5 * 100).toFixed(2)}%`, `ROC(10): ${(roc10 * 100).toFixed(2)}%`, `ROC(20): ${(roc20 * 100).toFixed(2)}%`], timestamp: Date.now() };
  }

  private roc(data: number[], period: number): number {
    if (data.length < period + 1) return 0;
    const curr = data[data.length - 1];
    const prev = data[data.length - 1 - period];
    return prev !== 0 ? (curr - prev) / prev : 0;
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

export const meanReversionStrategy = new MeanReversionStrategy();
export const pairReversionStrategy = new PairReversionStrategy();
export const stochasticMomentumStrategy = new StochasticMomentumStrategy();
export const priceROCStrategy = new PriceROCStrategy();

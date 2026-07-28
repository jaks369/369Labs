import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

/* ===== Range Breakout Strategy ===== */
class RangeBreakoutStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "range_breakout",
    name: "Range Breakout",
    description: "Detects breakouts from tight consolidation ranges after low-volatility periods",
    category: "breakout",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) return this.wait(`Need 30+ points, have ${prices.length}`);

    const recent = prices.slice(-15);
    const prev = prices.slice(-30, -15);
    const recentRange = Math.max(...recent) - Math.min(...recent);
    const prevRange = Math.max(...prev) - Math.min(...prev);
    const rangeRatio = prevRange !== 0 ? recentRange / prevRange : 1;
    const lastPrice = prices[prices.length - 1];
    const recentHigh = Math.max(...recent);
    const recentLow = Math.min(...recent);

    if (rangeRatio < 0.5 && lastPrice > recentHigh) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(60 + (1 - rangeRatio) * 40), risk: this.calculateRisk(30, 20), riskRewardRatio: this.calculateRiskRewardRatio(60, 30), explanation: `Tight range compression (ratio: ${rangeRatio.toFixed(2)}) followed by upside breakout`, reasoning: [`Range ratio: ${rangeRatio.toFixed(2)}`, `Recent high: ${recentHigh.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `Prev range: ${prevRange.toFixed(4)} → ${recentRange.toFixed(4)}`], timestamp: Date.now() };
    }

    if (rangeRatio < 0.5 && lastPrice < recentLow) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(60 + (1 - rangeRatio) * 40), risk: this.calculateRisk(30, 20), riskRewardRatio: this.calculateRiskRewardRatio(60, 30), explanation: `Tight range compression (ratio: ${rangeRatio.toFixed(2)}) followed by downside breakdown`, reasoning: [`Range ratio: ${rangeRatio.toFixed(2)}`, `Recent low: ${recentLow.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `Prev range: ${prevRange.toFixed(4)} → ${recentRange.toFixed(4)}`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: rangeRatio < 0.5 ? 50 : 20, risk: 50, riskRewardRatio: rangeRatio < 0.5 ? 1.0 : 0.4, explanation: rangeRatio < 0.5 ? "Range compression detected — awaiting breakout direction" : "No range compression — normal market conditions", reasoning: [`Range ratio: ${rangeRatio.toFixed(2)}`, `Recent: ${recentRange.toFixed(4)}`, `Prev: ${prevRange.toFixed(4)}`], timestamp: Date.now() };
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Volatility Breakout Strategy ===== */
class VolatilityBreakoutStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "volatility_breakout",
    name: "Volatility Breakout",
    description: "Uses volatility expansion to detect breakouts — enters on vol spike with price direction",
    category: "breakout",
    version: "1.0.0",
    minDataPoints: 25,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 25) return this.wait(`Need 25+ points, have ${prices.length}`);

    const baseline = this.calcStddev(prices.slice(0, -10));
    const recent = this.calcStddev(prices.slice(-10));
    const volRatio = baseline !== 0 ? recent / baseline : 1;
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const direction = lastPrice > prevPrice ? 1 : -1;
    const priceChange = Math.abs((lastPrice - prevPrice) / (prevPrice || 1));

    if (volRatio > 1.5 && priceChange > 0.001) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: direction > 0 ? "BUY" : "SELL", confidence: this.calculateConfidence(55 + Math.min(30, (volRatio - 1) * 30)), risk: this.calculateRisk(60, 40), riskRewardRatio: this.calculateRiskRewardRatio(55, 60), explanation: `Volatility expansion (${volRatio.toFixed(2)}x baseline) with ${direction > 0 ? "upward" : "downward"} price move — breakout in progress`, reasoning: [`Vol ratio: ${volRatio.toFixed(2)}x`, `Baseline σ: ${baseline.toFixed(4)}`, `Recent σ: ${recent.toFixed(4)}`, `Price change: ${(priceChange * 100).toFixed(3)}%`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 30, risk: 50, riskRewardRatio: 0.6, explanation: `Volatility normal (${volRatio.toFixed(2)}x baseline) — no breakout`, reasoning: [`Vol ratio: ${volRatio.toFixed(2)}x`], timestamp: Date.now() };
  }

  private calcStddev(arr: number[]): number {
    const m = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== ATR Strategy ===== */
class ATRStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "atr_strategy",
    name: "ATR-Based Position",
    description: "Uses Average True Range to set position size and detect volatility-based entries/exits",
    category: "volatility",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 20) return this.wait(`Need 20+ points, have ${prices.length}`);

    const period = 14;
    const atr = this.calcATR(prices, period);
    const currATR = atr[atr.length - 1];
    const prevATR = atr[atr.length - 2];
    const atrChange = prevATR !== 0 ? ((currATR - prevATR) / prevATR) * 100 : 0;
    const lastPrice = prices[prices.length - 1];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const atrPct = lastPrice !== 0 ? (currATR / lastPrice) * 100 : 0;

    if (atrChange > 20) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: lastPrice > mean ? "BUY" : "SELL", confidence: this.calculateConfidence(50 + Math.min(30, atrChange)), risk: this.calculateRisk(Math.round(atrPct * 10), 50), riskRewardRatio: this.calculateRiskRewardRatio(50, Math.round(atrPct * 10)), explanation: `ATR surging (${atrChange.toFixed(1)}% increase) — expanding volatility, favoring ${lastPrice > mean ? "bullish" : "bearish"} side`, reasoning: [`ATR: ${prevATR.toFixed(4)} → ${currATR.toFixed(4)}`, `Change: ${atrChange.toFixed(1)}%`, `ATR%: ${atrPct.toFixed(2)}%`, `Price vs mean: ${lastPrice > mean ? "above" : "below"}`], timestamp: Date.now() };
    }

    if (atrChange < -20) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 50, risk: 20, riskRewardRatio: 2.5, explanation: `ATR contracting (${atrChange.toFixed(1)}%) — volatility compressing, await expansion`, reasoning: [`ATR: ${prevATR.toFixed(4)} → ${currATR.toFixed(4)}`, `Change: ${atrChange.toFixed(1)}%`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 50, riskRewardRatio: 0.5, explanation: `ATR stable (${atrChange.toFixed(1)}%) — normal volatility conditions`, reasoning: [`ATR: ${currATR.toFixed(4)}`, `ATR%: ${atrPct.toFixed(2)}%`], timestamp: Date.now() };
  }

  private calcATR(prices: number[], period: number): number[] {
    const tr: number[] = [];
    for (let i = 1; i < prices.length; i++) tr.push(Math.abs(prices[i] - prices[i - 1]));
    const atr: number[] = [];
    let sum = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atr.push(sum);
    for (let i = period; i < tr.length; i++) { sum = (sum * (period - 1) + tr[i]) / period; atr.push(sum); }
    return atr;
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Volatility Expansion Strategy ===== */
class VolatilityExpansionStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "vol_expansion",
    name: "Volatility Expansion",
    description: "Compares short vs long-term volatility to detect expansion/contraction cycles",
    category: "volatility",
    version: "1.0.0",
    minDataPoints: 40,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 40) return this.wait(`Need 40+ points, have ${prices.length}`);

    const shortVol = this.vol(prices.slice(-10));
    const medVol = this.vol(prices.slice(-20));
    const longVol = this.vol(prices.slice(-40));
    const expansionRatio = longVol !== 0 ? shortVol / longVol : 1;
    const trend = this.trend(prices);
    const lastPrice = prices[prices.length - 1];

    if (expansionRatio > 1.8) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: trend > 0.1 ? "BUY" : trend < -0.1 ? "SELL" : "WAIT", confidence: this.calculateConfidence(55 + Math.min(35, (expansionRatio - 1) * 25)), risk: this.calculateRisk(Math.round(shortVol * 100), 40), riskRewardRatio: this.calculateRiskRewardRatio(55, Math.round(shortVol * 100)), explanation: `Volatility expanding (${expansionRatio.toFixed(2)}x) — following ${trend > 0.1 ? "bullish" : trend < -0.1 ? "bearish" : "neutral"} trend`, reasoning: [`Short σ: ${shortVol.toFixed(4)}`, `Long σ: ${longVol.toFixed(4)}`, `Ratio: ${expansionRatio.toFixed(2)}x`, `Trend: ${(trend * 100).toFixed(2)}%`], timestamp: Date.now() };
    }

    if (expansionRatio < 0.6) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 55, risk: 20, riskRewardRatio: 2.75, explanation: `Volatility compressing (${expansionRatio.toFixed(2)}x of long-term) — prepare for expansion`, reasoning: [`Short σ: ${shortVol.toFixed(4)}`, `Long σ: ${longVol.toFixed(4)}`, `Ratio: ${expansionRatio.toFixed(2)}x`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 50, riskRewardRatio: 0.5, explanation: `Volatility near normal levels (${expansionRatio.toFixed(2)}x)`, reasoning: [`Ratio: ${expansionRatio.toFixed(2)}x`, `Short σ: ${shortVol.toFixed(4)}`, `Long σ: ${longVol.toFixed(4)}`], timestamp: Date.now() };
  }

  private vol(arr: number[]): number {
    const m = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1)) / Math.abs(m || 1);
  }

  private trend(p: number[]): number {
    const h = Math.floor(p.length / 2);
    const f = p.slice(0, h), s = p.slice(h);
    const fm = f.reduce((a, b) => a + b, 0) / f.length, sm = s.reduce((a, b) => a + b, 0) / s.length;
    return fm !== 0 ? (sm - fm) / Math.abs(fm) : 0;
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Digit Trend Strategy ===== */
class DigitTrendStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "digit_trend",
    name: "Digit Trend",
    description: "Analyzes consecutive digit patterns — over/under streaks for short-term directional bias",
    category: "digit_pattern",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { lastDigits } = market;
    if (lastDigits.length < 20) return this.wait(`Need 20+ digits, have ${lastDigits.length}`);

    const recent = lastDigits.slice(-15);
    const overCount = recent.filter(d => d > 4).length;
    const underCount = recent.filter(d => d <= 4).length;
    const evenCount = recent.filter(d => d % 2 === 0).length;
    const oddCount = recent.filter(d => d % 2 !== 0).length;
    const overPct = (overCount / recent.length) * 100;
    const evenPct = (evenCount / recent.length) * 100;

    let streak = 0;
    for (let i = recent.length - 1; i > 0; i--) {
      if ((recent[i] > 4 && recent[i - 1] > 4) || (recent[i] <= 4 && recent[i - 1] <= 4)) streak++;
      else break;
    }

    if (overPct > 70 && streak >= 3) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(50 + overPct * 0.4), risk: this.calculateRisk(40, 30), riskRewardRatio: this.calculateRiskRewardRatio(50 + overPct * 0.4, 40), explanation: `Strong over-digit streak (${streak + 1} consecutive) — ${overPct.toFixed(0)}% recent digits > 4`, reasoning: [`Over: ${overCount}/${recent.length} = ${overPct.toFixed(0)}%`, `Streak: ${streak + 1}`, `Even: ${evenPct.toFixed(0)}%`], timestamp: Date.now() };
    }

    if (underPct(underCount, recent.length) > 70 && streak >= 3) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(50 + (100 - (underCount / recent.length) * 100) * 0.4), risk: this.calculateRisk(40, 30), riskRewardRatio: this.calculateRiskRewardRatio(50 + (100 - (underCount / recent.length) * 100) * 0.4, 40), explanation: `Strong under-digit streak (${streak + 1} consecutive) — ${((underCount / recent.length) * 100).toFixed(0)}% recent digits ≤ 4`, reasoning: [`Under: ${underCount}/${recent.length}`, `Streak: ${streak + 1}`, `Even: ${evenPct.toFixed(0)}%`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 25, risk: 40, riskRewardRatio: 0.625, explanation: `No significant digit trend — distribution near normal`, reasoning: [`Over: ${overPct.toFixed(0)}%`, `Even: ${evenPct.toFixed(0)}%`, `Streak: ${streak}`], timestamp: Date.now() };
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

function underPct(under: number, total: number): number {
  return (under / total) * 100;
}

export const rangeBreakoutStrategy = new RangeBreakoutStrategy();
export const volatilityBreakoutStrategy = new VolatilityBreakoutStrategy();
export const atrStrategy = new ATRStrategy();
export const volExpansionStrategy = new VolatilityExpansionStrategy();
export const digitTrendStrategy = new DigitTrendStrategy();

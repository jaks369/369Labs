import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

/* ===== Parabolic SAR Strategy ===== */
class ParabolicSARStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "parabolic_sar",
    name: "Parabolic SAR",
    description: "Follows trend using SAR dot position relative to price",
    category: "trend_following",
    version: "1.0.0",
    minDataPoints: 20,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 20) return this.wait(`Need 20+ points, have ${prices.length}`);

    const sar = this.calcSAR(prices);
    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const lastSar = sar[sar.length - 1];
    const prevSar = sar[sar.length - 2];
    const trend = this.calcTrend(prices);

    const crossedAbove = prevPrice <= prevSar && lastPrice > lastSar;
    const crossedBelow = prevPrice >= prevSar && lastPrice < lastSar;

    if (crossedAbove) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(55 + trend), risk: this.calculateRisk(40, 100 - trend), riskRewardRatio: this.calculateRiskRewardRatio(55 + trend, 40), explanation: `Price crossed above SAR (${lastSar.toFixed(4)}) — trend reversal up`, reasoning: [`Price: ${prevPrice.toFixed(4)} → ${lastPrice.toFixed(4)}`, `SAR: ${prevSar.toFixed(4)} → ${lastSar.toFixed(4)}`, `Trend: ${trend.toFixed(0)}%`], timestamp: Date.now() };
    }

    if (crossedBelow) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(55 + trend), risk: this.calculateRisk(40, 100 - trend), riskRewardRatio: this.calculateRiskRewardRatio(55 + trend, 40), explanation: `Price crossed below SAR (${lastSar.toFixed(4)}) — trend reversal down`, reasoning: [`Price: ${prevPrice.toFixed(4)} → ${lastPrice.toFixed(4)}`, `SAR: ${prevSar.toFixed(4)} → ${lastSar.toFixed(4)}`, `Trend: ${trend.toFixed(0)}%`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: lastPrice > lastSar ? "BUY" : "SELL", confidence: 35, risk: 50, riskRewardRatio: 0.7, explanation: `SAR ${lastPrice > lastSar ? "below" : "above"} price — ${lastPrice > lastSar ? "bullish" : "bearish"} alignment`, reasoning: [`SAR: ${lastSar.toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `Trend: ${trend.toFixed(0)}%`], timestamp: Date.now() };
  }

  private calcSAR(prices: number[]): number[] {
    const result: number[] = [];
    const af = 0.02;
    const maxAf = 0.2;
    let isUp = prices[1] > prices[0];
    let sar = prices[0];
    let ep = isUp ? Math.max(prices[0], prices[1]) : Math.min(prices[0], prices[1]);
    let accel = af;
    result.push(sar);

    for (let i = 1; i < prices.length; i++) {
      sar = sar + accel * (ep - sar);
      if (isUp) {
        if (prices[i] < sar) { isUp = false; sar = ep; accel = af; ep = prices[i]; }
        else { if (prices[i] > ep) { ep = prices[i]; accel = Math.min(accel + af, maxAf); } }
      } else {
        if (prices[i] > sar) { isUp = true; sar = ep; accel = af; ep = prices[i]; }
        else { if (prices[i] < ep) { ep = prices[i]; accel = Math.min(accel + af, maxAf); } }
      }
      result.push(sar);
    }
    return result;
  }

  private calcTrend(p: number[]): number {
    const h = Math.floor(p.length / 2);
    const f = p.slice(0, h), s = p.slice(h);
    const fm = f.reduce((a, b) => a + b, 0) / f.length, sm = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.min(100, Math.abs(fm !== 0 ? ((sm - fm) / Math.abs(fm)) * 1000 : 0));
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== Ichimoku Cloud Strategy ===== */
class IchimokuCloudStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "ichimoku_cloud",
    name: "Ichimoku Cloud",
    description: "Uses conversion/base lines and cloud (senkou) for trend direction and support/resistance",
    category: "trend_following",
    version: "1.0.0",
    minDataPoints: 52,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 52) return this.wait(`Need 52+ points, have ${prices.length}`);

    const conv = this.tenkan(prices);
    const base = this.kijun(prices);
    const spanA = (conv + base) / 2;
    const spanB = this.senkouB(prices);
    const lastPrice = prices[prices.length - 1];
    const cloudTop = Math.max(spanA, spanB);
    const cloudBot = Math.min(spanA, spanB);
    const isBullish = lastPrice > cloudTop;
    const conversionAboveBase = conv > base;

    if (isBullish && conversionAboveBase) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(60 + Math.abs(conv - base) * 50), risk: this.calculateRisk(30, 20), riskRewardRatio: this.calculateRiskRewardRatio(60, 30), explanation: `Price above cloud (${cloudTop.toFixed(4)}) with bullish TK cross — strong uptrend`, reasoning: [`Price: ${lastPrice.toFixed(4)}`, `Cloud top: ${cloudTop.toFixed(4)}`, `Conversion: ${conv.toFixed(4)}`, `Base: ${base.toFixed(4)}`, `SpanA: ${spanA.toFixed(4)}`, `SpanB: ${spanB.toFixed(4)}`], timestamp: Date.now() };
    }

    if (!isBullish && !conversionAboveBase) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(60 + Math.abs(conv - base) * 50), risk: this.calculateRisk(30, 20), riskRewardRatio: this.calculateRiskRewardRatio(60, 30), explanation: `Price below cloud (${cloudBot.toFixed(4)}) with bearish TK cross — strong downtrend`, reasoning: [`Price: ${lastPrice.toFixed(4)}`, `Cloud bot: ${cloudBot.toFixed(4)}`, `Conversion: ${conv.toFixed(4)}`, `Base: ${base.toFixed(4)}`, `SpanA: ${spanA.toFixed(4)}`, `SpanB: ${spanB.toFixed(4)}`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 30, risk: 50, riskRewardRatio: 0.6, explanation: `Price ${lastPrice > cloudTop ? "above" : "within"} cloud — no clear bias`, reasoning: [`Price: ${lastPrice.toFixed(4)}`, `Cloud: ${cloudBot.toFixed(4)}–${cloudTop.toFixed(4)}`], timestamp: Date.now() };
  }

  private tenkan(p: number[]): number {
    const s = p.slice(-9);
    return (Math.max(...s) + Math.min(...s)) / 2;
  }
  private kijun(p: number[]): number {
    const s = p.slice(-26);
    return (Math.max(...s) + Math.min(...s)) / 2;
  }
  private senkouB(p: number[]): number {
    const s = p.slice(-52);
    return (Math.max(...s) + Math.min(...s)) / 2;
  }

  private wait(e: string): StrategySignal { return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation: e, reasoning: [e], timestamp: Date.now() }; }
}

/* ===== SuperTrend Strategy ===== */
class SuperTrendStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "super_trend",
    name: "SuperTrend",
    description: "Uses ATR-based trailing stop to identify trend direction and reversals",
    category: "trend_following",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { prices } = market;
    if (prices.length < 30) return this.wait(`Need 30+ points, have ${prices.length}`);

    const atrPeriod = 14;
    const multiplier = 3;
    const { trend, st } = this.calcSuperTrend(prices, atrPeriod, multiplier);
    const lastTrend = trend[trend.length - 1];
    const prevTrend = trend[trend.length - 2];
    const lastPrice = prices[prices.length - 1];

    if (prevTrend === -1 && lastTrend === 1) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "BUY", confidence: this.calculateConfidence(65), risk: this.calculateRisk(40, 30), riskRewardRatio: this.calculateRiskRewardRatio(65, 40), explanation: `SuperTrend flipped bullish — price above ATR-trailing stop`, reasoning: [`SuperTrend: ${st[st.length - 1].toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `ATR(${atrPeriod}) x${multiplier}`], timestamp: Date.now() };
    }

    if (prevTrend === 1 && lastTrend === -1) {
      return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "SELL", confidence: this.calculateConfidence(65), risk: this.calculateRisk(40, 30), riskRewardRatio: this.calculateRiskRewardRatio(65, 40), explanation: `SuperTrend flipped bearish — price below ATR-trailing stop`, reasoning: [`SuperTrend: ${st[st.length - 1].toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`, `ATR(${atrPeriod}) x${multiplier}`], timestamp: Date.now() };
    }

    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: lastTrend === 1 ? "BUY" : "SELL", confidence: 40, risk: 50, riskRewardRatio: 0.8, explanation: `SuperTrend ${lastTrend === 1 ? "bullish" : "bearish"} — trend intact`, reasoning: [`ST: ${st[st.length - 1].toFixed(4)}`, `Price: ${lastPrice.toFixed(4)}`], timestamp: Date.now() };
  }

  private calcSuperTrend(prices: number[], period: number, mult: number) {
    const atr = this.calcATR(prices, period);
    const hl = prices.map((p, i) => i > 0 ? Math.abs(p - prices[i - 1]) : 0);
    const trend: number[] = [];
    const st: number[] = [];
    let upper = 0, lower = 0;

    for (let i = 0; i < prices.length; i++) {
      if (i < period) { trend.push(1); st.push(prices[i]); continue; }
      const atrV = atr[i - period + 1];
      upper = prices[i] - mult * atrV;
      lower = prices[i] + mult * atrV;

      if (prices[i] > st[i - 1]) { trend.push(1); st.push(Math.max(upper, st[i - 1])); }
      else { trend.push(-1); st.push(Math.min(lower, st[i - 1])); }
    }
    return { trend, st };
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

export const parabolicSAR = new ParabolicSARStrategy();
export const ichimokuCloud = new IchimokuCloudStrategy();
export const superTrend = new SuperTrendStrategy();

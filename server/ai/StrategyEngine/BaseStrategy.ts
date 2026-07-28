import * as db from "../../db";
import type { MarketData, StrategyMeta, StrategySignal } from "./StrategyTypes";

export abstract class BaseStrategy {
  abstract meta: StrategyMeta;

  abstract analyze(market: MarketData): Promise<StrategySignal>;

  async fetchMarketData(symbol: string, count: number = 100): Promise<MarketData> {
    const ticks = await db.getTickHistory(symbol, count);
    const prices = ticks.map((t) => Number(t.price)).filter((p) => !isNaN(p));
    const lastDigits = prices.map((p) => {
      const s = String(p).replace(".", "");
      return parseInt(s[s.length - 1], 10) || 0;
    });

    return {
      symbol,
      prices,
      lastDigits,
      timestamp: Date.now(),
    };
  }

  protected calculateConfidence(rawScore: number, min: number = 0, max: number = 100): number {
    return Math.max(min, Math.min(max, Math.round(rawScore)));
  }

  protected calculateRisk(volatility: number, noise: number): number {
    return Math.round((volatility * 0.6 + noise * 0.4));
  }

  protected calculateRiskRewardRatio(confidence: number, risk: number): number {
    if (risk === 0) return 1;
    return Math.round((confidence / risk) * 100) / 100;
  }
}

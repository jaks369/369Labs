import { StrategyPerformanceTracker } from "./StrategyPerformanceTracker";
import { StrategyRegistry } from "./StrategyRegistry";
import * as db from "../../db";
import { AIKnowledgeType } from "../knowledgeTypes";

export interface StrategyRanking {
  strategyId: string;
  strategyName: string;
  winRate: number;
  confidence: number;
  avgRiskReward: number;
  totalSignals: number;
  rank: number;
  recommendation: string;
}

export class AIStrategyLearning {
  private perfTracker = new StrategyPerformanceTracker();
  private registry = StrategyRegistry.getInstance();

  async getRankings(userId: number): Promise<StrategyRanking[]> {
    const performances = await this.perfTracker.getAllPerformances(userId);
    const metas = this.registry.getMetas();
    const metaMap = new Map(metas.map((m) => [m.id, m.name]));

    const rankings: StrategyRanking[] = performances.map((p, i) => {
      const name = metaMap.get(p.strategyId) || p.strategyId;

      let recommendation: string;
      if (p.totalSignals < 5) {
        recommendation = "Insufficient data — continue monitoring";
      } else if (p.winRate >= 60 && p.avgRiskReward >= 1.5) {
        recommendation = "High performer — use with confidence";
      } else if (p.winRate >= 45) {
        recommendation = "Moderate performer — use with caution";
      } else if (p.winRate >= 30) {
        recommendation = "Below average — review configuration";
      } else {
        recommendation = "Poor performer — consider disabling";
      }

      return {
        strategyId: p.strategyId,
        strategyName: name,
        winRate: p.winRate,
        confidence: p.avgConfidence,
        avgRiskReward: p.avgRiskReward,
        totalSignals: p.totalSignals,
        rank: 0,
        recommendation,
      };
    });

    const sorted = rankings.sort((a, b) => {
      const aScore = a.winRate * 0.5 + a.avgRiskReward * 20 + (a.totalSignals >= 5 ? 10 : 0);
      const bScore = b.winRate * 0.5 + b.avgRiskReward * 20 + (b.totalSignals >= 5 ? 10 : 0);
      return bScore - aScore;
    });

    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async getRecommendation(userId: number): Promise<{
    topStrategy: StrategyRanking | null;
    worstStrategy: StrategyRanking | null;
    suggestion: string;
  }> {
    const rankings = await this.getRankings(userId);
    const withData = rankings.filter((r) => r.totalSignals >= 5);

    if (withData.length === 0) {
      return {
        topStrategy: null,
        worstStrategy: null,
        suggestion: "Not enough data to recommend strategies. Continue trading to build signal history.",
      };
    }

    const top = withData[0];
    const worst = withData[withData.length - 1];

    let suggestion: string;
    if (top.winRate >= 60) {
      suggestion = `Consider prioritizing "${top.strategyName}" (${top.winRate}% win rate, ${top.totalSignals} signals)`;
    } else if (worst.winRate < 30) {
      suggestion = `Consider disabling "${worst.strategyName}" (${worst.winRate}% win rate, ${worst.totalSignals} signals)`;
    } else {
      suggestion = `Best performer: "${top.strategyName}" at ${top.winRate}% win rate over ${top.totalSignals} trades`;
    }

    return { topStrategy: top, worstStrategy: worst, suggestion };
  }

  async proposeDisable(userId: number): Promise<string[]> {
    const rankings = await this.getRankings(userId);
    return rankings
      .filter((r) => r.totalSignals >= 5 && r.winRate < 30)
      .map((r) => r.strategyId);
  }
}

export const aiStrategyLearning = new AIStrategyLearning();

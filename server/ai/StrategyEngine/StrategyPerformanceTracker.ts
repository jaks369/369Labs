import * as db from "../../db";
import { AIKnowledgeType } from "../knowledgeTypes";
import type { StrategyPerformance } from "./StrategyTypes";

export class StrategyPerformanceTracker {
  async recordOutcome(
    userId: number,
    strategyId: string,
    signalConfidence: number,
    signalRisk: number,
    signalRR: number,
    won: boolean,
    pnl: number
  ): Promise<void> {
    try {
      await db.saveAiKnowledge({
        userId,
        knowledgeType: "strategy_signal_result",
        data: {
          strategyId,
          confidence: signalConfidence,
          risk: signalRisk,
          riskRewardRatio: signalRR,
          won,
          pnl,
          timestamp: Date.now(),
        } as any,
        source: "StrategyPerformanceTracker",
      });
    } catch {
      /* non-critical */
    }
  }

  async getPerformance(userId: number, strategyId: string): Promise<StrategyPerformance> {
    try {
      const results = await this.loadResults(userId, strategyId);
      if (results.length === 0) {
        return { strategyId, totalSignals: 0, wins: 0, losses: 0, winRate: 0, avgConfidence: 0, avgRiskReward: 0, totalPnl: 0 };
      }

      const wins = results.filter((r) => r.won).length;
      const losses = results.filter((r) => !r.won).length;
      const totalSignals = results.length;
      const winRate = totalSignals > 0 ? Math.round((wins / totalSignals) * 100) : 0;
      const avgConfidence = Math.round(results.reduce((sum, r) => sum + (r.confidence || 0), 0) / totalSignals);
      const avgRR = results.reduce((sum, r) => sum + (r.riskRewardRatio || 0), 0) / totalSignals;
      const totalPnl = results.reduce((sum, r) => sum + (r.pnl || 0), 0);

      return { strategyId, totalSignals, wins, losses, winRate, avgConfidence, avgRiskReward: Math.round(avgRR * 100) / 100, totalPnl: Math.round(totalPnl * 100) / 100 };
    } catch {
      return { strategyId, totalSignals: 0, wins: 0, losses: 0, winRate: 0, avgConfidence: 0, avgRiskReward: 0, totalPnl: 0 };
    }
  }

  async getAllPerformances(userId: number): Promise<StrategyPerformance[]> {
    try {
      const allResults = await this.loadAllResults(userId);
      const byStrategy = new Map<string, any[]>();

      allResults.forEach((r: any) => {
        const sid = r.strategyId;
        if (!byStrategy.has(sid)) byStrategy.set(sid, []);
        byStrategy.get(sid)!.push(r);
      });

      const performances: StrategyPerformance[] = [];
      Array.from(byStrategy.entries()).forEach(([strategyId, results]) => {
        const wins = results.filter((r: any) => r.won).length;
        const losses = results.filter((r: any) => !r.won).length;
        const total = results.length;
        performances.push({
          strategyId,
          totalSignals: total,
          wins,
          losses,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
          avgConfidence: total > 0 ? Math.round(results.reduce((s: number, r: any) => s + (r.confidence || 0), 0) / total) : 0,
          avgRiskReward: total > 0 ? Math.round(results.reduce((s: number, r: any) => s + (r.riskRewardRatio || 0), 0) / total * 100) / 100 : 0,
          totalPnl: Math.round(results.reduce((s: number, r: any) => s + (r.pnl || 0), 0) * 100) / 100,
        });
      });

      return performances.sort((a, b) => b.winRate - a.winRate);
    } catch {
      return [];
    }
  }

  private async loadResults(userId: number, strategyId: string): Promise<any[]> {
    const allResults = await this.loadAllResults(userId);
    return allResults.filter((r) => r.strategyId === strategyId);
  }

  private async loadAllResults(userId: number): Promise<any[]> {
    try {
      const entries = await db.getAiKnowledge(userId, "strategy_signal_result", 1000);
      return entries.map((e) => e.data as any).filter(Boolean);
    } catch {
      return [];
    }
  }
}

export const strategyPerformanceTracker = new StrategyPerformanceTracker();

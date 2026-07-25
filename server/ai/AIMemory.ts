import * as db from "../db";
import { AIKnowledgeType } from "./knowledgeTypes";

interface TradeReviewData {
  context: {
    symbol: string;
    contractType: string;
    snapshot: {
      prediction?: { prediction: string; confidence: number };
    };
  };
  result: {
    outcome: "win" | "loss";
  };
}

interface HealthSnapshotInput {
  symbol: string;
  score: number;
  trend: number;
  momentum: number;
  noise: number;
  volatility: string;
  recommendation: string;
}

export interface TradeContext {
  tradeId?: number;
  symbol: string;
  contractType?: string;
  stake: number;
  profitLoss: number;
  result: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime?: string;
  strategyId?: number;
  botRunId?: number;
  contractId?: string;
  marketHealth: number;
  volatility: string;
  trend: number;
  momentum: number;
  prediction?: string;
  predictionConfidence?: number;
  reviewScore?: number;
  reviewSummary?: string;
}

let tickCounter = 0;
const SNAPSHOT_INTERVAL = 20;

export class AIMemory {
  async logAccuracy(userId: number, tradeReviewData: TradeReviewData): Promise<void> {
    const outcome = tradeReviewData.result?.outcome;
    if (!outcome) return;

    const prediction = tradeReviewData.context?.snapshot?.prediction;
    const correct = prediction ? this.predictionMatchedOutcome(prediction.prediction, outcome) : false;

    const accuracyEntry = {
      prediction: prediction?.prediction || "N/A",
      confidence: prediction?.confidence || 0,
      actualOutcome: outcome,
      correct,
      symbol: tradeReviewData.context.symbol,
      contractType: tradeReviewData.context.contractType,
    };

    try {
      await db.saveAiKnowledge({
        userId,
        knowledgeType: AIKnowledgeType.ACCURACY_LOG,
        symbol: tradeReviewData.context.symbol,
        data: accuracyEntry as any,
        confidence: correct ? "100.00" : "0.00",
        source: "AIMemory",
      });
    } catch {
      /* accuracy logging is non-critical */
    }
  }

  async snapshotHealth(input: HealthSnapshotInput): Promise<void> {
    try {
      await db.saveAiKnowledge({
        userId: 0,
        knowledgeType: AIKnowledgeType.MARKET_PATTERN,
        symbol: input.symbol,
        data: input as any,
        source: "AIMemory",
      });
    } catch {
      /* health snapshot is non-critical */
    }
  }

  shouldSnapshot(): boolean {
    tickCounter++;
    if (tickCounter >= SNAPSHOT_INTERVAL) {
      tickCounter = 0;
      return true;
    }
    return false;
  }

  async storeTradeContext(userId: number, context: TradeContext): Promise<void> {
    try {
      await db.saveAiKnowledge({
        userId,
        knowledgeType: AIKnowledgeType.TRADE_CONTEXT,
        symbol: context.symbol,
        data: context as any,
        relatedTradeId: context.tradeId,
        relatedStrategyId: context.strategyId,
        source: "AIMemory",
      });
    } catch {
      /* non-critical */
    }
  }

  async getTradeContexts(userId: number, limit: number = 100): Promise<TradeContext[]> {
    try {
      const entries = await db.getAiKnowledge(userId, AIKnowledgeType.TRADE_CONTEXT, limit);
      return entries.map((e) => e.data as TradeContext).filter(Boolean);
    } catch {
      return [];
    }
  }

  async queryKnowledge(userId: number, type: string, limit: number = 50): Promise<any[]> {
    try {
      const entries = await db.getAiKnowledge(userId, type, limit);
      return entries.map((e) => e.data).filter(Boolean);
    } catch {
      return [];
    }
  }

  async getAccuracyStats(
    userId: number,
    symbol?: string
  ): Promise<{
    totalPredictions: number;
    correct: number;
    accuracyPct: number;
    bySymbol: Record<string, { total: number; correct: number; accuracyPct: number }>;
    byContractType: Record<string, { total: number; correct: number; accuracyPct: number }>;
  }> {
    try {
      const entries = await db.getAiKnowledge(userId, AIKnowledgeType.ACCURACY_LOG, 500);
      const filtered = symbol ? entries.filter((e) => e.symbol === symbol) : entries;

      const bySymbol: Record<string, { total: number; correct: number; accuracyPct: number }> = {};
      const byContractType: Record<string, { total: number; correct: number; accuracyPct: number }> = {};
      let totalCorrect = 0;

      for (const entry of filtered) {
        const d = entry.data as any;
        const isCorrect = d?.correct ? 1 : 0;
        totalCorrect += isCorrect;

        const sym = entry.symbol || "unknown";
        if (!bySymbol[sym]) bySymbol[sym] = { total: 0, correct: 0, accuracyPct: 0 };
        bySymbol[sym].total++;
        bySymbol[sym].correct += isCorrect;

        const ct = d.contractType || "unknown";
        if (!byContractType[ct]) byContractType[ct] = { total: 0, correct: 0, accuracyPct: 0 };
        byContractType[ct].total++;
        byContractType[ct].correct += isCorrect;
      }

      const total = filtered.length || 1;
      for (const key of Object.keys(bySymbol)) {
        bySymbol[key].accuracyPct = Math.round((bySymbol[key].correct / (bySymbol[key].total || 1)) * 100);
      }
      for (const key of Object.keys(byContractType)) {
        byContractType[key].accuracyPct = Math.round((byContractType[key].correct / (byContractType[key].total || 1)) * 100);
      }

      return {
        totalPredictions: filtered.length,
        correct: totalCorrect,
        accuracyPct: Math.round((totalCorrect / total) * 100),
        bySymbol,
        byContractType,
      };
    } catch {
      return { totalPredictions: 0, correct: 0, accuracyPct: 0, bySymbol: {}, byContractType: {} };
    }
  }

  async getMarketPatterns(
    symbol?: string
  ): Promise<{
    snapshots: { symbol: string; score: number; trend: number; volatility: string; timestamp: string }[];
  }> {
    try {
      const entries = await db.getAiKnowledge(0, AIKnowledgeType.MARKET_PATTERN, 200);
      const filtered = symbol ? entries.filter((e) => e.symbol === symbol) : entries;

      const snapshots = filtered.map((e) => {
        const d = e.data as any;
        return {
          symbol: e.symbol || d?.symbol || "",
          score: d?.score ?? 50,
          trend: d?.trend ?? 0,
          volatility: d?.volatility ?? "Medium",
          timestamp: (e.createdAt as any)?.toISOString?.() ?? new Date().toISOString(),
        };
      });

      return { snapshots };
    } catch {
      return { snapshots: [] };
    }
  }

  async getPerformanceSummary(userId: number): Promise<{
    totalTradeReviews: number;
    winRate: number;
    totalPnL: number;
    accuracyPct: number;
    recentWarnings: string[];
  }> {
    const warnings: string[] = [];

    try {
      const tradeReviews = await db.getAiKnowledge(userId, AIKnowledgeType.TRADE_REVIEW, 200);
      let wins = 0;
      let totalPnL = 0;

      for (const tr of tradeReviews) {
        const d = tr.data as any;
        if (d?.result?.outcome === "win") wins++;
        totalPnL += Number(d?.result?.pnl ?? 0);
      }

      const total = tradeReviews.length || 1;
      const winRate = Math.round((wins / total) * 100);

      const accuracy = await this.getAccuracyStats(userId);

      if (winRate < 40 && tradeReviews.length >= 5) {
        warnings.push(`Win rate is ${winRate}% over ${tradeReviews.length} trades`);
      }
      if (totalPnL < -20) {
        warnings.push(`Net PnL is ${totalPnL.toFixed(2)} — review strategy settings`);
      }
      if (accuracy.accuracyPct < 40 && accuracy.totalPredictions >= 5) {
        warnings.push(`AI prediction accuracy is ${accuracy.accuracyPct}% — predictions may need recalibration`);
      }

      return {
        totalTradeReviews: tradeReviews.length,
        winRate,
        totalPnL: Math.round(totalPnL * 100) / 100,
        accuracyPct: accuracy.accuracyPct,
        recentWarnings: warnings,
      };
    } catch {
      return { totalTradeReviews: 0, winRate: 0, totalPnL: 0, accuracyPct: 0, recentWarnings: [] };
    }
  }

  private predictionMatchedOutcome(prediction: string, outcome: string): boolean {
    const p = prediction.toUpperCase();
    const o = outcome.toLowerCase();
    if ((p === "RISE" || p === "CALL") && o === "win") return true;
    if ((p === "FALL" || p === "PUT") && o === "loss") return true;
    if (p === "UNCLEAR DIRECTION") return false;
    return false;
  }
}

export const aiMemory = new AIMemory();

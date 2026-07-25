import { aiMemory, TradeContext } from "./AIMemory";
import { tradeReviewEngine, TradeReview } from "./TradeReviewEngine";
import { patternDiscovery, PatternFinding } from "./PatternDiscovery";
import { strategyIntelligence } from "./StrategyIntelligence";
import { AIKnowledgeType } from "./knowledgeTypes";
import * as db from "../db";

interface CompletedTrade {
  id?: number;
  userId: number;
  symbol: string;
  contractType?: string;
  stake: string;
  profitLoss?: string;
  result: string;
  entryTime: Date;
  exitTime?: Date;
  strategyId?: number;
  botRunId?: number;
  contractId?: string;
  entryPrice: string;
  exitPrice?: string;
}

interface HubEvent {
  type: string;
  tradeId?: number;
  symbol: string;
  userId: number;
  message: string;
  timestamp: number;
}

type EventListener = (event: HubEvent) => void;

export class AIIntelligenceHub {
  private listeners: EventListener[] = [];

  onEvent(listener: EventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: HubEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* non-critical */
      }
    }
  }

  async processTradeCompletion(trade: CompletedTrade): Promise<void> {
    const { review, marketContext } = await tradeReviewEngine.review(trade, trade.userId);

    const pnl = parseFloat(trade.profitLoss || "0");

    const tradeContext: TradeContext = {
      tradeId: trade.id,
      symbol: trade.symbol,
      contractType: trade.contractType,
      stake: parseFloat(trade.stake) || 0,
      profitLoss: pnl,
      result: trade.result,
      entryPrice: parseFloat(trade.entryPrice) || 0,
      exitPrice: parseFloat(trade.exitPrice || "0") || 0,
      entryTime: trade.entryTime.toISOString(),
      exitTime: trade.exitTime?.toISOString(),
      strategyId: trade.strategyId,
      botRunId: trade.botRunId,
      contractId: trade.contractId,
      marketHealth: marketContext.healthScore,
      volatility: marketContext.volatility,
      trend: marketContext.trend,
      momentum: marketContext.momentum,
      prediction: marketContext.recentPrediction?.prediction,
      predictionConfidence: marketContext.recentPrediction?.confidence,
      reviewScore: review.score,
      reviewSummary: [
        review.whyTradeWasTaken,
        ...review.whatWentRight.slice(0, 1),
        ...review.whatWentWrong.slice(0, 1),
        review.riskAssessment,
      ].join(" | "),
    };

    await db.saveAiKnowledge({
      userId: trade.userId,
      knowledgeType: AIKnowledgeType.TRADE_REVIEW,
      symbol: trade.symbol,
      data: {
        context: { symbol: trade.symbol, contractType: trade.contractType, snapshot: marketContext },
        result: { outcome: trade.result, pnl, review: review.whyTradeWasTaken },
      } as any,
      relatedTradeId: trade.id,
      relatedStrategyId: trade.strategyId,
      source: "AIIntelligenceHub",
    });

    await aiMemory.storeTradeContext(trade.userId, tradeContext);

    await this.emit({
      type: "trade_reviewed",
      tradeId: trade.id,
      symbol: trade.symbol,
      userId: trade.userId,
      message: `Trade ${trade.id} on ${trade.symbol}: ${trade.result === "win" ? "WIN" : "LOSS"} (${pnl.toFixed(2)}) — ${review.riskAssessment}`,
      timestamp: Date.now(),
    });

    try {
      const findings = await patternDiscovery.analyzeTrades(trade.userId);
      if (findings.length > 0) {
        await patternDiscovery.storeFindings(trade.userId, findings);
        const topFinding = findings[0];
        await this.emit({
          type: "pattern_discovered",
          symbol: trade.symbol,
          userId: trade.userId,
          message: `Pattern: ${topFinding.description}`,
          timestamp: Date.now(),
        });
      }
    } catch {
      /* non-critical */
    }

    if (trade.strategyId) {
      try {
        const strategies = await db.getStrategiesByUserId(trade.userId);
        const strategy = strategies.find((s: any) => s.id === trade.strategyId);
        if (strategy) {
          const strategyReview = await strategyIntelligence.review(strategy, trade.userId);
          const allTrades = await db.getTradesByUserId(trade.userId, 100);
          const stratTrades = allTrades.filter((t: any) => t.strategyId === trade.strategyId && t.result !== "pending");
          const wins = stratTrades.filter((t: any) => t.result === "win").length;
          const totalPnl = stratTrades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss || "0"), 0);

          await db.saveAiKnowledge({
            userId: trade.userId,
            knowledgeType: AIKnowledgeType.STRATEGY_INSIGHT,
            symbol: trade.symbol,
            data: {
              strategyId: trade.strategyId,
              review: strategyReview.review,
              score: strategyReview.score,
              warnings: strategyReview.warnings,
              tradeCount: stratTrades.length,
              winRate: stratTrades.length > 0 ? Math.round((wins / stratTrades.length) * 100) : 0,
              totalPnl: Math.round(totalPnl * 100) / 100,
            },
            relatedStrategyId: trade.strategyId,
            source: "AIIntelligenceHub",
          });

          if (strategyReview.score < 50) {
            await this.emit({
              type: "strategy_warning",
              symbol: trade.symbol,
              userId: trade.userId,
              message: `Strategy #${trade.strategyId} score: ${strategyReview.score}/100 — ${strategyReview.warnings[0] || "review recommended"}`,
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        /* non-critical */
      }
    }
  }

  async getIntelligenceSummary(userId: number): Promise<{
    recentPatterns: PatternFinding[];
    tradeContexts: TradeContext[];
    performanceSummary: {
      totalTrades: number;
      winRate: number;
      totalPnl: number;
      accuracyPct: number;
      topSymbol: string;
    };
  }> {
    const patterns = await patternDiscovery.getLatestPatterns(userId);
    const tradeContexts = await aiMemory.getTradeContexts(userId, 50);

    let totalTrades = 0;
    let wins = 0;
    let totalPnl = 0;
    const symCount: Record<string, { count: number; wins: number }> = {};

    for (const tc of tradeContexts) {
      totalTrades++;
      if (tc.result === "win") wins++;
      totalPnl += tc.profitLoss;
      if (!symCount[tc.symbol]) symCount[tc.symbol] = { count: 0, wins: 0 };
      symCount[tc.symbol].count++;
      if (tc.result === "win") symCount[tc.symbol].wins++;
    }

    let topSymbol = "";
    let topCount = 0;
    for (const [sym, info] of Object.entries(symCount)) {
      if (info.count > topCount) {
        topCount = info.count;
        topSymbol = sym;
      }
    }

    const accuracy = await aiMemory.getAccuracyStats(userId);

    return {
      recentPatterns: patterns,
      tradeContexts,
      performanceSummary: {
        totalTrades,
        winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
        totalPnl: Math.round(totalPnl * 100) / 100,
        accuracyPct: accuracy.accuracyPct,
        topSymbol,
      },
    };
  }
}

export const aiIntelligenceHub = new AIIntelligenceHub();

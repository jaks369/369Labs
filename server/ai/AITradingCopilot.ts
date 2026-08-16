/**
 * AITradingCopilot — live, data-backed session coaching.
 *
 * Previously a stub that returned zeros. Now delegates to the concierge
 * engine's pure helpers (computeSessionCoach / computeSmartAlerts /
 * computeSessionSummary / computePreTradeChecklist) so the "chat + assist"
 * surfaces and the Consierge page share the same honest math. The public
 * method shapes stay unchanged for AIChatEngine compatibility.
 */

import * as db from "../db";
import { aiOrchestrator } from "./AIOrchestrator";
import {
  computeSessionCoach,
  computeSmartAlerts,
  computeSessionSummary,
  computePreTradeChecklist,
  TradeLike,
} from "../concierge";

export interface SessionCoachResult {
  wins: number;
  losses: number;
  sessionAccuracy: number;
  sessionDuration: string;
  coachingMessages: string[];
  currentStreak: string;
  streakCount: number;
  totalExposure: number;
}

export interface SmartAlert {
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface SessionSummaryResult {
  tradingSummary: string;
  strengths: string[];
  mistakes: string[];
  improvementOpportunities: string[];
  sessionDuration: string;
}

export interface PreTradeChecklist {
  symbol: string;
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  suggestedStake: number;
  maxStake: number;
  warnings: string[];
}

export interface LivePositionAssist {
  positionId: number;
  currentPnl: number;
  riskAlerts: string[];
  suggestions: string[];
  shouldClose: boolean;
}

export interface DecisionComparison {
  tradeId: number;
  actualDecision: string;
  aiRecommendation: string;
  wasOptimal: boolean;
  analysis: string;
  lessons: string[];
}

async function liveBalance(userId: number): Promise<number> {
  try {
    const { getPortfolioSnapshot } = await import("../tradingService");
    return (await getPortfolioSnapshot(userId)).balance || 0;
  } catch {
    return 0;
  }
}

class AITradingCopilot {
  private sessionStart: Date | null = null;
  private sessionUserId: number | null = null;

  async sessionCoach(userId: number): Promise<SessionCoachResult> {
    const trades = await db.getTradesByUserId(userId, 200);
    const volatilityBySymbol: Record<string, string> = {};
    for (const t of trades) {
      if (!t.symbol || volatilityBySymbol[t.symbol]) continue;
      volatilityBySymbol[t.symbol] = aiOrchestrator.getHealthFor(t.symbol)?.volatility ?? "Unknown";
    }
    const [balance, startMs] = [await liveBalance(userId), this.sessionStart?.getTime() ?? 0];
    const res = computeSessionCoach({ trades: trades as TradeLike[], sessionStartMs: startMs, balance, volatilityBySymbol });
    return {
      wins: res.wins,
      losses: res.losses,
      sessionAccuracy: res.sessionAccuracy,
      sessionDuration: res.sessionDuration,
      coachingMessages: res.coachingMessages.map((m) => m.message),
      currentStreak: res.streakCount > 0 ? res.currentStreak.toLowerCase() : "none",
      streakCount: res.streakCount,
      totalExposure: res.totalExposure,
    };
  }

  async smartAlerts(userId: number): Promise<SmartAlert[]> {
    const [trades, advisories] = await Promise.all([
      db.getTradesByUserId(userId, 100),
      Promise.resolve(aiOrchestrator.getRiskAdvisories()),
    ]);
    return computeSmartAlerts(trades as TradeLike[], advisories);
  }

  async sessionSummary(userId: number): Promise<SessionSummaryResult> {
    const trades = await db.getTradesByUserId(userId, 200);
    const res = computeSessionSummary(trades as TradeLike[]);
    return {
      tradingSummary: res.tradingSummary,
      strengths: res.strengths,
      mistakes: res.mistakes,
      improvementOpportunities: res.improvementOpportunities,
      sessionDuration: res.sessionDuration,
    };
  }

  async preTradeChecklist(userId: number, symbol: string, contractType?: string, stake?: number): Promise<PreTradeChecklist> {
    const [balance, advisory] = await Promise.all([
      liveBalance(userId),
      Promise.resolve(aiOrchestrator.getRiskAdvisoryFor(symbol)),
    ]);
    const res = computePreTradeChecklist({ symbol, contractType, stake, balance, advisory: advisory ?? null });
    return {
      symbol: res.symbol,
      riskLevel: res.riskLevel,
      recommendations: res.recommendations,
      suggestedStake: res.suggestedStake,
      maxStake: res.maxStake,
      warnings: res.warnings,
    };
  }

  async livePositionAssistant(userId: number, positionId: number): Promise<LivePositionAssist> {
    return {
      positionId,
      currentPnl: 0,
      riskAlerts: [],
      suggestions: ["Monitor price movement", "Set stop-loss if not already set"],
      shouldClose: false,
    };
  }

  async decisionComparison(userId: number, tradeId: number): Promise<DecisionComparison> {
    return {
      tradeId,
      actualDecision: "executed",
      aiRecommendation: "executed",
      wasOptimal: true,
      analysis: "Insufficient data for detailed comparison.",
      lessons: [],
    };
  }

  startSession(userId: number): void {
    this.sessionStart = new Date();
    this.sessionUserId = userId;
  }
}

let instance: AITradingCopilot | null = null;

export function getAITradingCopilot(): AITradingCopilot {
  if (!instance) instance = new AITradingCopilot();
  return instance;
}
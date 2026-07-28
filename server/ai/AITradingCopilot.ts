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

class AITradingCopilot {
  private sessionStart: Date | null = null;
  async sessionCoach(userId: number): Promise<SessionCoachResult> {
    return {
      wins: 0, losses: 0, sessionAccuracy: 0, sessionDuration: "0m",
      coachingMessages: [], currentStreak: "none", streakCount: 0, totalExposure: 0,
    };
  }

  async smartAlerts(userId: number): Promise<SmartAlert[]> {
    return [];
  }

  async sessionSummary(userId: number): Promise<SessionSummaryResult> {
    return {
      tradingSummary: "No trading data available.", strengths: [], mistakes: [],
      improvementOpportunities: [], sessionDuration: "0m",
    };
  }

  async preTradeChecklist(userId: number, symbol: string, contractType?: string, stake?: number): Promise<PreTradeChecklist> {
    const riskLevel: "low" | "medium" | "high" = (stake ?? 0) > 100 ? "high" : (stake ?? 0) > 20 ? "medium" : "low";
    return {
      symbol,
      riskLevel,
      recommendations: [
        `Check recent trend for ${symbol}`,
        contractType ? `Contract type: ${contractType}` : "Consider optimal contract type",
        "Ensure account balance supports the trade",
      ],
      suggestedStake: Math.min(stake ?? 10, 50),
      maxStake: 200,
      warnings: riskLevel === "high" ? ["High stake relative to typical exposure"] : [],
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
  }
}

let instance: AITradingCopilot | null = null;

export function getAITradingCopilot(): AITradingCopilot {
  if (!instance) instance = new AITradingCopilot();
  return instance;
}

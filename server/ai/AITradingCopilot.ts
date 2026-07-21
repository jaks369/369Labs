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

class AITradingCopilot {
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
}

let instance: AITradingCopilot | null = null;

export function getAITradingCopilot(): AITradingCopilot {
  if (!instance) instance = new AITradingCopilot();
  return instance;
}

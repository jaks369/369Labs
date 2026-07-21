export interface MarketHealth {
  symbol: string;
  displayName: string;
  score: number;
  trend: number;
  momentum: number;
  noise: number;
  volatility: "Low" | "Medium" | "High";
  tradeQuality: number;
  recommendation: string;
}

export interface AIInsight {
  id: string;
  market: string;
  message: string;
  confidence: number;
  reasoning: string[];
  timestamp: number;
}

export interface AIPrediction {
  symbol: string;
  prediction: string;
  confidence: number;
  reasoning: string[];
  timestamp: number;
}

export interface RiskAssessment {
  volatility: string;
  confidence: number;
  trendQuality: number;
  warnings: string[];
  recommendation: string;
}

export interface RiskAdvisory {
  symbol: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  confidence: number;
  factors: string[];
  recommendation: string;
  timestamp: number;
}

export interface LiveFeedEntry {
  id: string;
  type: string;
  symbol: string;
  message: string;
  timestamp: number;
  confidence?: number;
  reasoning?: string[];
}

export interface AIState {
  health: Map<string, MarketHealth>;
  predictions: AIPrediction[];
  insights: AIInsight[];
  riskAdvisories: Map<string, RiskAdvisory>;
  feed: LiveFeedEntry[];
  lastUpdated: number;
  active: boolean;
}

export function createDefaultAIState(): AIState {
  return {
    insights: [],
    health: new Map(),
    predictions: [],
    feed: [],
    riskAdvisories: new Map(),
    lastUpdated: 0,
    active: false,
  };
}

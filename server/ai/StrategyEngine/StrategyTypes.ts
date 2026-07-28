export type SignalAction = "BUY" | "SELL" | "WAIT";

export type StrategyCategory =
  | "trend_following"
  | "mean_reversion"
  | "breakout"
  | "momentum"
  | "volatility"
  | "digit_pattern"
  | "ensemble";

export type MarketRegime =
  | "bullish"
  | "bearish"
  | "sideways"
  | "volatile"
  | "calm";

export interface StrategyMeta {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
  version: string;
  minDataPoints: number;
}

export interface MarketData {
  symbol: string;
  prices: number[];
  lastDigits: number[];
  timestamp: number;
}

export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  category: StrategyCategory;
  action: SignalAction;
  confidence: number;
  risk: number;
  riskRewardRatio: number;
  explanation: string;
  reasoning: string[];
  timestamp: number;
}

export interface ConsensusResult {
  consensus: SignalAction;
  confidence: number;
  risk: number;
  riskRewardRatio: number;
  explanation: string;
  contributingStrategies: {
    strategyId: string;
    strategyName: string;
    action: SignalAction;
    confidence: number;
    weight: number;
  }[];
  marketRegime: MarketRegime;
  regimeConfidence: number;
  timestamp: number;
}

export interface StrategyPerformance {
  strategyId: string;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgConfidence: number;
  avgRiskReward: number;
  totalPnl: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number;
  indicators: {
    trend: number;
    momentum: number;
    volatility: number;
    noise: number;
  };
  explanation: string;
}

export const AIKnowledgeType = {
  TRADE_REVIEW: "trade_review",
  STRATEGY_REVIEW: "strategy_review",
  ACCURACY_LOG: "accuracy_log",
  MARKET_PATTERN: "market_pattern",
  AI_INSIGHT: "ai_insight",
} as const;

export type AIKnowledgeType = typeof AIKnowledgeType[keyof typeof AIKnowledgeType];

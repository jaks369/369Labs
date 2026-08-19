export interface StrategyTemplate {
  name: string;
  description: string;
  config: {
    rule: {
      symbol: string;
      condition: { indicator: string; barrier?: number; comparison?: string; count?: number };
      action: { tradeType: string };
      params: { stake: number; duration: number; durationUnit: string };
    };
  };
}

/** Indicators the trading rule engine can actually evaluate — both the server
 *  side (executionEngine) and the client side (conditionEval/BacktestEngine).
 *  Templates advertising anything else deploy but never produce a trade. */
export const SUPPORTED_INDICATORS = [
  "digit_over",
  "digit_under",
  "digit_even",
  "digit_odd",
  "parity",
  "last_digit",
  "consecutive_rise",
  "consecutive_fall",
] as const;

export const SUPPORTED_TRADE_TYPES = [
  "buy_rise",
  "buy_fall",
  "buy_even",
  "buy_odd",
  "buy_over",
  "buy_under",
] as const;

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    name: "Digit Parity",
    description: "Buy even when the last digit just landed even. Statistical edge on parity distribution.",
    config: { rule: { symbol: "R_100", condition: { indicator: "parity", barrier: 0 }, action: { tradeType: "buy_even" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
  },
  {
    name: "Digit Over Momentum",
    description: "Buy over 5 after three consecutive over-5 digits. Momentum on high digits.",
    config: { rule: { symbol: "R_100", condition: { indicator: "digit_over", barrier: 5, comparison: "appears_consecutively", count: 3 }, action: { tradeType: "buy_over" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
  },
  {
    name: "Last-Digit Equal",
    description: "Buy odd when the last digit equaled 7. Plays a single-digit pullback.",
    config: { rule: { symbol: "R_100", condition: { indicator: "last_digit", comparison: "equals", barrier: 7 }, action: { tradeType: "buy_odd" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
  },
  {
    name: "Consecutive Rise",
    description: "Buy rise after three consecutive rising ticks. Simple short-term momentum.",
    config: { rule: { symbol: "R_100", condition: { indicator: "consecutive_rise", comparison: "appears_consecutively", count: 3 }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
  },
  {
    name: "Even Streak",
    description: "Buy even after two consecutive even digits. Follows run persistence in digit patterns.",
    config: { rule: { symbol: "R_100", condition: { indicator: "digit_even", comparison: "appears_consecutively", count: 2 }, action: { tradeType: "buy_even" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
  },
];

export function validateStrategyTemplate(template: StrategyTemplate): string[] {
  const errors: string[] = [];
  const rule = template.config?.rule;
  if (!rule) return [`${template.name}: missing rule`];
  if (rule.condition) {
    if (!SUPPORTED_INDICATORS.includes(rule.condition.indicator as never)) {
      errors.push(`${template.name}: indicator '${rule.condition.indicator}' is not supported by the rule engine`);
    }
  }
  if (rule.action && !SUPPORTED_TRADE_TYPES.includes(rule.action.tradeType as never)) {
    errors.push(`${template.name}: tradeType '${rule.action.tradeType}' is not supported`);
  }
  if (!rule.symbol) errors.push(`${template.name}: missing symbol`);
  const params = rule.params as { stake?: number; duration?: number; durationUnit?: string } | undefined;
  if (!params || params.stake == null || params.duration == null || !params.durationUnit) {
    errors.push(`${template.name}: params must include stake, duration and durationUnit`);
  }
  return errors;
}

export function validateStrategyTemplates(templates: StrategyTemplate[] = STRATEGY_TEMPLATES): string[] {
  return templates.flatMap(validateStrategyTemplate);
}
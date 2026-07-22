const VALID_INDICATORS = ["last_digit", "parity", "consecutive_rise", "consecutive_fall"];
const VALID_COMPARISONS = ["equals", "greater_than", "less_than", "appears", "appears_consecutively"];
const VALID_TRADE_TYPES = ["buy_rise", "buy_fall", "buy_even", "buy_odd", "buy_over", "buy_under"];

export function nlToStrategy(input: any) {
  const rule: any = {
    symbol: input.symbol || "R_100",
    condition: {
      indicator: input.indicator || "last_digit",
      comparison: input.comparison || "equals",
      count: input.count ?? 1,
      barrier: input.barrier ?? null,
    },
    action: {
      tradeType: input.tradeType || "buy_rise",
    },
    params: {
      stake: input.stake ?? 1,
      stopLoss: input.stopLoss ?? 20,
      takeProfit: input.takeProfit ?? 50,
    },
  };
  return rule;
}

export function validateStrategy(rule: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule) return { ok: false, errors: ["Rule is empty"] };
  if (!rule.symbol) errors.push("Symbol is required");
  if (!rule.condition) errors.push("Condition is required");
  else {
    if (!VALID_INDICATORS.includes(rule.condition.indicator)) errors.push(`Invalid indicator: ${rule.condition.indicator}`);
    if (rule.condition.comparison && !VALID_COMPARISONS.includes(rule.condition.comparison)) errors.push(`Invalid comparison: ${rule.condition.comparison}`);
    if (typeof rule.condition.count !== "number" || rule.condition.count < 1) errors.push("Count must be a positive number");
  }
  if (!rule.action) errors.push("Action is required");
  else if (!VALID_TRADE_TYPES.includes(rule.action.tradeType)) errors.push(`Invalid trade type: ${rule.action.tradeType}`);
  if (!rule.params) errors.push("Params are required");
  else {
    if (typeof rule.params.stake !== "number" || rule.params.stake < 0.35) errors.push("Stake must be at least 0.35");
    if (rule.params.stopLoss != null && rule.params.stopLoss < 0) errors.push("Stop loss cannot be negative");
    if (rule.params.takeProfit != null && rule.params.takeProfit < 0) errors.push("Take profit cannot be negative");
  }
  return { ok: errors.length === 0, errors };
}

const TRADE_NAMES: Record<string, string> = {
  buy_rise: "CALL (buy rise)", buy_fall: "PUT (buy fall)", buy_even: "DIGITEVEN (buy even)",
  buy_odd: "DIGITODD (buy odd)", buy_over: "DIGITOVER (buy over)", buy_under: "DIGITUNDER (buy under)",
};

const COMPARISON_NAMES: Record<string, string> = {
  equals: "equals", greater_than: "greater than", less_than: "less than",
  appears: "appears", appears_consecutively: "appears consecutively",
};

export function strategyToNL(rule: any): string {
  if (!rule) return "No rule defined";
  const cond = rule.condition || {};
  const action = rule.action || {};
  const params = rule.params || {};
  const sym = rule.symbol || "?";
  const indicator = cond.indicator || "last_digit";
  const comparison = COMPARISON_NAMES[cond.comparison] || cond.comparison || "equals";
  const count = cond.count ?? 1;
  const barrier = cond.barrier;
  const tradeType = TRADE_NAMES[action.tradeType] || action.tradeType || "buy_rise";
  let desc = `On ${sym}, when the ${indicator.replace(/_/g, " ")} ${comparison}`;
  if (barrier != null) desc += ` ${barrier}`;
  desc += ` ${count} time(s), place a ${tradeType}`;
  if (params.stake) desc += ` with $${params.stake} stake`;
  if (params.stopLoss) desc += `, stop loss $${params.stopLoss}`;
  if (params.takeProfit) desc += `, take profit $${params.takeProfit}`;
  return desc;
}

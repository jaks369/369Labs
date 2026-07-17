// Shared recursive condition evaluator for strategy rules.
// Supports composable conditions (AND/OR/NOT) on top of a single leaf indicator.
// Backward-compatible: a flat StrategyRule.condition is treated as one leaf.

export type IndicatorName =
  | "digit_over" | "digit_under" | "digit_even" | "digit_odd"
  | "parity" | "last_digit" | "consecutive_rise" | "consecutive_fall"
  | "loss_streak"; // true if current consecutive-loss streak >= barrier

export interface LeafCondition {
  indicator: IndicatorName;
  comparison?: "equals" | "greater_than" | "less_than" | "appears" | "appears_consecutively";
  count?: number;
  barrier?: number;
}

export type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode }
  | ({ kind?: "leaf" } & LeafCondition);

export interface EvalContext {
  // Full trailing price history (oldest -> newest), each a number string or number.
  prices: number[];
  // Derived last digits aligned with prices (oldest -> newest).
  digits: number[];
  // Current consecutive loss streak (for "loss_streak" indicator).
  lossStreak?: number;
  // Window size used for "appears" frequency counting.
  window?: number;
}

function lastDigitOf(price: number): number {
  const s = String(price);
  const frac = s.includes(".") ? s.split(".")[1] : "";
  const body = frac.length ? frac : s;
  return parseInt(body[body.length - 1], 10) || 0;
}

function indicatorTrue(ind: LeafCondition, ctx: EvalContext, idx: number): boolean {
  const price = ctx.prices[idx];
  const d = ctx.digits[idx];
  switch (ind.indicator) {
    case "digit_over": return d > (ind.barrier ?? 5);
    case "digit_under": return d < (ind.barrier ?? 5);
    case "digit_even": return d % 2 === 0;
    case "digit_odd": return d % 2 === 1;
    case "parity": return ind.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
    case "last_digit":
      if (ind.comparison === "greater_than") return d > (ind.barrier ?? 5);
      if (ind.comparison === "less_than") return d < (ind.barrier ?? 5);
      return d === (ind.barrier ?? 0);
    case "consecutive_rise": return idx > 0 && ctx.prices[idx] > ctx.prices[idx - 1];
    case "consecutive_fall": return idx > 0 && ctx.prices[idx] < ctx.prices[idx - 1];
    case "loss_streak": return (ctx.lossStreak ?? 0) >= (ind.barrier ?? 1);
    default: return false;
  }
}

// Evaluate a leaf at the most recent `count` ticks.
function leafSatisfied(ind: LeafCondition, ctx: EvalContext): boolean {
  const n = ctx.prices.length;
  if (n === 0) return false;
  const count = ind.count ?? 1;

  if (ind.comparison === "appears_consecutively") {
    if (n < count) return false;
    for (let i = n - count; i < n; i++) if (!indicatorTrue(ind, ctx, i)) return false;
    return true;
  }

  // "appears": frequency within a trailing window.
  const win = ind.comparison === "appears" || !ind.comparison ? (ctx.window ?? 20) : (ctx.window ?? 20);
  const start = Math.max(0, n - win);
  let occ = 0;
  for (let i = start; i < n; i++) if (indicatorTrue(ind, ctx, i)) occ++;
  return occ >= count;
}

export function evaluateNode(node: ConditionNode, ctx: EvalContext): boolean {
  if ("all" in node) return node.all.length > 0 && node.all.every((c) => evaluateNode(c, ctx));
  if ("any" in node) return node.any.some((c) => evaluateNode(c, ctx));
  if ("not" in node) return !evaluateNode(node.not, ctx);
  // leaf
  const leaf: LeafCondition = node.kind === "leaf" || !("kind" in node) ? (node as LeafCondition) : (node as any);
  return leafSatisfied(leaf, ctx);
}

// Convert a legacy flat StrategyRule.condition into a ConditionNode leaf.
export function legacyConditionToNode(c: LeafCondition): ConditionNode {
  return { ...c };
}

export { lastDigitOf };
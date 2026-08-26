/**
 * CANONICAL strategy-condition evaluator.
 *
 * This is the single implementation of "does this rule trigger right now?"
 * used by LIVE bot execution, SERVER backtests, and CLIENT backtests alike.
 * Four divergent copies previously existed (executionEngine, server/backtest,
 * client BacktestEngine, client conditionEval) and had drifted: live execution
 * supported indicator conditions that backtests rejected, and condition-tree /
 * ensemble strategies could be backtested client-side but silently never
 * traded live. Unifying means what users validate IS what executes.
 *
 * Supported rule shapes:
 *   { condition }                       — single leaf (legacy flat form)
 *   { conditions }                      — AND/OR/NOT condition tree
 *   { ensemble: { rules[], vote } }     — weighted vote across sub-rules
 *
 * Leaf indicators:
 *   digit_over | digit_under | digit_even | digit_odd | parity | last_digit
 *   consecutive_rise | consecutive_fall | loss_streak
 *   ema_trend | rsi | macd_histogram          (candle-based)
 */

import { lastDigitOf } from "./lastDigit";
import { buildCandles, ema, rsi, macd } from "./indicators";
import { isSyntheticIndexSymbol } from "./symbols";

export type IndicatorName =
  | "digit_over"
  | "digit_under"
  | "digit_even"
  | "digit_odd"
  | "parity"
  | "last_digit"
  | "consecutive_rise"
  | "consecutive_fall"
  | "loss_streak"
  | "ema_trend"
  | "rsi"
  | "macd_histogram";

export interface LeafCondition {
  indicator: IndicatorName;
  comparison?: string;
  count?: number;
  barrier?: number;
}

export type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode }
  | ({ kind?: "leaf" } & LeafCondition);

const DIGIT_INDICATORS = ["digit_over", "digit_under", "digit_even", "digit_odd", "parity", "last_digit"];

/** Leaf truth at one index of the price/digit series. */
function indicatorTrue(ind: LeafCondition, ctx: EvalContext, idx: number): boolean {
  const d = ctx.digits?.[idx] ?? NaN;
  switch (ind.indicator) {
    case "digit_over":
      return d > (ind.barrier ?? 5);
    case "digit_under":
      return d < (ind.barrier ?? 5);
    case "digit_even":
      return d % 2 === 0;
    case "digit_odd":
      return d % 2 === 1;
    case "parity":
      return ind.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
    case "last_digit":
      if (ind.comparison === "greater_than") return d > (ind.barrier ?? 5);
      if (ind.comparison === "less_than") return d < (ind.barrier ?? 5);
      return d === (ind.barrier ?? 0);
    case "consecutive_rise":
      return idx > 0 && ctx.prices[idx] > ctx.prices[idx - 1];
    case "consecutive_fall":
      return idx > 0 && ctx.prices[idx] < ctx.prices[idx - 1];
    case "loss_streak":
      return (ctx.lossStreak ?? 0) >= (ind.barrier ?? 1);
    default:
      return false;
  }
}

/**
 * Candle-based indicators (ema_trend / rsi / macd_histogram). These operate on
 * 60s candles built from the tick stream, matching live-execution behavior
 * exactly (including the index-based pseudo-epochs when real epochs are not
 * supplied — the shape of the candle series is identical either way).
 */
function indicatorConditionTrue(cond: LeafCondition & { indicator: "ema_trend" | "rsi" | "macd_histogram" }, ctx: EvalContext, idx: number): boolean {
  const pricesUpToIdx = ctx.prices.slice(0, idx + 1);
  if (pricesUpToIdx.length < 30) return false;
  const epochs = ctx.epochs ? ctx.epochs.slice(0, idx + 1) : pricesUpToIdx.map((_, i) => i);
  const tickLikes = pricesUpToIdx.map((p, i) => ({ price: p, epoch: epochs[i] }));
  const candles = buildCandles(tickLikes, 60);
  if (candles.length < 15) return false;
  const closes = candles.map((c) => c.close);

  if (cond.indicator === "ema_trend") {
    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const last = closes.length - 1;
    if (Number.isNaN(fast[last]) || Number.isNaN(slow[last])) return false;
    const emaUp = fast[last] > slow[last];
    return cond.comparison === "up" ? emaUp : !emaUp;
  }

  if (cond.indicator === "rsi") {
    const rsiVal = rsi(closes, 14);
    if (rsiVal === null || rsiVal === undefined) return false;
    const barrier = cond.barrier ?? 30;
    return cond.comparison === "below" ? rsiVal < barrier : rsiVal > barrier;
  }

  // macd_histogram
  if (closes.length < 28) return false;
  const { histogram: curHist } = macd(closes);
  const { histogram: prevHist } = macd(closes.slice(0, -1));
  if (curHist === null || prevHist === null) return false;
  const barrier = cond.barrier ?? 0;
  if (cond.comparison === "crosses_above") return prevHist <= barrier && curHist > barrier;
  if (cond.comparison === "crosses_below") return prevHist >= barrier && curHist < barrier;
  return curHist > barrier;
}

/** Leaf satisfied over the trailing window ending at ctx.idx. */
function leafSatisfied(ind: LeafCondition, ctxIn: EvalContext): boolean {
  const idx = ctxIn.idx ?? ctxIn.prices.length - 1;
  const digits = ctxIn.digits ?? [];
  const ctx: EvalContext = { ...ctxIn, idx, digits };
  if (idx < 0 || idx >= ctx.prices.length) return false;

  // Candle-based indicators are point-in-time at the newest tick only.
  if (ind.indicator === "ema_trend" || ind.indicator === "rsi" || ind.indicator === "macd_histogram") {
    return indicatorConditionTrue(ind as any, ctx, idx);
  }

  // Defense-in-depth: digit-pattern indicators require synthetic indices.
  if (DIGIT_INDICATORS.includes(ind.indicator) && ctx.symbol && !isSyntheticIndexSymbol(ctx.symbol)) {
    return false;
  }

  const count = ind.count ?? 1;
  if (idx + 1 < count) return false;

  if (ind.comparison === "appears_consecutively") {
    for (let i = idx + 1 - count; i <= idx; i++) if (!indicatorTrue(ind, ctx, i)) return false;
    return true;
  }

  // Frequency within the trailing window ending at idx (default 20).
  const win = ctx.window ?? 20;
  const windowStart = Math.max(0, idx - win);
  let occurrences = 0;
  for (let i = windowStart; i <= idx; i++) if (indicatorTrue(ind, ctx, i)) occurrences++;
  return occurrences >= count;
}

export function evaluateNode(node: ConditionNode, ctx: EvalContext): boolean {
  if ("all" in node) return node.all.length > 0 && node.all.every((c) => evaluateNode(c, ctx));
  if ("any" in node) return node.any.some((c) => evaluateNode(c, ctx));
  if ("not" in node) return !evaluateNode(node.not, ctx);
  return leafSatisfied(node as LeafCondition, ctx);
}

export interface EvalContext {
  /** Price series oldest → newest. */
  prices: number[];
  /** Last digits aligned with prices. Derived from `decimals` when omitted. */
  digits?: number[];
  /** Decimal places used to derive digits when `digits` not supplied. */
  decimals?: number;
  /** Tick epochs aligned with prices (candle building). Index-based when omitted. */
  epochs?: number[];
  /** Absolute index into prices/digits being evaluated (defaults to latest). */
  idx?: number;
  /** Symbol for the digit-indicator synthetic guard. */
  symbol?: string;
  /** Consecutive-loss streak for the loss_streak indicator. */
  lossStreak?: number;
  /** Trailing frequency window (default 20). */
  window?: number;
}

/**
 * Evaluate any supported rule shape at ctx.idx (default: latest tick).
 */
export function evaluateRuleCondition(rule: any, ctxIn: EvalContext): boolean {
  if (!rule) return false;
  // Derive digits once so every path (leaf, tree, ensemble) sees them.
  const ctx: EvalContext =
    ctxIn.digits
      ? ctxIn
      : (() => {
          const dec = ctxIn.decimals ?? 2;
          return { ...ctxIn, digits: ctxIn.prices.map((p) => lastDigitOf(p, dec)) };
        })();

  // Ensemble voting over sub-rules (recursive; sub-rules may themselves be trees).
  if (rule.ensemble && Array.isArray(rule.ensemble.rules) && rule.ensemble.rules.length > 0) {
    const en = rule.ensemble;
    const votes = en.rules.filter((r: any) => evaluateRuleCondition(r, ctx)).length;
    if (en.vote === "all") return votes === en.rules.length;
    if (en.vote === "any") return votes >= 1;
    return votes >= Math.ceil(en.rules.length / 2); // majority
  }

  // Condition tree (AND/OR/NOT composition).
  if (rule.conditions) return evaluateNode(rule.conditions as ConditionNode, ctx);

  // Legacy flat leaf.
  const cond = rule.condition;
  if (!cond) return false;

  return leafSatisfied(cond as LeafCondition, ctx);
}

/** Convert a legacy flat condition into a ConditionNode leaf. */
export function legacyConditionToNode(c: LeafCondition): ConditionNode {
  return { ...c };
}

// ---------------------------------------------------------------------------
// Strategy rule / config shapes — the thing bots actually execute on. These
// were previously untyped JSON accessed via `(config as any)?.rule` at ~35
// call sites, so a renamed field failed silently in production.
// ---------------------------------------------------------------------------

export interface RuleParams {
  stake?: string | number;
  stopLoss?: string | number;
  takeProfit?: string | number;
  duration?: number;
  /** Strategy Builder may attach further params; typed access stays safe. */
  [k: string]: unknown;
}

export interface TradingRule {
  symbol?: string;
  /** Direction. Historically both a plain string ("buy") and an object ({ tradeType }) occur in stored configs. */
  action?: string | { tradeType?: string; [k: string]: unknown };
  params?: RuleParams;
  condition?: LeafCondition;
  conditions?: ConditionNode;
  ensemble?: { rules: TradingRule[]; vote?: "all" | "any" | "majority" };
  [k: string]: unknown;
}

/**
 * The JSON stored in strategies.config. `rule` is the executable part;
 * builder UIs may persist additional blocks alongside it.
 */
export interface StrategyConfig {
  rule?: TradingRule;
  [k: string]: unknown;
}

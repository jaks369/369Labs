import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { actionToContractType, calcPnl, simulateOutcome, PAYOUT_RATE } from "@shared/contractSim";
import { isSyntheticIndexSymbol } from "@shared/symbols";
import { evaluateRuleCondition } from "@shared/conditionEval";

const DIGIT_INDICATORS: ReadonlySet<string> = new Set([
  "digit_over",
  "digit_under",
  "digit_even",
  "digit_odd",
  "parity",
  "last_digit",
]);

// Recursively walk a rule object and report whether ANY condition node uses a
// digit-based indicator. Digit conditions are only statistically valid on
// synthetic indices (see isSyntheticIndexSymbol in @shared/symbols).
function ruleUsesDigitConditions(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(ruleUsesDigitConditions);
  const obj = node as Record<string, unknown>;
  if (typeof obj.indicator === "string" && DIGIT_INDICATORS.has(obj.indicator)) return true;
  return Object.values(obj).some(ruleUsesDigitConditions);
}

// Backtests use the CANONICAL shared evaluator — identical semantics to live
// execution, so validated win rates describe the strategy that actually trades.
function evaluateCondition(rule: any, prices: number[], digits: number[], idx: number): boolean {
  return evaluateRuleCondition(rule, { prices, digits, idx });
}

export async function runBacktest(ticks: { price: number; timestamp: number }[], rule: any, stake: number, symbol?: string) {
  if (symbol && !isSyntheticIndexSymbol(symbol) && ruleUsesDigitConditions(rule)) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      valid: false as const,
      interpretation: `Invalid backtest: digit-based conditions (${[...DIGIT_INDICATORS].join(", ")}) are only statistically valid on synthetic indices (R_, 1HZ, BOOM, CRASH). "${symbol}" is a real-market symbol whose digits carry no exploitable structure — any win rate computed here would be a statistical artifact.`,
    };
  }
  const decimals = symbol ? getDecimalPlaces(symbol) : 2;
  const prices = ticks.map((t) => Number(t.price));
  const digits = prices.map((p) => lastDigitOf(p, decimals));
  const { contractType, barrier } = actionToContractType(rule);

  let totalTrades = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    totalPnl = 0;
  let equity = 0,
    peak = 0,
    maxDrawdown = 0;

  for (let i = 0; i < ticks.length; i++) {
    if (!evaluateCondition(rule, prices, digits, i)) continue;
    if (i + 1 >= ticks.length) break;

    const entryPrice = prices[i];
    const exitPrice = prices[i + 1];
    const outcome = simulateOutcome(entryPrice, exitPrice, contractType, barrier, decimals);
    
    if (outcome === "draw") {
      // Draw = stake returned, no PnL, not counted as a trade for win/loss stats.
      // Still count it so the draws figure is accurate (previously stuck at 0).
      draws++;
      i++; // skip the exit tick
      continue;
    }
    
    const result: "win" | "loss" = outcome;
    const pnl = calcPnl(result, stake);

    totalTrades++;
    if (result === "win") wins++;
    else losses++;
    totalPnl += pnl;
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    i++; // skip the exit tick
  }

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = losses > 0 ? (wins * stake * PAYOUT_RATE) / (losses * stake) : wins > 0 ? Infinity : 0;

  return {
    totalTrades,
    wins,
    losses,
    draws,
    winRate,
    totalPnl,
    maxDrawdown,
    profitFactor,
    interpretation: `Win rate ${winRate.toFixed(1)}% over ${totalTrades} trades (${draws} draws excluded), profit factor ${profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}, max drawdown ${maxDrawdown.toFixed(2)}, net P&L ${totalPnl.toFixed(2)}.`,
  };
}

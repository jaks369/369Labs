import { evaluateNode, ConditionNode, EvalContext, lastDigitOf } from "./conditionEval";
import { Tick, DerivContractType } from "./derivWebSocket";
import { getDecimalPlaces } from "@shared/lastDigit";
import { actionToContractType, calcPnl, simulateOutcome } from "@shared/contractSim";

export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  contractType: string;
  result: "win" | "loss";
  pnl: number;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
  equityCurve: number[];
}

function evaluateCondition(rule: any, tick: Tick, history: Tick[], decimals: number): boolean {
  const prices = history.map((t) => Number(t.price));
  const digits = prices.map((p) => lastDigitOf(p, decimals));
  const ctx: EvalContext = { prices, digits, window: 20 };
  if (rule.ensemble && rule.ensemble.rules.length > 0) {
    const en = rule.ensemble;
    const votes = en.rules.filter((r: any) => evaluateCondition(r, tick, history, decimals)).length;
    if (en.vote === "all") return votes === en.rules.length;
    if (en.vote === "any") return votes >= 1;
    return votes >= Math.ceil(en.rules.length / 2);
  }
  if (rule.conditions) return evaluateNode(rule.conditions as ConditionNode, ctx);
  const indicator = rule.condition.indicator;
  const count = rule.condition.count;
  if (history.length < count) return false;
  const checkIndex = (idx: number): boolean => {
    const t = history[idx];
    const d = lastDigitOf(t.price, decimals);
    switch (indicator) {
      case "digit_over":
        return d > (rule.condition.barrier ?? 5);
      case "digit_under":
        return d < (rule.condition.barrier ?? 5);
      case "digit_even":
        return d % 2 === 0;
      case "digit_odd":
        return d % 2 === 1;
      case "parity":
        return rule.condition.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
      case "last_digit":
        if (rule.condition.comparison === "greater_than") return d > (rule.condition.barrier ?? 5);
        if (rule.condition.comparison === "less_than") return d < (rule.condition.barrier ?? 5);
        return d === (rule.condition.barrier ?? 0);
      case "consecutive_rise":
        return idx > 0 && t.price > history[idx - 1].price;
      case "consecutive_fall":
        return idx > 0 && t.price < history[idx - 1].price;
      default:
        return false;
    }
  };
  if (rule.condition.comparison === "appears_consecutively") {
    for (let i = history.length - count; i < history.length; i++) {
      if (!checkIndex(i)) return false;
    }
    return true;
  }
  const windowStart = Math.max(0, history.length - 20);
  let occurrences = 0;
  for (let i = windowStart; i < history.length; i++) {
    if (checkIndex(i)) occurrences++;
  }
  return occurrences >= count;
}

export async function runBacktest(ticks: Tick[], strategy: any, stake: number, symbol?: string): Promise<BacktestResult> {
  const decimals = symbol ? getDecimalPlaces(symbol) : 2;
  const trades: BacktestTrade[] = [];
  const history: Tick[] = [];
  let balance = 0;

  const { contractType, barrier } = actionToContractType(strategy);
  const duration = strategy.params?.duration || 5; // Default 5 ticks like live bot
  const stopLoss = strategy.params?.stopLoss || 0;
  const takeProfit = strategy.params?.takeProfit || 0;

  for (let i = 0; i < ticks.length; i++) {
    // Append the current tick BEFORE evaluating so this matches the live
    // engine, which pushes the tick then evaluates (including it in the
    // condition window). Evaluating against history-minus-current skewed
    // backtest signals one tick behind live behavior.
    history.push(ticks[i]);
    if (evaluateCondition(strategy, ticks[i], history, decimals)) {
      const entryTime = ticks[i].timestamp;
      const entryPrice = ticks[i].price;
      const exitIdx = i + duration;
      if (exitIdx >= ticks.length) break;
      const exitPrice = ticks[exitIdx].price;
      const outcome = simulateOutcome(entryPrice, exitPrice, contractType, barrier, decimals);
      const result: "win" | "loss" = outcome === "draw" ? "loss" : outcome;
      const pnl = calcPnl(result, stake);
      balance += pnl;
      trades.push({ entryTime, entryPrice, exitTime: ticks[exitIdx].timestamp, exitPrice, contractType, result, pnl });
      // Jump past the contract's duration ticks and advance history to match,
      // as the live engine keeps accumulating ticks while a contract is open.
      i = exitIdx;
      for (let j = history.length; j <= exitIdx; j++) history.push(ticks[j]);
    }
  }

  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  const equityCurve: number[] = [];
  for (const t of trades) {
    runningPnl += t.pnl;
    equityCurve.push(runningPnl);
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak - runningPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    totalPnl: balance,
    maxDrawdown,
    trades,
    equityCurve,
  };
}

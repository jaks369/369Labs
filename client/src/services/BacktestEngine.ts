import { evaluateNode, ConditionNode, EvalContext, lastDigitOf } from "./conditionEval";
import { Tick, DerivContractType } from "./derivWebSocket";

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

function lastDigit(price: number): number {
  const fixed = price.toFixed(2);
  return parseInt(fixed[fixed.length - 1], 10);
}

function evaluateCondition(rule: any, tick: Tick, history: Tick[]): boolean {
  const prices = history.map((t) => Number(t.price));
  const digits = prices.map((p) => lastDigitOf(p));
  const ctx: EvalContext = { prices, digits, window: 20 };
  if (rule.ensemble && rule.ensemble.rules.length > 0) {
    const en = rule.ensemble;
    const votes = en.rules.filter((r: any) => evaluateCondition(r, tick, history)).length;
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
    switch (indicator) {
      case "digit_over": return lastDigit(t.price) > (rule.condition.barrier ?? 5);
      case "digit_under": return lastDigit(t.price) < (rule.condition.barrier ?? 5);
      case "digit_even": return lastDigit(t.price) % 2 === 0;
      case "digit_odd": return lastDigit(t.price) % 2 === 1;
      case "consecutive_rise": return idx > 0 && t.price > history[idx - 1].price;
      case "consecutive_fall": return idx > 0 && t.price < history[idx - 1].price;
      default: return false;
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

function simulateTradeOutcome(entryPrice: number, nextPrice: number, contractType: string, barrier?: number): "win" | "loss" {
  switch (contractType) {
    case "CALL": return nextPrice > entryPrice ? "win" : "loss";
    case "PUT": return nextPrice < entryPrice ? "win" : "loss";
    case "DIGITEVEN": return lastDigit(nextPrice) % 2 === 0 ? "win" : "loss";
    case "DIGITODD": return lastDigit(nextPrice) % 2 === 1 ? "win" : "loss";
    case "DIGITOVER": return lastDigit(nextPrice) > (barrier ?? 5) ? "win" : "loss";
    case "DIGITUNDER": return lastDigit(nextPrice) < (barrier ?? 5) ? "win" : "loss";
    default: return nextPrice > entryPrice ? "win" : "loss";
  }
}

function calcPnl(result: "win" | "loss", stake: number): number {
  return result === "win" ? stake * 0.95 : -stake;
}

function actionToContractType(action: any): { contractType: string; barrier?: number } {
  switch (action?.tradeType) {
    case "buy_rise": return { contractType: "CALL" };
    case "buy_fall": return { contractType: "PUT" };
    case "buy_even": return { contractType: "DIGITEVEN" };
    case "buy_odd": return { contractType: "DIGITODD" };
    case "buy_over": return { contractType: "DIGITOVER", barrier: action.barrier ?? 5 };
    case "buy_under": return { contractType: "DIGITUNDER", barrier: action.barrier ?? 5 };
    default: return { contractType: "CALL" };
  }
}

export async function runBacktest(ticks: Tick[], strategy: any, stake: number): Promise<BacktestResult> {
  const trades: BacktestTrade[] = [];
  const history: Tick[] = [];
  let balance = 0;

  const { contractType, barrier } = actionToContractType(strategy.action);

  for (let i = 0; i < ticks.length; i++) {
    history.push(ticks[i]);
    if (evaluateCondition(strategy, ticks[i], history)) {
      const entryTime = ticks[i].timestamp;
      const entryPrice = ticks[i].price;
      const exitIdx = i + 1;
      if (exitIdx >= ticks.length) break;
      const exitPrice = ticks[exitIdx].price;
      const result = simulateTradeOutcome(entryPrice, exitPrice, contractType, barrier);
      const pnl = calcPnl(result, stake);
      balance += pnl;
      trades.push({ entryTime, entryPrice, exitTime: ticks[exitIdx].timestamp, exitPrice, contractType, result, pnl });
      i = exitIdx;
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

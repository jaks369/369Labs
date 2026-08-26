import { evaluateRuleCondition } from "@shared/conditionEval";
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

// Client backtests use the CANONICAL shared evaluator — identical semantics
// to live execution, so client-validated strategies behave the same live.
function evaluateCondition(rule: any, tick: Tick, history: Tick[], decimals: number): boolean {
  const prices = history.map((t) => Number(t.price));
  // idx defaults to the newest element = trailing-window semantics, exactly as before.
  return evaluateRuleCondition(rule, { prices, decimals });
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
    history.push(ticks[i]);
    if (evaluateCondition(strategy, ticks[i], history, decimals)) {
      const entryTime = ticks[i].timestamp;
      const entryPrice = ticks[i].price;
      const exitIdx = i + duration;
      if (exitIdx >= ticks.length) break;
      const exitPrice = ticks[exitIdx].price;
      const outcome = simulateOutcome(entryPrice, exitPrice, contractType, barrier, decimals);
      // Draws (flat rise/fall) are refunds on Deriv — exclude from win/loss, P&L = 0
      if (outcome === "draw") {
        i = exitIdx;
        for (let j = history.length; j <= exitIdx; j++) history.push(ticks[j]);
        continue;
      }
      const result: "win" | "loss" = outcome;
      const pnl = calcPnl(result, stake);
      balance += pnl;
      trades.push({ entryTime, entryPrice, exitTime: ticks[exitIdx].timestamp, exitPrice, contractType, result, pnl });
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

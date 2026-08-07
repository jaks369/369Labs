import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { actionToContractType, calcPnl, simulateOutcome, PAYOUT_RATE } from "@shared/contractSim";

function evaluateCondition(rule: any, prices: number[], digits: number[], idx: number): boolean {
  const cond = rule.condition;
  if (!cond) return false;

  const checkIndex = (i: number): boolean => {
    const d = digits[i];
    switch (cond.indicator) {
      case "digit_over":
        return d > (cond.barrier ?? 5);
      case "digit_under":
        return d < (cond.barrier ?? 5);
      case "digit_even":
        return d % 2 === 0;
      case "digit_odd":
        return d % 2 === 1;
      case "parity":
        return cond.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
      case "last_digit":
        if (cond.comparison === "greater_than") return d > (cond.barrier ?? 5);
        if (cond.comparison === "less_than") return d < (cond.barrier ?? 5);
        return d === (cond.barrier ?? 0);
      case "consecutive_rise":
        return i > 0 && prices[i] > prices[i - 1];
      case "consecutive_fall":
        return i > 0 && prices[i] < prices[i - 1];
      default:
        return false;
    }
  };

  const count = cond.count ?? 1;
  const n = idx + 1;
  if (n < count) return false;

  if (cond.comparison === "appears_consecutively") {
    for (let i = n - count; i <= idx; i++) if (!checkIndex(i)) return false;
    return true;
  }

  const windowStart = Math.max(0, idx - 20);
  let occ = 0;
  for (let i = windowStart; i <= idx; i++) if (checkIndex(i)) occ++;
  return occ >= count;
}

export async function runBacktest(ticks: { price: number; timestamp: number }[], rule: any, stake: number, symbol?: string) {
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

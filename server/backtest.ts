function lastDigitOf(price: number): number {
  const s = String(price).replace(".", "");
  return parseInt(s[s.length - 1], 10) || 0;
}

function evaluateCondition(rule: any, prices: number[], digits: number[], idx: number): boolean {
  const cond = rule.condition;
  if (!cond) return false;

  const checkIndex = (i: number): boolean => {
    const d = digits[i];
    switch (cond.indicator) {
      case "digit_over": return d > (cond.barrier ?? 5);
      case "digit_under": return d < (cond.barrier ?? 5);
      case "digit_even": return d % 2 === 0;
      case "digit_odd": return d % 2 === 1;
      case "parity": return cond.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
      case "last_digit":
        if (cond.comparison === "greater_than") return d > (cond.barrier ?? 5);
        if (cond.comparison === "less_than") return d < (cond.barrier ?? 5);
        return d === (cond.barrier ?? 0);
      case "consecutive_rise": return i > 0 && prices[i] > prices[i - 1];
      case "consecutive_fall": return i > 0 && prices[i] < prices[i - 1];
      default: return false;
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

function simulateOutcome(entryPrice: number, nextPrice: number, contractType: string, barrier?: number): "win" | "loss" {
  switch (contractType) {
    case "CALL": return nextPrice > entryPrice ? "win" : "loss";
    case "PUT": return nextPrice < entryPrice ? "win" : "loss";
    case "DIGITEVEN": return lastDigitOf(nextPrice) % 2 === 0 ? "win" : "loss";
    case "DIGITODD": return lastDigitOf(nextPrice) % 2 === 1 ? "win" : "loss";
    case "DIGITOVER": return lastDigitOf(nextPrice) > (barrier ?? 5) ? "win" : "loss";
    case "DIGITUNDER": return lastDigitOf(nextPrice) < (barrier ?? 5) ? "win" : "loss";
    default: return nextPrice > entryPrice ? "win" : "loss";
  }
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

export async function runBacktest(ticks: { price: number; timestamp: number }[], rule: any, stake: number) {
  const prices = ticks.map(t => Number(t.price));
  const digits = prices.map(p => lastDigitOf(p));
  const { contractType, barrier } = actionToContractType(rule.action);

  let totalTrades = 0, wins = 0, losses = 0, totalPnl = 0;
  let equity = 0, peak = 0, maxDrawdown = 0;

  for (let i = 0; i < ticks.length; i++) {
    if (!evaluateCondition(rule, prices, digits, i)) continue;
    if (i + 1 >= ticks.length) break;

    const entryPrice = prices[i];
    const exitPrice = prices[i + 1];
    const result = simulateOutcome(entryPrice, exitPrice, contractType, barrier);
    const pnl = result === "win" ? stake * 0.95 : -stake;

    totalTrades++;
    if (result === "win") wins++; else losses++;
    totalPnl += pnl;
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    i++; // skip the exit tick
  }

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = losses > 0 ? (wins * stake * 0.95) / (losses * stake) : wins > 0 ? Infinity : 0;

  return {
    totalTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    maxDrawdown,
    profitFactor,
    interpretation: `Win rate ${winRate.toFixed(1)}% over ${totalTrades} trades, profit factor ${profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}, max drawdown ${maxDrawdown.toFixed(2)}, net P&L ${totalPnl.toFixed(2)}.`,
  };
}

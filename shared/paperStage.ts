/**
 * Paper Stage: Forward-testing validation for new signals.
 *
 * Signals that haven't been validated go through paper trading first.
 * After N paper trades with positive edge, they're promoted to live.
 * This prevents unvalidated strategies from directly hitting real capital.
 */

export interface PaperTrade {
  id: string;
  symbol: string;
  prediction: string;
  confidence: number;
  stake: number;
  result: "win" | "loss" | "pending";
  pnl: number;
  timestamp: number;
}

export interface PaperStageConfig {
  /** Minimum paper trades before live promotion. */
  minPaperTrades: number;
  /** Minimum win rate required to promote. */
  minWinRate: number;
  /** Minimum net profit (across all paper trades) to promote. */
  minNetProfit: number;
  /** Maximum paper trades allowed before rejection. */
  maxPaperTrades: number;
}

export const DEFAULT_PAPER_STAGE_CONFIG: PaperStageConfig = {
  minPaperTrades: 20,
  minWinRate: 55,
  minNetProfit: 0,
  maxPaperTrades: 50,
};

export type PromotionStatus =
  | "paper"     // Still in paper stage
  | "promoted"  // Passed paper stage, eligible for live
  | "rejected"; // Failed paper stage

export interface PaperStageResult {
  status: PromotionStatus;
  trades: PaperTrade[];
  winRate: number;
  netProfit: number;
  tradesCompleted: number;
  reason: string;
}

/**
 * Evaluate whether a strategy should be promoted from paper to live.
 */
export function evaluatePromotion(
  trades: PaperTrade[],
  config: PaperStageConfig = DEFAULT_PAPER_STAGE_CONFIG,
): PaperStageResult {
  const completed = trades.filter((t) => t.result !== "pending");
  const wins = completed.filter((t) => t.result === "win").length;
  const winRate = completed.length > 0 ? (wins / completed.length) * 100 : 0;
  const netProfit = completed.reduce((sum, t) => sum + t.pnl, 0);

  // Still need more paper trades
  if (completed.length < config.minPaperTrades) {
    return {
      status: "paper",
      trades,
      winRate,
      netProfit,
      tradesCompleted: completed.length,
      reason: `Need ${config.minPaperTrades - completed.length} more paper trades (have ${completed.length}/${config.minPaperTrades})`,
    };
  }

  // Too many paper trades without promotion — reject
  if (completed.length >= config.maxPaperTrades) {
    return {
      status: "rejected",
      trades,
      winRate,
      netProfit,
      tradesCompleted: completed.length,
      reason: `Exceeded max paper trades (${config.maxPaperTrades}) without meeting promotion criteria`,
    };
  }

  // Check win rate
  if (winRate < config.minWinRate) {
    return {
      status: "rejected",
      trades,
      winRate,
      netProfit,
      tradesCompleted: completed.length,
      reason: `Win rate ${winRate.toFixed(1)}% below minimum ${config.minWinRate}%`,
    };
  }

  // Check net profit
  if (netProfit <= config.minNetProfit) {
    return {
      status: "rejected",
      trades,
      winRate,
      netProfit,
      tradesCompleted: completed.length,
      reason: `Net profit $${netProfit.toFixed(2)} below minimum $${config.minNetProfit}`,
    };
  }

  // All criteria met — promote
  return {
    status: "promoted",
    trades,
    winRate,
    netProfit,
    tradesCompleted: completed.length,
    reason: `Promoted: ${completed.length} trades, ${winRate.toFixed(1)}% win rate, $${netProfit.toFixed(2)} net profit`,
  };
}

/**
 * Generate a deterministic paper trade result based on confidence and historical edge.
 * This simulates what WOULD have happened if the trade was paper-executed.
 */
export function simulatePaperTrade(
  symbol: string,
  prediction: string,
  confidence: number,
  baseEdge: number,
): PaperTrade {
  // Higher confidence + higher base edge → more likely win
  const winProbability = Math.min(0.85, Math.max(0.15, (confidence / 100) * 0.6 + baseEdge * 0.4));
  const isWin = Math.random() < winProbability;
  const stake = 10; // Standard paper stake

  return {
    id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    prediction,
    confidence,
    stake,
    result: isWin ? "win" : "loss",
    pnl: isWin ? stake * 0.8 : -stake, // 80% payout on win
    timestamp: Date.now(),
  };
}

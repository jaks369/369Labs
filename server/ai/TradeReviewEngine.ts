import * as db from "../db";

interface TradeInput {
  id?: number;
  symbol: string;
  contractType?: string;
  stake: string;
  profitLoss?: string;
  result: string;
  entryTime: Date;
  exitTime?: Date;
  strategyId?: number;
  botRunId?: number;
  contractId?: string;
  entryPrice: string;
  exitPrice?: string;
}

interface MarketContext {
  healthScore: number;
  volatility: string;
  trend: number;
  momentum: number;
  recentTicks: number;
  recentPrediction?: { prediction: string; confidence: number };
}

export interface TradeReview {
  whyTradeWasTaken: string;
  marketConditions: string;
  whatWentRight: string[];
  whatWentWrong: string[];
  riskAssessment: string;
  suggestedImprovements: string[];
  score: number;
}

function computeReview(trade: TradeInput, ctx: MarketContext): TradeReview {
  const stake = parseFloat(trade.stake) || 0;
  const pnl = parseFloat(trade.profitLoss || "0");
  const isWin = trade.result === "win";

  const avgEntry = parseFloat(trade.entryPrice) || 0;
  const avgExit = parseFloat(trade.exitPrice || "0") || 0;

  const review: TradeReview = {
    whyTradeWasTaken: "",
    marketConditions: "",
    whatWentRight: [],
    whatWentWrong: [],
    riskAssessment: "",
    suggestedImprovements: [],
    score: 50,
  };

  if (ctx.recentPrediction) {
    review.whyTradeWasTaken = `Trade taken based on ${ctx.recentPrediction.prediction} signal with ${ctx.recentPrediction.confidence}% confidence.`;
  } else if (trade.strategyId) {
    review.whyTradeWasTaken = `Trade executed under strategy #${trade.strategyId}.`;
  } else {
    review.whyTradeWasTaken = "Manual trade executed based on market observation.";
  }

  review.marketConditions = [
    `Market health: ${ctx.healthScore}/100`,
    `Volatility: ${ctx.volatility}`,
    `Trend bias: ${ctx.trend > 0 ? "upward" : ctx.trend < 0 ? "downward" : "neutral"} (${ctx.trend}%)`,
    `Momentum: ${ctx.momentum > 0 ? "positive" : ctx.momentum < 0 ? "negative" : "flat"} (${ctx.momentum}%)`,
    `Ticks analyzed: ${ctx.recentTicks}`,
  ].join(" | ");

  if (isWin) {
    if (pnl > 0) review.whatWentRight.push(`Trade resulted in profit: +${pnl.toFixed(2)}`);
    else review.whatWentRight.push("Trade completed as expected (winning trade).");
    if (avgEntry > 0 && avgExit > 0) {
      const direction = avgExit > avgEntry ? "upward" : "downward";
      review.whatWentRight.push(`Correct ${direction} direction captured (entry ${avgEntry.toFixed(4)} → exit ${avgExit.toFixed(4)}).`);
    }
  } else {
    if (pnl < 0) review.whatWentWrong.push(`Trade resulted in loss: ${pnl.toFixed(2)}`);
    else review.whatWentWrong.push("Trade did not complete as expected.");

    if (ctx.recentPrediction && ctx.recentPrediction.confidence < 60) {
      review.whatWentWrong.push(`Prediction confidence was low (${ctx.recentPrediction.confidence}%) — contributed to losing trade.`);
    }
    if (ctx.volatility === "High") {
      review.whatWentWrong.push("High volatility market conditions increased trade risk.");
    } else if (ctx.momentum < -5) {
      review.whatWentWrong.push("Negative momentum was working against the trade direction.");
    }
  }

  if (ctx.volatility === "High") {
    review.riskAssessment = `HIGH RISK — ${ctx.healthScore < 50 ? "Unhealthy" : "Moderately healthy"} market with elevated volatility. Stake ${stake.toFixed(2)} was ${stake > 50 ? "aggressive" : "reasonable"} for current conditions.`;
  } else if (ctx.volatility === "Low") {
    review.riskAssessment = `LOW RISK — Stable market conditions. Stake ${stake.toFixed(2)} was appropriate.`;
  } else {
    review.riskAssessment = `MODERATE RISK — Normal market volatility. Stake ${stake.toFixed(2)} ${stake > 100 ? "may be high" : "appears appropriate"}.`;
  }

  if (trade.contractType) {
    if (!isWin && trade.contractType === "CALL" && ctx.trend < -3) {
      review.suggestedImprovements.push(`Avoid CALL contracts during strong downtrend (trend ${ctx.trend}%).`);
    }
    if (!isWin && trade.contractType === "PUT" && ctx.trend > 3) {
      review.suggestedImprovements.push(`Avoid PUT contracts during strong uptrend (trend ${ctx.trend}%).`);
    }
  }

  if (stake > 100) {
    review.suggestedImprovements.push("Consider reducing stake size to under 100 for better risk management.");
  }

  if (pnl < -stake * 0.5) {
    review.suggestedImprovements.push(`Loss (${pnl.toFixed(2)}) exceeded 50% of stake (${stake.toFixed(2)}) — consider tighter stop-loss.`);
  }

  if (!isWin && ctx.healthScore < 40) {
    review.suggestedImprovements.push("Trade during low market health — consider waiting for healthier conditions.");
  }

  if (review.whatWentRight.length === 0) {
    review.whatWentRight.push("Trade was executed and settled properly.");
  }
  if (review.whatWentWrong.length === 0) {
    review.whatWentWrong.push("No significant issues detected in this trade.");
  }

  if (isWin) {
    review.score = Math.min(100, 60 + Math.round(pnl / stake * 20));
  } else {
    review.score = Math.max(10, 40 - Math.round(Math.abs(pnl) / stake * 20));
  }

  return review;
}

export class TradeReviewEngine {
  async review(trade: TradeInput, userId: number): Promise<{ review: TradeReview; marketContext: MarketContext }> {
    let healthScore = 50;
    let volatility = "Medium";
    let trend = 0;
    let momentum = 0;
    let recentTicks = 0;
    let recentPrediction: { prediction: string; confidence: number } | undefined;

    try {
      const ticks = await db.getTickHistory(trade.symbol, 60);
      if (ticks.length > 0) {
        const prices = ticks.map((t: any) => Number(t.price)).filter((p: number) => !isNaN(p));
        recentTicks = prices.length;
        if (prices.length >= 2) {
          const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
          const secondHalf = prices.slice(Math.floor(prices.length / 2));
          const firstMean = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
          const secondMean = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
          trend = firstMean !== 0 ? ((secondMean - firstMean) / Math.abs(firstMean)) * 100 : 0;

          if (prices.length >= 10) {
            const oldPrices = prices.slice(0, prices.length - 5);
            const newPrices = prices.slice(-5);
            const oldMean = oldPrices.reduce((a: number, b: number) => a + b, 0) / oldPrices.length;
            const newMean = newPrices.reduce((a: number, b: number) => a + b, 0) / newPrices.length;
            momentum = oldMean !== 0 ? ((newMean - oldMean) / Math.abs(oldMean)) * 100 : 0;
          }
        }

        const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        const variance = prices.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / prices.length;
        const std = Math.sqrt(variance);
        if (std > 0 && mean !== 0) {
          const cv = std / Math.abs(mean);
          volatility = cv > 0.01 ? "High" : cv < 0.003 ? "Low" : "Medium";
        }

        healthScore = Math.min(100, Math.round(50 + trend * 2 + momentum * 1.5));
        healthScore = Math.max(10, Math.min(100, healthScore));
      }

      const accuracyEntries = await db.getAiKnowledge(userId, "accuracy_log", 10);
      const lastEntry = accuracyEntries[0];
      if (lastEntry?.data) {
        const d = lastEntry.data as any;
        if (d.prediction && d.confidence) {
          recentPrediction = { prediction: d.prediction, confidence: Number(d.confidence) };
        }
      }
    } catch {
      /* non-critical */
    }

    const marketContext: MarketContext = { healthScore, volatility, trend, momentum, recentTicks, recentPrediction };
    const review = computeReview(trade, marketContext);

    return { review, marketContext };
  }
}

export const tradeReviewEngine = new TradeReviewEngine();

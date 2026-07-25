import * as db from "../db";

function analyzeRule(rule: any) {
  const findings: string[] = [];
  let score = 50;
  const warnings: string[] = [];

  if (!rule) {
    return { review: "No executable rule found in strategy config.", score: 0, findings: [], warnings: ["Strategy has no rule."] };
  }

  if (!rule.symbol) {
    warnings.push("No symbol selected.");
    score -= 20;
  } else {
    findings.push(`Target symbol: ${rule.symbol}.`);
    score += 5;
  }

  if (!rule.action || !rule.action.tradeType) {
    warnings.push("No trade action defined (e.g. buy_rise, buy_fall).");
    score -= 20;
  } else {
    const validActions = ["buy_rise", "buy_fall", "buy_even", "buy_odd", "buy_over", "buy_under"];
    if (!validActions.includes(rule.action.tradeType)) {
      warnings.push(`Unknown trade action: ${rule.action.tradeType}.`);
      score -= 10;
    } else {
      findings.push(`Trade action: ${rule.action.tradeType}.`);
      score += 5;
    }
  }

  if (rule.condition) {
    const cond = rule.condition;
    const validIndicators = ["digit_over", "digit_under", "digit_even", "digit_odd", "parity", "last_digit", "consecutive_rise", "consecutive_fall"];
    if (!validIndicators.includes(cond.indicator)) {
      warnings.push(`Unknown indicator: ${cond.indicator}.`);
      score -= 10;
    } else {
      findings.push(`Condition: ${cond.indicator} with count ${cond.count ?? 1}.`);
      score += 5;
    }

    if (!cond.count || cond.count < 1) {
      warnings.push("Condition count should be at least 1.");
      score -= 5;
    }

    if (["digit_over", "digit_under", "last_digit", "parity"].includes(cond.indicator) && (cond.barrier === undefined || cond.barrier < 0 || cond.barrier > 9)) {
      warnings.push(`Indicator "${cond.indicator}" requires a barrier between 0-9.`);
      score -= 5;
    }
  } else if (rule.conditions) {
    findings.push("Uses advanced condition tree (AND/OR/NOT logic).");
    score += 10;
  } else {
    warnings.push("No entry conditions defined.");
    score -= 15;
  }

  if (rule.ensemble && rule.ensemble.rules && rule.ensemble.rules.length > 0) {
    findings.push(`Ensemble with ${rule.ensemble.rules.length} sub-strategies (vote: ${rule.ensemble.vote || "majority"}).`);
    score += 10;
  }

  if (rule.params) {
    const stake = Number(rule.params.stake);
    if (isNaN(stake) || stake < 0.35) {
      warnings.push("Stake must be at least 0.35.");
      score -= 5;
    } else if (stake > 100) {
      warnings.push("High stake — ensure risk management is configured.");
      score -= 5;
    } else {
      findings.push(`Stake: $${stake}.`);
      score += 5;
    }

    if (rule.params.stopLoss > 0) {
      findings.push(`Stop-loss set at $${rule.params.stopLoss}.`);
      score += 10;
    } else {
      warnings.push("No stop-loss configured.");
      score -= 5;
    }

    if (rule.params.takeProfit > 0) {
      findings.push(`Take-profit set at $${rule.params.takeProfit}.`);
      score += 5;
    }
  } else {
    warnings.push("No trading parameters (stake, stop-loss) configured.");
    score -= 10;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    findings,
    warnings,
  };
}

async function fetchTradeStats(userId: number, symbol: string) {
  try {
    const trades = await db.getTradesByUserId(userId, 100);
    const symTrades = trades.filter((t: any) => t.symbol === symbol && t.result !== "pending");
    if (symTrades.length < 5) return null;
    const wins = symTrades.filter((t: any) => t.result === "win").length;
    const totalPnl = symTrades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
    return { tradeCount: symTrades.length, winRate: (wins / symTrades.length) * 100, totalPnl };
  } catch {
    return null;
  }
}

export const strategyIntelligence = {
  async review(strategy: any, userId: number) {
    if (!strategy) {
      return { review: "No strategy data provided.", score: 0, warnings: ["Empty strategy."] };
    }

    const config = strategy.config || {};
    const rule = config.rule || config;

    const analysis = analyzeRule(rule);
    const reviewParts: string[] = [];
    const allWarnings: string[] = [...analysis.warnings];

    if (analysis.findings.length > 0) {
      reviewParts.push("**Structure:** " + analysis.findings.join(" "));
    }

    if (analysis.score >= 80) {
      reviewParts.push("**Verdict:** Well-structured strategy. Ready for deployment with proper risk management.");
    } else if (analysis.score >= 50) {
      reviewParts.push("**Verdict:** Functional — address the warnings below before full deployment.");
    } else {
      reviewParts.push("**Verdict:** Needs significant revision — review the warnings and restructure.");
    }

    reviewParts.push(`**Score:** ${analysis.score}/100`);

    // Historical context if available
    if (rule?.symbol) {
      const stats = await fetchTradeStats(userId, rule.symbol);
      if (stats) {
        reviewParts.push(`**Historical context:** ${stats.tradeCount} trades on ${rule.symbol} — win rate ${stats.winRate.toFixed(1)}%, net P&L $${stats.totalPnl.toFixed(2)}.`);
        if (stats.winRate < 40) allWarnings.push(`Historical win rate on ${rule.symbol} is only ${stats.winRate.toFixed(0)}%.`);
        if (stats.totalPnl < 0) allWarnings.push(`Historical P&L on ${rule.symbol} is negative.`);
      }
    }

    // Risk warnings
    if (allWarnings.length > 0) {
      reviewParts.push("**Warnings:**");
      for (const w of allWarnings) {
        reviewParts.push(`- ${w}`);
      }
    }

    return {
      review: reviewParts.join("\n"),
      score: analysis.score,
      warnings: allWarnings.slice(0, 5),
    };
  },
};

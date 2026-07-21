import * as db from "../db";
import { aiMemory } from "./AIMemory";
import { AIKnowledgeType } from "./knowledgeTypes";

export interface PortfolioOverview {
  accuracyPct: number;
  winRate: number;
  totalPnL: number;
  totalTrades: number;
  avgConfidence: number;
  riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  consistencyScore: number;
}

export interface AccuracyDetail {
  bySymbol: { symbol: string; accuracy: number; total: number }[];
  byContractType: { type: string; accuracy: number; total: number }[];
  overTime: { period: string; accuracy: number; total: number }[];
  confidenceVsOutcome: { range: string; accuracy: number; total: number }[];
}

type AccuracyStats = {
  totalPredictions: number;
  correct: number;
  accuracyPct: number;
  bySymbol: Record<string, { total: number; correct: number; accuracyPct: number }>;
  byContractType: Record<string, { total: number; correct: number; accuracyPct: number }>;
};

export interface TradeIntelligenceData {
  commonStrengths: string[];
  commonWeaknesses: string[];
  commonLossReasons: string[];
  successfulSetups: { pattern: string; count: number; winRate: number }[];
  failedSetups: { pattern: string; count: number; winRate: number }[];
}

export interface RiskBehaviourData {
  avgStakePct: number;
  avgExposure: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  recoveryRate: number;
  overtradingScore: number;
  streakSummary: string;
}

export interface StrategyRanking {
  id: number;
  name: string;
  score: number;
  confidence: number;
  winRate: number;
  improvementTrend: "improving" | "declining" | "stable";
  lastReviewed: string;
}

let engineInstance: AIPerformanceEngine | null = null;

export class AIPerformanceEngine {
  async getOverview(userId: number): Promise<PortfolioOverview> {
    try {
      const [accuracy, trades, summary] = await Promise.all([
        aiMemory.getAccuracyStats(userId),
        db.getTradesByUserId(userId, 200),
        aiMemory.getPerformanceSummary(userId),
      ]);

      const totalTrades = trades.length || 0;
      const wins = trades.filter((t) => t.result === "win").length;
      const losses = trades.filter((t) => t.result === "loss").length;
      const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
      const totalPnL = trades.reduce((sum, t) => sum + Number(t.profitLoss || 0), 0);

      const avgConfidence = this.calcAvgConfidence(accuracy);
      const consistencyScore = this.calcConsistency(trades);
      const riskRating = this.calcRiskRating(trades, accuracy, summary);

      return {
        accuracyPct: accuracy.accuracyPct,
        winRate,
        totalPnL: Math.round(totalPnL * 100) / 100,
        totalTrades,
        avgConfidence,
        riskRating,
        consistencyScore,
      };
    } catch {
      return { accuracyPct: 0, winRate: 0, totalPnL: 0, totalTrades: 0, avgConfidence: 0, riskRating: "MEDIUM" as const, consistencyScore: 0 };
    }
  }

  async getAccuracyDetail(userId: number): Promise<AccuracyDetail> {
    try {
      const entries = await db.getAiKnowledge(userId, AIKnowledgeType.ACCURACY_LOG, 500);
      const bySymbolMap: Record<string, { total: number; correct: number }> = {};
      const byTypeMap: Record<string, { total: number; correct: number }> = {};
      const byPeriod: Record<string, { total: number; correct: number }> = {};
      const byConfidence: Record<string, { total: number; correct: number }> = {};

      for (const entry of entries) {
        const d = entry.data as any;
        if (!d) continue;
        const correct = d.correct || d.matched ? 1 : 0;

        const sym = entry.symbol || d.symbol || "unknown";
        if (!bySymbolMap[sym]) bySymbolMap[sym] = { total: 0, correct: 0 };
        bySymbolMap[sym].total++;
        bySymbolMap[sym].correct += correct;

        const ct = d.contractType || "unknown";
        if (!byTypeMap[ct]) byTypeMap[ct] = { total: 0, correct: 0 };
        byTypeMap[ct].total++;
        byTypeMap[ct].correct += correct;

        const date = new Date(entry.createdAt);
        const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!byPeriod[periodKey]) byPeriod[periodKey] = { total: 0, correct: 0 };
        byPeriod[periodKey].total++;
        byPeriod[periodKey].correct += correct;

        const conf = d.confidence ?? 50;
        const range = conf >= 80 ? "80-100%" : conf >= 60 ? "60-79%" : conf >= 40 ? "40-59%" : "0-39%";
        if (!byConfidence[range]) byConfidence[range] = { total: 0, correct: 0 };
        byConfidence[range].total++;
        byConfidence[range].correct += correct;
      }

      const bySymbol = Object.entries(bySymbolMap)
        .map(([symbol, v]) => ({ symbol, accuracy: Math.round((v.correct / (v.total || 1)) * 100), total: v.total }))
        .sort((a, b) => b.total - a.total);

      const byContractType = Object.entries(byTypeMap)
        .map(([type, v]) => ({ type, accuracy: Math.round((v.correct / (v.total || 1)) * 100), total: v.total }))
        .sort((a, b) => b.total - a.total);

      const overTime = Object.entries(byPeriod)
        .map(([period, v]) => ({ period, accuracy: Math.round((v.correct / (v.total || 1)) * 100), total: v.total }))
        .sort((a, b) => a.period.localeCompare(b.period));

      const confidenceVsOutcome = Object.entries(byConfidence)
        .map(([range, v]) => ({ range, accuracy: Math.round((v.correct / (v.total || 1)) * 100), total: v.total }));

      return { bySymbol, byContractType, overTime, confidenceVsOutcome };
    } catch {
      return { bySymbol: [], byContractType: [], overTime: [], confidenceVsOutcome: [] };
    }
  }

  async getTradeIntelligence(userId: number): Promise<TradeIntelligenceData> {
    try {
      const entries = await db.getAiKnowledge(userId, AIKnowledgeType.TRADE_REVIEW, 200);
      const tradesData = await db.getTradesByUserId(userId, 200);

      const strengthCounts: Record<string, number> = {};
      const weaknessCounts: Record<string, number> = {};
      const lossReasons: Record<string, number> = {};
      const setupPerformance: Record<string, { total: number; wins: number }> = {};

      for (const tr of entries) {
        const d = tr.data as any;
        if (!d) continue;

        const reasons = d.reasons || d.result?.reasons || [];
        const suggestions = d.suggestions || d.result?.suggestions || [];
        const outcome = d.tradeResult || d.result?.outcome || "";
        const symbol = tr.symbol || d.context?.symbol || "";
        const contractType = d.context?.contractType || "";
        const setupKey = `${symbol} ${contractType}`.trim() || "unknown";

        for (const r of reasons) {
          if (outcome === "win") {
            strengthCounts[r] = (strengthCounts[r] || 0) + 1;
          } else {
            lossReasons[r] = (lossReasons[r] || 0) + 1;
          }
        }

        for (const s of suggestions) {
          if (outcome === "loss") {
            weaknessCounts[s] = (weaknessCounts[s] || 0) + 1;
          }
        }

        if (setupKey) {
          if (!setupPerformance[setupKey]) setupPerformance[setupKey] = { total: 0, wins: 0 };
          setupPerformance[setupKey].total++;
          if (outcome === "win") setupPerformance[setupKey].wins++;
        }
      }

      const commonStrengths = Object.entries(strengthCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);

      const commonWeaknesses = Object.entries(weaknessCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);

      const commonLossReasonsList = Object.entries(lossReasons)
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);

      const setups = Object.entries(setupPerformance)
        .filter(([, v]) => v.total >= 3)
        .map(([pattern, v]) => ({ pattern, count: v.total, winRate: Math.round((v.wins / v.total) * 100) }));

      const successfulSetups = setups.filter((s) => s.winRate >= 60).sort((a, b) => b.count - a.count);
      const failedSetups = setups.filter((s) => s.winRate < 40).sort((a, b) => b.count - a.count);

      return {
        commonStrengths,
        commonWeaknesses,
        commonLossReasons: commonLossReasonsList,
        successfulSetups,
        failedSetups,
      };
    } catch {
      return { commonStrengths: [], commonWeaknesses: [], commonLossReasons: [], successfulSetups: [], failedSetups: [] };
    }
  }

  async getRiskBehaviour(userId: number): Promise<RiskBehaviourData> {
    try {
      const trades = await db.getTradesByUserId(userId, 200);

      if (trades.length === 0) {
        return { avgStakePct: 0, avgExposure: 0, maxConsecutiveWins: 0, maxConsecutiveLosses: 0, recoveryRate: 0, overtradingScore: 0, streakSummary: "No trade data available" };
      }

      const totalStake = trades.reduce((sum, t) => sum + Number(t.stake || 0), 0);
      const avgStake = totalStake / trades.length;

      const account = await db.getAccountByUserId(userId).catch(() => null);
      const balance = account ? Number(account.balance) || 0 : 0;
      const avgStakePct = balance > 0 ? Math.round((avgStake / balance) * 100 * 10) / 10 : 0;

      const results = trades.filter((t) => t.result === "win" || t.result === "loss");
      let maxConsecutiveWins = 0;
      let maxConsecutiveLosses = 0;
      let currentStreak = 0;
      let currentStreakType = "";
      let wins = 0;
      let losses = 0;
      let streaks: string[] = [];

      for (const t of results) {
        if (t.result === "win") {
          wins++;
          if (currentStreakType === "win") {
            currentStreak++;
          } else {
            if (currentStreak > 0 && currentStreakType === "loss") {
              streaks.push(`L${currentStreak}`);
            }
            currentStreak = 1;
            currentStreakType = "win";
          }
          maxConsecutiveWins = Math.max(maxConsecutiveWins, currentStreak);
        } else if (t.result === "loss") {
          losses++;
          if (currentStreakType === "loss") {
            currentStreak++;
          } else {
            if (currentStreak > 0 && currentStreakType === "win") {
              streaks.push(`W${currentStreak}`);
            }
            currentStreak = 1;
            currentStreakType = "loss";
          }
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
        }
      }

      let recoveryRate = 0;
      if (losses > 0) {
        const afterLoss = results.filter((t, i) => i > 0 && results[i - 1].result === "loss" && t.result === "win");
        recoveryRate = Math.round((afterLoss.length / losses) * 100);
      }

      const tradeCountByDay: Record<string, number> = {};
      for (const t of trades) {
        const day = new Date(t.entryTime).toISOString().slice(0, 10);
        tradeCountByDay[day] = (tradeCountByDay[day] || 0) + 1;
      }
      const avgTradesPerDay = Object.values(tradeCountByDay).reduce((a, b) => a + b, 0) / Math.max(Object.keys(tradeCountByDay).length, 1);
      const overtradingScore = avgTradesPerDay > 20 ? 100 : avgTradesPerDay > 10 ? 60 : avgTradesPerDay > 5 ? 30 : 0;

      const total = results.length;
      const pnl = trades.reduce((sum, t) => sum + Number(t.profitLoss || 0), 0);
      const streakSummary = total > 0
        ? `${wins}W / ${losses}L (${Math.round((wins / total) * 100)}%) G현 PnL: ${pnl >= 0 ? "+" : ""}${Math.round(pnl * 100) / 100}`
        : "No completed trades";

      return {
        avgStakePct,
        avgExposure: Math.round(avgStake * 100) / 100,
        maxConsecutiveWins,
        maxConsecutiveLosses,
        recoveryRate,
        overtradingScore,
        streakSummary,
      };
    } catch {
      return { avgStakePct: 0, avgExposure: 0, maxConsecutiveWins: 0, maxConsecutiveLosses: 0, recoveryRate: 0, overtradingScore: 0, streakSummary: "Data unavailable" };
    }
  }

  async getStrategyRankings(userId: number): Promise<StrategyRanking[]> {
    try {
      const [strategies, strategyReviews] = await Promise.all([
        db.getStrategiesByUserId(userId),
        db.getAiKnowledge(userId, AIKnowledgeType.STRATEGY_REVIEW, 100),
      ]);

      if (!strategies || strategies.length === 0) return [];

      const trades = await db.getTradesByUserId(userId, 200);

      const rankings = strategies
        .filter((s) => s.config && typeof s.config === "object")
        .map((s) => {
          const reviews = strategyReviews.filter((r) => r.relatedStrategyId === s.id);
          const lastReview = reviews.length > 0 ? reviews[0] : null;
          const prevReview = reviews.length > 1 ? reviews[1] : null;
          const reviewData = lastReview?.data as any;

          const score = reviewData?.strategyScore ?? 0;
          const confidence = reviewData?.confidence ?? 0;

          const matchedTrades = trades.filter((t) => t.strategyId === s.id);
          const wins = matchedTrades.filter((t) => t.result === "win").length;
          const totalMatched = matchedTrades.length;
          const winRate = totalMatched > 0 ? Math.round((wins / totalMatched) * 100) : 0;

          const prevScore = prevReview?.data ? (prevReview.data as any).strategyScore ?? score : score;
          const improvementTrend = score > prevScore ? "improving" : score < prevScore ? "declining" : "stable";

          return {
            id: s.id,
            name: s.name,
            score,
            confidence,
            winRate,
            improvementTrend,
            lastReviewed: lastReview?.createdAt
              ? new Date(lastReview.createdAt).toISOString()
              : s.updatedAt
                ? new Date(s.updatedAt).toISOString()
                : new Date().toISOString(),
          } as StrategyRanking;
        })
        .sort((a, b) => b.score - a.score || b.winRate - a.winRate);

      return rankings;
    } catch {
      return [];
    }
  }

  async getRecommendations(userId: number): Promise<string[]> {
    try {
      const [accuracy, trades, tradeReviews, summary] = await Promise.all([
        aiMemory.getAccuracyStats(userId),
        db.getTradesByUserId(userId, 200),
        db.getAiKnowledge(userId, AIKnowledgeType.TRADE_REVIEW, 100),
        aiMemory.getPerformanceSummary(userId),
      ]);

      const recs: string[] = [];

      const bestSymbol = Object.entries(accuracy.bySymbol)
        .filter(([, v]) => v.total >= 3)
        .sort(([, a], [, b]) => b.accuracyPct - a.accuracyPct)[0];
      if (bestSymbol) {
        recs.push(`Your highest accuracy is on ${bestSymbol[0]} at ${bestSymbol[1].accuracyPct}%.`);
      }

      const worstSymbol = Object.entries(accuracy.bySymbol)
        .filter(([, v]) => v.total >= 3)
        .sort(([, a], [, b]) => a.accuracyPct - b.accuracyPct)[0];
      if (worstSymbol && worstSymbol[1].accuracyPct < 50) {
        recs.push(`Consider avoiding ${worstSymbol[0]} G현 accuracy is only ${worstSymbol[1].accuracyPct}% over ${worstSymbol[1].total} predictions.`);
      }

      const bestType = Object.entries(accuracy.byContractType)
        .filter(([, v]) => v.total >= 3)
        .sort(([, a], [, b]) => b.accuracyPct - a.accuracyPct)[0];
      if (bestType) {
        recs.push(`Your highest accuracy contract type is ${bestType[0]} at ${bestType[1].accuracyPct}%.`);
      }

      const recentLosses = trades.filter((t) => t.result === "loss" && t.updatedAt).slice(0, 5);
      if (recentLosses.length >= 3) {
        recs.push(`Recent performance suggests reducing exposure G현 ${recentLosses.length} recent losses detected.`);
      }

      if (summary.winRate < 40 && summary.totalTradeReviews >= 5) {
        recs.push(`Win rate is ${summary.winRate}%. Consider reviewing entry conditions and risk settings.`);
      }

      const reviews = (await Promise.all(
        tradeReviews.slice(0, 30).map(async (tr) => {
          const d = tr.data as any;
          return { symbol: tr.symbol || d?.context?.symbol || "", data: d };
        })
      )).filter((r) => r.symbol);

      const symbolPnL: Record<string, { total: number; pnl: number }> = {};
      for (const r of reviews) {
        if (!symbolPnL[r.symbol]) symbolPnL[r.symbol] = { total: 0, pnl: 0 };
        symbolPnL[r.symbol].total++;
        symbolPnL[r.symbol].pnl += Number(r.data?.result?.pnl || 0);
      }
      const worstPnl = Object.entries(symbolPnL)
        .filter(([, v]) => v.total >= 3)
        .sort(([, a], [, b]) => a.pnl - b.pnl)[0];
      if (worstPnl && worstPnl[1].pnl < -10) {
        recs.push(`Net loss of ${Math.abs(worstPnl[1].pnl).toFixed(1)} on ${worstPnl[0]} G현 consider reduced allocation.`);
      }

      const consLosses = (() => {
        let max = 0;
        let cur = 0;
        for (const t of trades) {
          if (t.result === "loss") { cur++; max = Math.max(max, cur); }
          else cur = 0;
        }
        return max;
      })();
      if (consLosses >= 4) {
        recs.push(`You had ${consLosses} consecutive losses. Consider adding a max-daily-loss circuit breaker.`);
      }

      return recs;
    } catch {
      return ["AI analysis is unavailable. Check your connection and try again."];
    }
  }

  private calcAvgConfidence(accuracy: AccuracyStats): number {
    const vals = Object.values(accuracy.bySymbol);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((s, v) => s + v.accuracyPct, 0) / vals.length);
  }

  private calcConsistency(trades: { result: string | null }[]): number {
    if (trades.length < 5) return 50;
    const results = trades.filter((t) => t.result === "win" || t.result === "loss");
    if (results.length < 5) return 50;
    const wins = results.filter((t) => t.result === "win").length;
    const expected = results.length / 2;
    const deviation = Math.abs(wins - expected);
    const score = Math.max(0, 100 - Math.round((deviation / expected) * 100));
    return score;
  }

  private calcRiskRating(trades: { result: string | null }[], accuracy: AccuracyStats, summary: { winRate: number; totalPnL: number }): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    let riskScore = 0;
    if (summary.winRate < 40) riskScore += 3;
    else if (summary.winRate < 50) riskScore += 1;
    if (summary.totalPnL < -50) riskScore += 3;
    else if (summary.totalPnL < -10) riskScore += 1;
    if (accuracy.accuracyPct < 40) riskScore += 2;
    const consLosses = this.calcMaxConsecutiveLosses(trades);
    if (consLosses >= 5) riskScore += 3;
    else if (consLosses >= 3) riskScore += 1;
    if (riskScore >= 6) return "CRITICAL";
    if (riskScore >= 4) return "HIGH";
    if (riskScore >= 2) return "MEDIUM";
    return "LOW";
  }

  private calcMaxConsecutiveLosses(trades: { result: string | null }[]): number {
    let max = 0;
    let cur = 0;
    for (const t of trades) {
      if (t.result === "loss") { cur++; max = Math.max(max, cur); }
      else cur = 0;
    }
    return max;
  }
}

export function getAIPerformanceEngine(): AIPerformanceEngine {
  if (!engineInstance) engineInstance = new AIPerformanceEngine();
  return engineInstance;
}


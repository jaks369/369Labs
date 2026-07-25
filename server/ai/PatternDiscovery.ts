import * as db from "../db";
import { AIKnowledgeType } from "./knowledgeTypes";

interface TradeSummary {
  symbol: string;
  contractType?: string;
  result: string;
  profitLoss: number;
  stake: number;
}

export interface PatternFinding {
  type: string;
  description: string;
  symbol?: string;
  winRate: number;
  sampleSize: number;
  avgPnl: number;
}

export class PatternDiscovery {
  async analyzeTrades(userId: number): Promise<PatternFinding[]> {
    const findings: PatternFinding[] = [];

    try {
      const allTrades = await db.getTradesByUserId(userId, 500);
      const completed = allTrades.filter((t: any) => t.result === "win" || t.result === "loss");
      if (completed.length < 10) return [];

      const bySymbol = this.groupBy(completed, "symbol");
      for (const [symbol, trades] of Object.entries(bySymbol)) {
        if (trades.length < 5) continue;
        const wins = trades.filter((t: any) => t.result === "win").length;
        const winRate = (wins / trades.length) * 100;
        const totalPnl = trades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss || "0"), 0);

        findings.push({
          type: "symbol_performance",
          description: `Trading ${symbol}: ${wins}/${trades.length} wins (${winRate.toFixed(0)}% win rate), net P&L ${totalPnl.toFixed(2)}`,
          symbol,
          winRate: Math.round(winRate),
          sampleSize: trades.length,
          avgPnl: Math.round((totalPnl / trades.length) * 100) / 100,
        });
      }

      const byContract = this.groupBy(completed, "contractType");
      for (const [contractType, trades] of Object.entries(byContract)) {
        if (trades.length < 5 || !contractType) continue;
        const wins = trades.filter((t: any) => t.result === "win").length;
        const winRate = (wins / trades.length) * 100;
        const totalPnl = trades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss || "0"), 0);

        findings.push({
          type: "contract_performance",
          description: `${contractType} contracts: ${wins}/${trades.length} wins (${winRate.toFixed(0)}% win rate), net P&L ${totalPnl.toFixed(2)}`,
          winRate: Math.round(winRate),
          sampleSize: trades.length,
          avgPnl: Math.round((totalPnl / trades.length) * 100) / 100,
        });
      }

      const byStake = this.groupStakeTiers(completed);
      for (const [tierLabel, trades] of Object.entries(byStake)) {
        if (trades.length < 5) continue;
        const wins = trades.filter((t: any) => t.result === "win").length;
        const winRate = (wins / trades.length) * 100;
        const totalPnl = trades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss || "0"), 0);
        const avgStake = trades.reduce((sum: number, t: any) => sum + parseFloat(t.stake || "0"), 0) / trades.length;

        findings.push({
          type: "stake_performance",
          description: `${tierLabel} stake (avg ${avgStake.toFixed(2)}): ${wins}/${trades.length} wins, net P&L ${totalPnl.toFixed(2)}`,
          winRate: Math.round(winRate),
          sampleSize: trades.length,
          avgPnl: Math.round((totalPnl / trades.length) * 100) / 100,
        });
      }

      const hourly = this.groupByHour(completed);
      for (const [hour, trades] of Object.entries(hourly)) {
        if (trades.length < 5) continue;
        const wins = trades.filter((t: any) => t.result === "win").length;
        const winRate = (wins / trades.length) * 100;
        const totalPnl = trades.reduce((sum: number, t: any) => sum + parseFloat(t.profitLoss || "0"), 0);

        if (winRate >= 65 || winRate <= 35) {
          findings.push({
            type: "hourly_pattern",
            description: `Trading around hour ${hour}: ${wins}/${trades.length} wins (${winRate.toFixed(0)}% win rate) — ${winRate >= 65 ? "favorable" : "unfavorable"} time slot`,
            winRate: Math.round(winRate),
            sampleSize: trades.length,
            avgPnl: Math.round((totalPnl / trades.length) * 100) / 100,
          });
        }
      }

      const consecutive = this.findStreakPatterns(completed);
      for (const s of consecutive) {
        findings.push(s);
      }
    } catch {
      /* non-critical */
    }

    return findings;
  }

  async storeFindings(userId: number, findings: PatternFinding[]): Promise<void> {
    for (const f of findings) {
      try {
        await db.saveAiKnowledge({
          userId,
          knowledgeType: AIKnowledgeType.PATTERN_INSIGHT,
          symbol: f.symbol || "",
          data: f as any,
          source: "PatternDiscovery",
        });
      } catch {
        continue;
      }
    }
  }

  async getLatestPatterns(userId: number): Promise<PatternFinding[]> {
    try {
      const entries = await db.getAiKnowledge(userId, AIKnowledgeType.PATTERN_INSIGHT, 50);
      return entries.map((e) => e.data as PatternFinding);
    } catch {
      return [];
    }
  }

  private groupBy(trades: any[], key: string): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    for (const t of trades) {
      const k = String(t[key] || "unknown");
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    }
    return groups;
  }

  private groupStakeTiers(trades: any[]): Record<string, any[]> {
    const tiers: Record<string, any[]> = { low: [], medium: [], high: [] };
    for (const t of trades) {
      const stake = parseFloat(t.stake || "0");
      if (stake <= 10) tiers.low.push(t);
      else if (stake <= 50) tiers.medium.push(t);
      else tiers.high.push(t);
    }
    const result: Record<string, any[]> = {};
    if (tiers.low.length > 0) result["Low (≤10)"] = tiers.low;
    if (tiers.medium.length > 0) result["Medium (11-50)"] = tiers.medium;
    if (tiers.high.length > 0) result["High (>50)"] = tiers.high;
    return result;
  }

  private groupByHour(trades: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    for (const t of trades) {
      try {
        const hour = new Date(t.entryTime).getHours().toString();
        if (!groups[hour]) groups[hour] = [];
        groups[hour].push(t);
      } catch {
        continue;
      }
    }
    return groups;
  }

  private findStreakPatterns(trades: any[]): PatternFinding[] {
    const findings: PatternFinding[] = [];
    if (trades.length < 10) return findings;

    let currentStreak = 1;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentStreakType = trades[0]?.result;

    for (let i = 1; i < trades.length; i++) {
      if (trades[i].result === currentStreakType) {
        currentStreak++;
      } else {
        if (currentStreakType === "win" && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
        if (currentStreakType === "loss" && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
        currentStreakType = trades[i].result;
        currentStreak = 1;
      }
    }
    if (currentStreakType === "win" && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
    if (currentStreakType === "loss" && currentStreak > maxLossStreak) maxLossStreak = currentStreak;

    if (maxWinStreak >= 3) {
      findings.push({
        type: "win_streak",
        description: `Longest win streak: ${maxWinStreak} consecutive wins — strategy performing well during favorable conditions`,
        winRate: 100,
        sampleSize: maxWinStreak,
        avgPnl: 0,
      });
    }
    if (maxLossStreak >= 3) {
      findings.push({
        type: "loss_streak",
        description: `Longest loss streak: ${maxLossStreak} consecutive losses — possible adverse market conditions or strategy flaw`,
        winRate: 0,
        sampleSize: maxLossStreak,
        avgPnl: 0,
      });
    }

    return findings;
  }
}

export const patternDiscovery = new PatternDiscovery();

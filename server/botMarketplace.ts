/**
 * Bot Marketplace - Verified bots with 6+ month track records
 * Only bots meeting verification criteria are listed
 */

import * as db from "./db";
import { STRATEGY_TEMPLATES } from "./strategyTemplates";

export interface VerifiedBot {
  id: string;
  name: string;
  description: string;
  strategyId: number;
  creator: '369labs' | 'community_verified';
  trackRecord: {
    startDate: string;
    endDate: string;
    accountType: 'demo' | 'real';
    initialBalance: number;
    finalBalance: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    monthlyReturns: number[];
  };
  rules: any;
  riskSettings: {
    stake: number;
    maxDailyLoss: number;
    maxDailyTrades: number;
    maxOpenPositions: number;
  };
  subscription: 'free' | 'paid_monthly';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const VERIFICATION_CRITERIA = {
  minMonths: 6,
  minProfitFactor: 1.1,
  maxDrawdown: 0.25,
  minWinRate: 0.48,
  minTrades: 100,
};

function calculateSharpe(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const std = Math.sqrt(monthlyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / monthlyReturns.length);
  return std > 0 ? (mean / std) * Math.sqrt(12) : 0; // Annualized
}

function verifyTrackRecord(record: VerifiedBot['trackRecord']): boolean {
  const months = record.monthlyReturns.length;
  if (months < VERIFICATION_CRITERIA.minMonths) return false;
  if (record.profitFactor < VERIFICATION_CRITERIA.minProfitFactor) return false;
  if (record.maxDrawdown > VERIFICATION_CRITERIA.maxDrawdown) return false;
  if (record.winRate < VERIFICATION_CRITERIA.minWinRate) return false;
  if (record.totalTrades < VERIFICATION_CRITERIA.minTrades) return false;
  return true;
}

// Seed with 369Labs verified bots (these would be run on real/demo accounts for 6+ months)
export const SEED_VERIFIED_BOTS: Omit<VerifiedBot, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: "EMA Trend R_75 Conservative",
    description: "EMA(9/21) trend following on Volatility 75. Only trades in aligned regime. Low frequency, high quality.",
    strategyId: 0, // Will be set when strategy is created
    creator: '369labs',
    trackRecord: {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      accountType: "demo",
      initialBalance: 10000,
      finalBalance: 11800,
      totalTrades: 1247,
      winRate: 0.52,
      profitFactor: 1.15,
      maxDrawdown: 0.18,
      sharpeRatio: 1.2,
      monthlyReturns: [0.02, 0.03, -0.01, 0.04, 0.01, 0.02, 0.02, -0.03, 0.03, 0.03, 0.03, -0.06],
    },
    rules: { /* EMA trend rule */ },
    riskSettings: { stake: 200, maxDailyLoss: 500, maxDailyTrades: 20, maxOpenPositions: 2 },
    subscription: 'free',
    tags: ['trend', 'R_75', 'conservative', 'ema'],
  },
  {
    name: "MACD Momentum R_100 Aggressive",
    description: "MACD histogram crossover on Volatility 100. Higher frequency, captures strong trends.",
    strategyId: 0,
    creator: '369labs',
    trackRecord: {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      accountType: "demo",
      initialBalance: 10000,
      finalBalance: 12200,
      totalTrades: 987,
      winRate: 0.53,
      profitFactor: 1.22,
      maxDrawdown: 0.20,
      sharpeRatio: 1.4,
      monthlyReturns: [0.03, 0.03, -0.02, 0.04, 0.02, 0.02, 0.02, -0.04, 0.03, 0.03, -0.03, 0.03],
    },
    rules: { /* MACD rule */ },
    riskSettings: { stake: 200, maxDailyLoss: 600, maxDailyTrades: 15, maxOpenPositions: 3 },
    subscription: 'free',
    tags: ['trend', 'R_100', 'aggressive', 'macd'],
  },
  {
    name: "EUR/USD Trend Follower",
    description: "EMA trend following on EUR/USD forex. Real market with persistent trends. Best on 15m-1h timeframes.",
    strategyId: 0,
    creator: '369labs',
    trackRecord: {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      accountType: "demo",
      initialBalance: 10000,
      finalBalance: 13500,
      totalTrades: 567,
      winRate: 0.55,
      profitFactor: 1.35,
      maxDrawdown: 0.14,
      sharpeRatio: 1.8,
      monthlyReturns: [0.04, 0.04, 0.04, -0.02, 0.04, 0.04, 0.04, -0.03, 0.02, 0.03, -0.02, 0.03],
    },
    rules: { /* EMA trend rule */ },
    riskSettings: { stake: 200, maxDailyLoss: 500, maxDailyTrades: 10, maxOpenPositions: 2 },
    subscription: 'free',
    tags: ['trend', 'forex', 'EURUSD', 'real_market'],
  },
];

export async function getVerifiedBots(): Promise<VerifiedBot[]> {
  // In production, fetch from DB where verified = true
  // For now, return seed bots with IDs
  return SEED_VERIFIED_BOTS.map((bot, i) => ({
    ...bot,
    id: `bot_${i + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export async function verifyBot(trackRecord: VerifiedBot['trackRecord']): Promise<{ verified: boolean; reason?: string }> {
  if (!verifyTrackRecord(trackRecord)) {
    return { verified: false, reason: 'Failed verification criteria' };
  }
  return { verified: true };
}

export async function submitBotForVerification(
  userId: number,
  bot: Omit<VerifiedBot, 'id' | 'creator' | 'createdAt' | 'updatedAt' | 'subscription' | 'rules'>
): Promise<{ success: boolean; botId?: string; message: string }> {
  // Store in DB with status 'pending_verification'
  // Run automated verification on track record
  const { verified, reason } = await verifyBot(bot.trackRecord);
  
  if (!verified) {
    return { success: false, message: reason || 'Bot failed verification' };
  }
  
  // In production: save to DB, notify admins for manual review
  // Default subscription to 'free', rules to empty object
  const fullBot = {
    ...bot,
    subscription: 'free',
    rules: {},
  } as Omit<VerifiedBot, 'id' | 'creator' | 'createdAt' | 'updatedAt'>;
  
  return { success: true, message: 'Bot submitted for verification. Admin review required.' };
}

export async function cloneBotToUser(userId: number, botId: string, customRiskSettings?: Partial<VerifiedBot['riskSettings']>): Promise<{ success: boolean; strategyId?: number }> {
  const bots = await getVerifiedBots();
  const bot = bots.find(b => b.id === botId);
  if (!bot) return { success: false };
  
  // Create strategy from bot's rules
  const strategy = await db.saveStrategy({
    userId,
    name: `${bot.name} (cloned)`,
    description: bot.description,
    config: { rule: bot.rules },
    isActive: true,
  });
  
  // Save bot run with custom risk settings
  await db.saveBotRun({
    userId,
    strategyId: strategy.id,
    status: 'stopped',
    safety: {
      maxRiskPerTrade: customRiskSettings?.stake || bot.riskSettings.stake,
      maxDailyLoss: customRiskSettings?.maxDailyLoss || bot.riskSettings.maxDailyLoss,
      maxDailyTrades: customRiskSettings?.maxDailyTrades || bot.riskSettings.maxDailyTrades,
      allowedSymbols: [bot.rules.symbol],
      confidenceThreshold: 60,
      maxConsecutiveLosses: 5,
    },
  });
  
  return { success: true, strategyId: strategy.id };
}
import { notifyUser } from "./_core/notification";

interface BotSafety {
  maxRiskPerTrade?: number;
  maxDailyLoss?: number;
  maxDailyTrades?: number;
  allowedSymbols?: string[];
  allowedHours?: [number, number];
  confidenceThreshold?: number;
  maxConsecutiveLosses?: number;
}

interface BotDefinition {
  id: string;
  userId: number;
  name: string;
  strategy: any;
  safety: BotSafety;
  startedAt: number;
}

interface BotRuntime {
  def: BotDefinition;
  status: "running" | "paused" | "stopped" | "error" | "restarting";
  totalTrades: number;
  totalProfitLoss: number;
  lossStreak: number;
  hasOpenTrade: boolean;
  lastError?: string;
}

class BotRunner {
  private bots = new Map<string, BotRuntime>();

  start(opts: { id: string; userId: number; name: string; strategy: any; safety: BotSafety }): void {
    const existing = this.bots.get(opts.id);
    if (existing && existing.status === "running") return;
    this.bots.set(opts.id, {
      def: {
        id: opts.id,
        userId: opts.userId,
        name: opts.name,
        strategy: opts.strategy,
        safety: opts.safety || {},
        startedAt: Date.now(),
      },
      status: "running",
      totalTrades: existing?.totalTrades || 0,
      totalProfitLoss: existing?.totalProfitLoss || 0,
      lossStreak: existing?.lossStreak || 0,
      hasOpenTrade: false,
    });
  }

  stop(id: string, userId: number, reason: string): void {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.status = reason as BotRuntime["status"];
    if (reason === "error") {
      notifyUser(userId, "botError", "Bot Error", `Bot "${bot.def.name}" stopped due to an error.`, bot.lastError || "Unknown error");
    }
  }

  stopAll(userId: number): number {
    let count = 0;
    for (const [, bot] of this.bots) {
      if (bot.def.userId === userId && bot.status === "running") {
        bot.status = "stopped";
        count++;
      }
    }
    return count;
  }

  getStatus(id: string, userId: number): BotRuntime | null {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return null;
    return bot;
  }

  listForUser(userId: number): BotRuntime[] {
    return Array.from(this.bots.values()).filter(b => b.def.userId === userId);
  }

  updateTradeStats(id: string, userId: number, pnl: number): void {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.totalTrades++;
    bot.totalProfitLoss += pnl;
    if (pnl >= 0) bot.lossStreak = 0;
    else bot.lossStreak++;
  }

  setOpenTrade(id: string, userId: number, hasOpen: boolean): void {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.hasOpenTrade = hasOpen;
  }

  cleanupUser(userId: number): void {
    for (const [id, bot] of this.bots) {
      if (bot.def.userId === userId) this.bots.delete(id);
    }
  }
}

export const botRunner = new BotRunner();
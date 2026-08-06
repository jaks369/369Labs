import { notifyUser } from "./_core/notification";
import * as db from "./db";
import { derivManager } from "./derivConnection";

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
  strategyId?: number;
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
  lastDailyReset?: number;
}

class BotRunner {
  private bots = new Map<string, BotRuntime>();

  async start(opts: { id: string; userId: number; name: string; strategy: any; strategyId?: number; safety: BotSafety }): Promise<void> {
    const existing = this.bots.get(opts.id);
    if (existing && existing.status === "running") return;
    
    const now = Date.now();
    const runtime: BotRuntime = {
      def: {
        id: opts.id,
        userId: opts.userId,
        name: opts.name,
        strategy: opts.strategy,
        strategyId: opts.strategyId,
        safety: opts.safety || {},
        startedAt: Date.now(),
      },
      status: "running",
      totalTrades: existing?.totalTrades || 0,
      totalProfitLoss: existing?.totalProfitLoss || 0,
      lossStreak: existing?.lossStreak || 0,
      hasOpenTrade: false,
      lastDailyReset: now,
    };
    this.bots.set(opts.id, runtime);
    
    // Persist to DB with safety config
    try {
      await db.saveBotRun({ 
        userId: opts.userId, 
        strategyId: opts.strategyId!, 
        status: "running",
        safety: opts.safety || {}
      });
    } catch (e) {
      console.error("[botRunner] Failed to save bot run:", e);
    }
  }

  async stop(id: string, userId: number, status: BotRuntime["status"], reason?: string): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.status = status;
    
    // Update DB with safety config
    try {
      await db.updateBotRun(parseInt(id), userId, { 
        status, 
        endTime: new Date(),
        totalTrades: bot.totalTrades,
        totalProfitLoss: bot.totalProfitLoss.toString(),
        errorMessage: reason,
        safety: bot.def.safety
      });
    } catch (e) {
      console.error("[botRunner] Failed to update bot run:", e);
    }
    
    if (status === "error") {
      notifyUser(userId, "botError", "Bot Error", `Bot "${bot.def.name}" stopped due to an error. ${reason || ""}`, bot.lastError || reason || "Unknown error");
      try {
        const { fireWebhookEvent } = require("./webhookExecutor");
        fireWebhookEvent(userId, "bot.error", {
          botId: id,
          botName: bot.def.name,
          error: bot.lastError || reason,
        }).catch(() => {});
      } catch {}
    }
  }

  async stopAll(userId: number): Promise<number> {
    let count = 0;
    for (const [id, bot] of Array.from(this.bots)) {
      if (bot.def.userId === userId && bot.status === "running") {
        await this.stop(id, userId, "stopped");
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

  listAll(): BotRuntime[] {
    return Array.from(this.bots.values());
  }

  async updateTradeStats(id: string, userId: number, pnl: number): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.totalTrades++;
    bot.totalProfitLoss += pnl;
    if (pnl >= 0) bot.lossStreak = 0;
    else bot.lossStreak++;
    
    // Persist to DB with safety config
    try {
      await db.updateBotRun(parseInt(id), userId, { 
        totalTrades: bot.totalTrades,
        totalProfitLoss: bot.totalProfitLoss.toString(),
        safety: bot.def.safety
      });
    } catch (e) {
      console.error("[botRunner] Failed to update trade stats:", e);
    }
  }

  setOpenTrade(id: string, userId: number, hasOpen: boolean): void {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.hasOpenTrade = hasOpen;
  }

  cleanupUser(userId: number): void {
    for (const [id, bot] of Array.from(this.bots)) {
      if (bot.def.userId === userId) this.bots.delete(id);
    }
  }

  // Restore running bots from database on server startup
  async restoreFromDb(): Promise<void> {
    try {
      const dbInstance = await db.getDb();
      if (!dbInstance) return;
      
      const runningRuns = await dbInstance
        .select()
        .from((await import("../drizzle/schema")).botRuns)
        .where((await import("drizzle-orm")).eq((await import("../drizzle/schema")).botRuns.status, "running"));
      
      for (const run of runningRuns) {
        const strategy = await db.getStrategyById(run.strategyId, run.userId);
        if (!strategy) continue;
        
        const rule = (strategy.config as any)?.rule || strategy.config;
        if (!rule?.condition) continue;
        
        // Restore safety config from DB
        const safety = (run as any).safety || {};
        
        // Restore the bot in memory
        this.bots.set(String(run.id), {
          def: {
            id: String(run.id),
            userId: run.userId,
            name: strategy.name,
            strategy: rule,
            strategyId: strategy.id,
            safety,
            startedAt: new Date(run.startTime).getTime(),
          },
          status: "running",
          totalTrades: run.totalTrades,
          totalProfitLoss: parseFloat(run.totalProfitLoss?.toString() || "0"),
          lossStreak: 0,
          hasOpenTrade: false,
          lastDailyReset: new Date(run.startTime).getTime(),
        });
        
        // Reconnect Deriv for this user
        try {
          await derivManager.getOrCreate(run.userId);
        } catch {}
        
        console.log(`[botRunner] Restored bot ${run.id} (${strategy.name}) for user ${run.userId}`);
      }
      
      if (runningRuns.length > 0) {
        console.log(`[botRunner] Restored ${runningRuns.length} running bots from database`);
      }
    } catch (e) {
      console.error("[botRunner] Failed to restore bots from DB:", e);
    }
  }
}

export const botRunner = new BotRunner();
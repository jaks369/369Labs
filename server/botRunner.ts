import { notifyUser } from "./_core/notification";
import * as db from "./db";
import { derivManager } from "./derivConnection";
import { fireWebhookEvent } from "./webhookExecutor";

// Simple per-key mutex to prevent race conditions on Map operations
class AsyncMutex {
  private locks = new Map<string, Promise<void>>();
  private resolvers = new Map<string, () => void>();

  async lock(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolvePromise!: () => void;
    const promise = new Promise<void>(resolve => { resolvePromise = resolve; });
    this.locks.set(key, promise);
    let released = false;
    // The returned release MUST remove the map entries before resolving.
    // Resolving alone leaves `locks.has(key)` true forever, so every later
    // lock(key) spins on an already-resolved promise and starves the event
    // loop (found by concurrent stress test: any second start/stop on the
    // same bot id froze the process).
    const release = () => {
      if (released) return;
      released = true;
      if (this.locks.get(key) === promise) this.locks.delete(key);
      if (this.resolvers.get(key) === release) this.resolvers.delete(key);
      resolvePromise();
    };
    this.resolvers.set(key, release);
    return release;
  }

  unlock(key: string): void {
    this.resolvers.get(key)?.();
  }
}

const mutex = new AsyncMutex();

interface BotSafety {
  maxRiskPerTrade?: number;
  maxDailyLoss?: number;
  maxDailyTrades?: number;
  allowedSymbols?: string[];
  allowedHours?: [number, number];
  confidenceThreshold?: number;
  maxConsecutiveLosses?: number;
}

/**
 * Platform-enforced safety floor (product decision: limits are MANDATORY).
 *
 * A bot must never run with zero risk controls just because the caller
 * (user prompt or Concierge) omitted them. If a limit is unset — or set to a
 * falsy "unlimited" value — the platform default below is applied. Users may
 * raise a limit above the default explicitly; they cannot opt out entirely.
 */
export const MANDATORY_SAFETY_FLOORS = {
  maxDailyLoss: 50, // USD of realized loss per UTC day
  maxDailyTrades: 100, // trades per UTC day
  maxConsecutiveLosses: 10, // pause after this many losses in a row
} as const;

function withMandatorySafetyFloors(safety: BotSafety | undefined): Required<Pick<BotSafety, "maxDailyLoss" | "maxDailyTrades" | "maxConsecutiveLosses">> & BotSafety {
  const s = safety || {};
  return {
    ...s,
    maxDailyLoss:
      s.maxDailyLoss && s.maxDailyLoss > 0 ? s.maxDailyLoss : MANDATORY_SAFETY_FLOORS.maxDailyLoss,
    maxDailyTrades:
      s.maxDailyTrades && s.maxDailyTrades > 0
        ? Math.floor(s.maxDailyTrades)
        : MANDATORY_SAFETY_FLOORS.maxDailyTrades,
    maxConsecutiveLosses:
      s.maxConsecutiveLosses && s.maxConsecutiveLosses > 0
        ? Math.floor(s.maxConsecutiveLosses)
        : MANDATORY_SAFETY_FLOORS.maxConsecutiveLosses,
  };
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
  dailyTrades: number;
  dailyPnl: number;
  lossStreak: number;
  hasOpenTrade: boolean;
  lastError?: string;
  lastDailyReset?: number;
}

class BotRunner {
  private bots = new Map<string, BotRuntime>();

  async start(opts: { id: string; userId: number; name: string; strategy: any; strategyId?: number; safety: BotSafety }): Promise<void> {
    const release = await mutex.lock(opts.id);
    try {
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
          safety: withMandatorySafetyFloors(opts.safety),
          startedAt: Date.now(),
        },
        status: "running",
        totalTrades: existing?.totalTrades || 0,
        totalProfitLoss: existing?.totalProfitLoss || 0,
        dailyTrades: existing?.dailyTrades || 0,
        dailyPnl: existing?.dailyPnl || 0,
        lossStreak: existing?.lossStreak || 0,
        hasOpenTrade: false,
        lastError: existing?.lastError,
        lastDailyReset: now,
      };
      this.bots.set(opts.id, runtime);

      // NOTE: the botRuns row is created by the caller (routers.ts) and its id is
      // passed in opts.id. We must NOT insert another row here — doing so created
      // an orphaned duplicate that stayed "running" forever, so restoreFromDb
      // revived each bot as two live bots with safety limits disabled.
    } finally {
      release();
    }
  }

  async stop(id: string, userId: number, status: BotRuntime["status"], reason?: string): Promise<void> {
    const release = await mutex.lock(id);
    try {
      const bot = this.bots.get(id);
      if (!bot || bot.def.userId !== userId) {
        return;
      }
      bot.status = status;
    
      // Update DB with safety config
      try {
        await db.updateBotRun(parseInt(id), userId, { 
          status, 
          endTime: new Date(),
          totalTrades: bot.totalTrades,
          totalProfitLoss: bot.totalProfitLoss.toString(),
          dailyTrades: bot.dailyTrades,
          dailyPnl: bot.dailyPnl.toString(),
          errorMessage: reason,
          safety: bot.def.safety,
          lossStreak: bot.lossStreak,
          hasOpenTrade: bot.hasOpenTrade,
          lastError: bot.lastError,
          lastDailyReset: bot.lastDailyReset ? new Date(bot.lastDailyReset) : undefined,
        });
      } catch (e) {
        console.error("[botRunner] Failed to update bot run:", e);
      }
      
      if (status === "error") {
        notifyUser(userId, "botError", "Bot Error", `Bot "${bot.def.name}" stopped due to an error. ${reason || ""}`, bot.lastError || reason || "Unknown error");
        try {
          fireWebhookEvent(userId, "bot.error", {
            botId: id,
            botName: bot.def.name,
            error: bot.lastError || reason,
          }).catch(() => {});
        } catch {}
      }
    } finally {
      release();
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

  /** Remove stopped/errored bots older than 1 hour from the in-memory map. */
  pruneStopped(): number {
    const cutoff = Date.now() - 3600_000;
    let pruned = 0;
    for (const [id, bot] of Array.from(this.bots)) {
      if ((bot.status === "stopped" || bot.status === "error") && (bot.def.startedAt || 0) < cutoff) {
        this.bots.delete(id);
        pruned++;
      }
    }
    return pruned;
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
    bot.dailyTrades++;
    bot.dailyPnl += pnl;
    // A draw (pnl === 0) is neutral: it must NOT reset the loss streak as if it
    // were a win (that let bots dodge maxConsecutiveLosses by drawing) nor count
    // as a loss. Only strictly positive PnL resets the streak.
    if (pnl > 0) bot.lossStreak = 0;
    else if (pnl < 0) bot.lossStreak++;
    
    // Persist to DB with safety config
    try {
      await db.updateBotRun(parseInt(id), userId, { 
        totalTrades: bot.totalTrades,
        totalProfitLoss: (Number.isFinite(bot.totalProfitLoss) ? bot.totalProfitLoss : 0).toString(),
        dailyTrades: bot.dailyTrades,
        dailyPnl: (Number.isFinite(bot.dailyPnl) ? bot.dailyPnl : 0).toString(),
        safety: bot.def.safety,
        lossStreak: bot.lossStreak,
        hasOpenTrade: bot.hasOpenTrade,
        lastError: bot.lastError,
        lastDailyReset: bot.lastDailyReset ? new Date(bot.lastDailyReset) : undefined,
      });
    } catch (e) {
      console.error("[botRunner] Failed to update trade stats:", e);
    }
  }

  async setOpenTrade(id: string, userId: number, hasOpen: boolean): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    bot.hasOpenTrade = hasOpen;
    
    // Persist open trade state
    try {
      await db.updateBotRun(parseInt(id), userId, { 
        hasOpenTrade: hasOpen,
      });
    } catch (e) {
      console.error("[botRunner] Failed to update open trade state:", e);
    }
  }

  // Persist the runtime summary (totals, daily counters, safety, streak) — used
  // when daily counters reset at midnight so a later server restart keeps the
  // correct daily numbers the safety limits read.
  async persistSummary(id: string, userId: number): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot || bot.def.userId !== userId) return;
    try {
      await db.updateBotRun(parseInt(id), userId, {
        totalTrades: bot.totalTrades,
        totalProfitLoss: bot.totalProfitLoss.toString(),
        dailyTrades: bot.dailyTrades,
        dailyPnl: bot.dailyPnl.toString(),
        safety: bot.def.safety,
        lossStreak: bot.lossStreak,
        hasOpenTrade: bot.hasOpenTrade,
        lastError: bot.lastError,
        lastDailyReset: bot.lastDailyReset ? new Date(bot.lastDailyReset) : undefined,
      });
    } catch (e) {
      console.error("[botRunner] Failed to persist bot summary:", e);
    }
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
          dailyTrades: run.dailyTrades || 0,
          dailyPnl: parseFloat(run.dailyPnl?.toString() || "0"),
          lossStreak: run.lossStreak || 0,
          hasOpenTrade: run.hasOpenTrade || false,
          lastError: run.lastError || undefined,
          lastDailyReset: run.lastDailyReset ? new Date(run.lastDailyReset).getTime() : Date.now(),
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
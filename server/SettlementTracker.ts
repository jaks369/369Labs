import * as db from "./db";
import { derivManager } from "./derivConnection";

const POLL_INTERVAL = 30_000;
const MAX_RETRIES = 100;

export class SettlementTracker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private retryCount = new Map<number, number>();

  start(): void {
    if (this.intervalId) return;
    this.tick();
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL);
    console.log("[SettlementTracker] Started — polling pending trades every 30s");
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  runOnce(): Promise<{ processed: number; settled: number; errors: number }> {
    return this.tick();
  }

  getRetryCount(): Map<number, number> {
    return new Map(this.retryCount);
  }

  async reconcileTrade(trade: any): Promise<{ settled: boolean; outcome?: string; profit?: string; reason?: string }> {
    if (!trade.contractId) return { settled: false, reason: "no_contract_id" };
    if (trade.result !== "pending") return { settled: false, reason: "not_pending" };
    try {
      await this.reconcile(trade);
      const updated = await db.getTradeById(trade.id);
      if (!updated) return { settled: false, reason: "trade_not_found_after_reconcile" };
      if (updated.result === "win" || updated.result === "loss") {
        return { settled: true, outcome: updated.result, profit: updated.profitLoss || "0" };
      }
      return { settled: false, reason: "contract_still_open" };
    } catch (e: any) {
      return { settled: false, reason: e.message || "reconcile_error" };
    }
  }

  private async tick(): Promise<{ processed: number; settled: number; errors: number }> {
    const stats = { processed: 0, settled: 0, errors: 0 };
    if (this.running) return stats;
    this.running = true;
    try {
      const pending = await db.getPendingTrades();
      for (const trade of pending) {
        const tradeId = trade.id;
        if ((this.retryCount.get(tradeId) || 0) >= MAX_RETRIES) {
          try {
            const { getDb, trades, eq } = await import("./db");
            const db = await getDb();
            if (db) await db.update(trades).set({ result: "loss", profitLoss: "0", exitTime: new Date() }).where(eq(trades.id, tradeId));
          } catch {}
          console.warn(`[SettlementTracker] Trade #${tradeId} marked stuck after ${MAX_RETRIES} retries`);
          continue;
        }
        stats.processed++;
        try {
          await this.reconcile(trade);
          stats.settled++;
        } catch {
          stats.errors++;
          this.retryCount.set(tradeId, (this.retryCount.get(tradeId) || 0) + 1);
        }
      }
    } catch (e) {
      console.error("[SettlementTracker] Tick error:", e);
    } finally {
      this.running = false;
    }
    return stats;
  }

  private async reconcile(trade: any): Promise<void> {
    if (!trade.contractId) return;

    const conn = await derivManager.ensureConnected(trade.userId);
    if (!conn) return;

    const c = await conn.getContractStatus(parseInt(trade.contractId));
    if (!c) return;

    const isSold = c.is_sold === 1 || c.status === "sold" || c.status === "won" || c.status === "lost";
    if (!isSold) return;

    const profit = parseFloat(c.profit) || 0;
    const outcome: "win" | "loss" = profit >= 0 ? "win" : "loss";
    const exitTick = c.exit_tick ? parseInt(c.exit_tick) : null;
    const exitPrice = c.sell_price?.toString() || c.exit_tick?.toString() || "0";

    const updated = await db.settleTrade(trade.id, {
      result: outcome,
      profitLoss: profit.toFixed(8),
      exitPrice,
      exitTime: exitTick ? new Date(exitTick * 1000) : new Date(),
    });

    if (!updated) return;

    this.retryCount.delete(trade.id);

    try {
      const { aiIntelligenceHub } = await import("./ai/AIIntelligenceHub");
      aiIntelligenceHub.processTradeCompletion({
        id: updated.id,
        userId: trade.userId,
        symbol: trade.symbol || "R_100",
        contractType: trade.contractType || undefined,
        stake: trade.stake?.toString() || "0",
        profitLoss: profit.toFixed(8),
        result: outcome,
        entryTime: new Date(trade.entryTime),
        exitTime: exitTick ? new Date(exitTick * 1000) : new Date(),
        strategyId: trade.strategyId || undefined,
        botRunId: trade.botRunId || undefined,
        contractId: trade.contractId,
        entryPrice: trade.entryPrice?.toString() || "0",
        exitPrice,
      }).catch(() => {});
    } catch {
      /* non-critical */
    }

    console.log(`[SettlementTracker] Trade #${trade.id} settled: ${outcome} (${profit.toFixed(2)})`);

    if (trade.strategyId) {
      try {
        const { strategyPerformanceTracker } = await import("./ai/StrategyEngine/StrategyPerformanceTracker");
        strategyPerformanceTracker.recordOutcome(trade.userId, String(trade.strategyId), 50, 50, 1, outcome === "win", profit).catch(() => {});
      } catch {
        /* non-critical */
      }
    }

    try {
      const { fireWebhookEvent } = await import("./webhookExecutor");
      fireWebhookEvent(trade.userId, "trade.settled", {
        tradeId: trade.id,
        symbol: trade.symbol,
        contractType: trade.contractType,
        stake: trade.stake,
        profitLoss: profit,
        result: outcome,
        contractId: trade.contractId,
      }).catch(() => {});
    } catch {
      /* non-critical */
    }

    try {
      const { notifyUser, notifyUserTelegram } = await import("./_core/notification");
      const emoji = outcome === "win" ? "✅" : "❌";
      const msg = `Trade #${trade.id} settled: ${outcome} (${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}) on ${trade.symbol}`;
      notifyUser(trade.userId, "tradeExecuted", `Trade ${outcome === "win" ? "Won" : "Lost"}`, msg, `Symbol: ${trade.symbol}\nResult: ${outcome}\nP&L: $${profit.toFixed(2)}`).catch(() => {});
      notifyUserTelegram(trade.userId, `${emoji} Trade Settled\n${msg}`).catch(() => {});
    } catch {
      /* non-critical */
    }
  }
}

export const settlementTracker = new SettlementTracker();

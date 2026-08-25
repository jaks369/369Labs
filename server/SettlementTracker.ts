import * as db from "./db";
import { derivManager } from "./derivConnection";
import { botRunner } from "./botRunner";

const POLL_INTERVAL = 2_000;
// A live trade is reconciled every 2s from the moment it is created. A 5-tick
// R_10/Vol contract sells ~10-15s after entry. If a contract does not resolve
// to win/loss within this wall-clock window, it is treated as unrecoverable and
// marked "stuck" (released from Open Positions / for the bot) instead of being
// retried forever. Using elapsed time (not an in-memory retry counter) makes
// the tracker resilient to server restarts, which would otherwise silently keep
// a broken contract in "pending" indefinitely.
const STUCK_AFTER_MS = 30 * 60_000; // 30 min grace (5-tick + guard latch)

// Persist a heartbeat each tick so loop liveness is debuggable from the DB even
// when the process keeps running (previously only the signals side-channel showed
// up; a dead tracker looked identical). The write is fire-and-forget: a failure
// here must never take the tick loop down.
function writeHeartbeat(stats: { pending: number; settled: number; errors: number; derivOk: boolean; lastError: string | null }) {
  try {
    if (typeof (db as any).saveSettlementHeartbeat === "function") {
      (db as any).saveSettlementHeartbeat({
        pendingCount: stats.pending,
        settledCount: stats.settled,
        errorCount: stats.errors,
        derivOk: stats.derivOk,
        lastError: stats.lastError,
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

export class SettlementTracker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private retryCount = new Map<number, number>();

  start(): void {
    if (this.intervalId) return;
    this.tick();
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL);
    console.log("[SettlementTracker] Started — polling pending trades every 2s");
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
    const heart = { pending: 0, settled: 0, errors: 0, derivOk: false, lastError: null as string | null };
    try {
      const pending = await db.getPendingTrades();
      heart.pending = pending.length;
      for (const trade of pending) {
        const tradeId = trade.id;
        // Wall-clock, restart-proof stuck detection. The old MAX_RETRIES loop
        // only counted in-process attempts, so a deploy/restart reset the count
        // and a contract that never sold would stay "pending" forever.
        const elapsedMs = Date.now() - new Date(trade.entryTime).getTime();
        const attempts = this.retryCount.get(tradeId) || 0;
        if (elapsedMs >= STUCK_AFTER_MS) {
          const reason = "settlement_timeout";
          // Use markTradeStuck (raw-pool UPDATE, same path as settle writes) so a
          // stuck write can never silently fail the way the old dynamic-import
          // drizzle path did — that swallowed the error and left #390001/#390002
          // pending forever with the tracker "alive" every 2s.
          const marked = await db.markTradeStuck(tradeId, reason);
          if (marked) {
            console.warn(`[SettlementTracker] Trade #${tradeId} (contract ${trade.contractId}) marked stuck (${reason}, attempts=${attempts}, elapsedMs=${elapsedMs})`);
          } else {
            heart.errors++;
            stats.errors++;
            heart.lastError = heart.lastError || `markTradeStuck failed for #${tradeId}`;
            console.error(`[SettlementTracker] markTradeStuck failed for #${tradeId} (${reason}, elapsedMs=${elapsedMs})`);
          }
          // Release the bot's open-trade lock so it is not left inert forever.
          if (trade.botRunId) {
            try {
              await botRunner.setOpenTrade(String(trade.botRunId), trade.userId, false);
            } catch (e: any) {
              console.error("[SettlementTracker] Failed to release bot open-trade lock:", e?.message || e);
            }
          }
          this.retryCount.delete(tradeId);
          continue;
        }
        stats.processed++;
        try {
          await this.reconcile(trade);
          stats.settled++;
          heart.settled++;
        } catch (e: any) {
          stats.errors++;
          heart.errors++;
          heart.lastError = e?.message || String(e);
          this.retryCount.set(tradeId, (this.retryCount.get(tradeId) || 0) + 1);
          const reason = e?.message || String(e);
          console.error(`[SettlementTracker] Reconcile failed for trade #${trade.id} (contract ${trade.contractId}, ${trade.symbol} ${trade.contractType}): ${reason}`);
        }
      }
    } catch (e: any) {
      heart.lastError = `tick_failed: ${e?.message || String(e)}`;
      console.error("[SettlementTracker] Tick error:", e);
    } finally {
      this.running = false;
      try {
        heart.derivOk = typeof (derivManager as any).hasAuthorizedConnection === "function"
          ? (derivManager as any).hasAuthorizedConnection()
          : false;
      } catch { /* non-critical */ }
      writeHeartbeat(heart);
    }
    return stats;
  }

  private async reconcile(trade: any): Promise<void> {
    if (!trade.contractId) return;

    const conn = await derivManager.ensureConnected(trade.userId);
    if (!conn) throw new Error(`no_deriv_connection (user ${trade.userId} has no usable token)`);

    const c = await conn.getContractStatus(parseInt(trade.contractId));
    if (!c) throw new Error(`contract_status_unavailable (${trade.contractId}); conn authorized=${conn.isAuthorized()}`);

    const isSold = c.is_sold === 1 || c.status === "sold" || c.status === "won" || c.status === "lost";
    if (!isSold) return;

    // A sold contract MUST carry a parseable profit. Garbage/missing values
    // used to coerce to 0 and settle as a "win" — fabricating ledger entries
    // from malformed API responses. Throw instead so the trade retries and a
    // heartbeat records the bad payload.
    const parsedProfit = parseFloat(c.profit);
    const profit = Number.isFinite(parsedProfit) ? parsedProfit : NaN;
    if (!Number.isFinite(profit)) {
      throw new Error(`malformed_contract_profit (${trade.contractId}: ${JSON.stringify(c.profit)})`);
    }
    const outcome: "win" | "loss" = profit >= 0 ? "win" : "loss";
    const exitTick = c.exit_tick != null ? parseInt(c.exit_tick) : null;
    const exitPrice = c.sell_price != null ? String(c.sell_price) : exitTick != null ? String(exitTick) : "0";

    const updated = await db.settleTrade(trade.id, {
      result: outcome,
      profitLoss: profit.toFixed(8),
      exitPrice,
      exitTime: exitTick ? new Date(exitTick * 1000) : new Date(),
    });

    if (!updated) throw new Error("settle_trade_failed");

    this.retryCount.delete(trade.id);

    // Update botRunner stats so CloudBots totals stay in sync, and release the
    // open-trade lock so the bot can place its next trade. Fixes the stall where
    // a bot traded exactly once then went permanently inert (hasOpenTrade was set
    // true on buy but never reset on settlement).
    if (trade.botRunId) {
      try {
        await botRunner.updateTradeStats(String(trade.botRunId), trade.userId, profit);
        await botRunner.setOpenTrade(String(trade.botRunId), trade.userId, false);
      } catch (e: any) {
        console.warn(`[SettlementTracker] botRunner update failed for trade ${trade.id}:`, e?.message || e);
      }
    }

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
      }).catch((e: any) => console.warn(`[SettlementTracker] AI hub process failed for trade ${trade.id}:`, e?.message || e));
    } catch (e: any) {
      console.warn(`[SettlementTracker] AI hub import failed for trade ${trade.id}:`, e?.message || e);
    }

    console.log(`[SettlementTracker] Trade #${trade.id} settled: ${outcome} (${profit.toFixed(2)})`);

    if (trade.strategyId) {
      try {
        const { strategyPerformanceTracker } = await import("./ai/StrategyEngine/StrategyPerformanceTracker");
        strategyPerformanceTracker.recordOutcome(trade.userId, String(trade.strategyId), 50, 50, 1, outcome === "win", profit).catch((e: any) => console.warn(`[SettlementTracker] strategy tracker failed for trade ${trade.id}:`, e?.message || e));
      } catch (e: any) {
        console.warn(`[SettlementTracker] strategy tracker import failed for trade ${trade.id}:`, e?.message || e);
      }
      try {
        // Silent failure here would silently degrade strategy-performance
        // weighting (consensus confidence) with zero trace — log it.
        db.recordStrategyStat(trade.strategyId, outcome, profit).catch((e: any) => console.warn(`[SettlementTracker] strategy stat write failed for trade ${trade.id}:`, e?.message || e));
      } catch (e: any) {
        console.warn(`[SettlementTracker] strategy stat failed for trade ${trade.id}:`, e?.message || e);
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

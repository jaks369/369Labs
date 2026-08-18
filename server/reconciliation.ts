/**
 * Ledger reconciliation — the safety net between the Deriv portfolio (ground
 * truth) and the local `trades` table (the ledger).
 *
 * The SettlementTracker settles rows it knows about every 2s; this module finds
 * the rows/contracts the tracker can *never* see:
 *   A. DB pending row  + Deriv knows the contract  → settle now (mirrors tracker)
 *   B. Deriv contract  + no DB row                 → orphan, reconstruct pending
 *   C. DB pending row  + Deriv reports nothing     → mark stuck (contract_not_found)
 *
 * Design:
 *   - Pure-ish: runUser does the classification and (in write mode) the writes.
 *   - Idempotent: all writes go through db.saveTrade / db.settleTrade /
 *     db.markTradeStuck, which are dedup-guarded.
 *   - DRY_RUN=true (default via reconcileUser(dryRun)) logs counts, writes nothing.
 *   - Every run is logged to `reconcilerRuns` for the Admin Ledger Health panel.
 */
import { derivManager, PortfolioContract } from "./derivConnection";
import * as db from "./db";

export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 min
export const SWEEP_BATCH_SIZE = 50;
// Same guard as SettlementTracker.STUCK_AFTER_MS: a contract bought moments ago
// may not be visible in a portfolio read yet (fill acknowledgment → portfolio
// propagation lag). Never mark C-stuck before this grace or we'd destroy ledger
// rows the tracker could still settle.
export const STUCK_GRACE_MS = 30 * 60 * 1000;

export interface ReconcileCounts {
  reconstructed: number;
  settled: number;
  stuck: number;
  skippedNoToken: number;
  errors: number;
  pendingMatched: number;
}

/** Classify ONE user's pending rows against their real Deriv portfolio. */
export async function reconcileUser(userId: number, dryRun = true): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { reconstructed: 0, settled: 0, stuck: 0, skippedNoToken: 0, errors: 0, pendingMatched: 0 };
  const conn = await derivManager.ensureConnected(userId);
  if (!conn) {
    counts.skippedNoToken = 1;
    return counts;
  }
  let portfolio: PortfolioContract[] = [];
  try {
    portfolio = await conn.getPortfolio();
  } catch (err: any) {
    console.error(`[reconciliation] user ${userId} getPortfolio failed:`, err?.message || err);
    counts.errors++;
    return { ...counts, errors: counts.errors };
  }
  return reconcileFromPortfolio(userId, portfolio, dryRun);
}

/**
 * Classify + (in write mode) repair a user's pending rows against a Deriv
 * portfolio supplied by the caller. The portfolio can come from the server-side
 * connection (`reconcileUser`) OR from the browser's own authenticated WS via
 * `trades.reconcileFromPortfolio` — the server-side Deriv connection (OTP
 * handshake) is not always up, while the browser socket that places trades
 * usually is, so reconciliation must not be bound to the server connection.
 */
export async function reconcileFromPortfolio(userId: number, contracts: PortfolioContract[], dryRun = true): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { reconstructed: 0, settled: 0, stuck: 0, skippedNoToken: 0, errors: 0, pendingMatched: 0 };
  const byId = new Map<number, PortfolioContract>();
  for (const p of contracts) byId.set(p.contractId, p);

  // DB rows still awaiting settlement for this user.
  let pending: any[] = [];
  try {
    pending = await db.getPendingTradesForUser(userId);
  } catch (err: any) {
    console.error(`[reconciliation] user ${userId} getPendingTradesForUser failed:`, err?.message || err);
    counts.errors++;
    return counts;
  }
  const pendingById = new Map<string, any>();
  for (const t of pending) if (t.contractId) pendingById.set(String(t.contractId), t);

  // A — DB knows it, Deriv knows it: settle if sold, else leave for the tracker.
  for (const [idStr, trade] of pendingById.entries()) {
    const portfolioContract = byId.get(Number(idStr));
    if (!portfolioContract) {
      // C — we think it's pending but Deriv has never heard of this contract.
      // Grace period first: portfolio propagation can lag a few seconds/minutes
      // behind the buy acknowledgment, and the SettlementTracker settles open
      // contracts normally — don't kill a row it can still settle.
      const entryAt = trade.entryTime ? new Date(trade.entryTime).getTime() : 0;
      if (Date.now() - entryAt < STUCK_GRACE_MS) {
        counts.pendingMatched++;
        continue;
      }
      if (!dryRun) {
        try {
          const marked = await db.markTradeStuck(trade.id, "contract_not_found");
          if (marked) counts.stuck++;
          else counts.errors++;
        } catch { counts.errors++; }
      } else {
        counts.stuck++;
      }
      continue;
    }
    if (portfolioContract.isSold) {
      // A — settle now (same fields as SettlementTracker.reconcile uses).
      const outcome: "win" | "loss" = portfolioContract.profit >= 0 ? "win" : "loss";
      if (!dryRun) {
        try {
          const updated = await db.settleTrade(trade.id, {
            result: outcome,
            profitLoss: portfolioContract.profit.toFixed(8),
            exitPrice: portfolioContract.soldAt != null ? String(portfolioContract.soldAt) : "0",
            exitTime: portfolioContract.soldAt != null ? new Date(portfolioContract.soldAt * 1000) : new Date(),
          });
          if (updated && (updated.result === "win" || updated.result === "loss")) counts.settled++;
          else counts.errors++;
        } catch { counts.errors++; }
      } else {
        counts.settled++;
      }
    } else {
      counts.pendingMatched++;
    }
  }

  // B — Deriv knows a contract we don't have a row for: reconstruct (idempotent).
  for (const [idNum, contract] of byId.entries()) {
    if (pendingById.has(String(idNum))) continue; // already reconciled as A/C above
    const existing = await db.getTradeByContractId(userId, String(idNum));
    if (existing) {
      // Row exists but not pending (already settled / stuck / imported) — not an orphan.
      if (existing.result === "pending") {
        // It IS still pending but wasn't in the A list above (index skew); settle it.
        if (contract.isSold && !dryRun) {
          const outcome: "win" | "loss" = contract.profit >= 0 ? "win" : "loss";
          try {
            await db.settleTrade(existing.id, {
              result: outcome,
              profitLoss: contract.profit.toFixed(8),
              exitPrice: contract.soldAt != null ? String(contract.soldAt) : "0",
              exitTime: contract.soldAt != null ? new Date(contract.soldAt * 1000) : new Date(),
            });
            counts.settled++;
          } catch { counts.errors++; }
        } else if (contract.isSold) {
          counts.settled++;
        }
      }
      continue;
    }
    // Real orphan → reconstruct a pending row; the 2s tracker settles it normally.
    let reconstructed = false;
    if (!dryRun) {
      try {
        const res = await db.reconstructTradeFromContract(userId, { ...contract, source: "reconcile" });
        reconstructed = true;
        if (res.existed) reconstructed = false; // a concurrent fill won the race
      } catch { counts.errors++; }
    } else {
      reconstructed = true;
    }
    if (reconstructed) counts.reconstructed++;
  }

  return counts;
}

/** Sweep every user with an active Deriv token, batching to bound DB load.
 *  Round-robins so users past the first batch still get covered eventually. */
export let sweepCursor = 0;
export const getSweepCursor = () => sweepCursor;
export async function runFullSweep(opts: { dryRun?: boolean } = {}): Promise<ReconcileCounts> {
  const dryRun = opts.dryRun !== false;
  const runStart = new Date();
  const totals: ReconcileCounts = { reconstructed: 0, settled: 0, stuck: 0, skippedNoToken: 0, errors: 0, pendingMatched: 0 };
  const userIds = await db.getUsersWithActiveTokens();
  if (userIds.length === 0) return totals;
  sweepCursor = sweepCursor % userIds.length;
  const batch = userIds.slice(sweepCursor, sweepCursor + SWEEP_BATCH_SIZE);
  sweepCursor = (sweepCursor + SWEEP_BATCH_SIZE) % userIds.length;
  for (const uid of batch) {
    let c: ReconcileCounts;
    try {
      c = await reconcileUser(uid, dryRun);
    } catch {
      totals.errors++;
      continue;
    }
    totals.reconstructed += c.reconstructed;
    totals.settled += c.settled;
    totals.stuck += c.stuck;
    totals.skippedNoToken += c.skippedNoToken;
    totals.errors += c.errors;
    totals.pendingMatched += c.pendingMatched;
  }
  const runEnd = new Date();
  try {
    await db.logReconcilerRun({ runStart, runEnd, userId: undefined, actions: { ...totals } as any });
  } catch (e: any) { console.error("[reconciliation] run log failed", e?.message || e); }
  console.log(`[reconciliation] ${dryRun ? "DRY-RUN " : ""}sweep done: ${JSON.stringify(totals)}`);
  return totals;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

/** Start the background loop. Wired from startup like the tracker.
 *  writeMode=false → log-only classification (M1 DoD: no writes).
 *  Flipped to true in M2 once live verification passes. */
export function startReconciliationLoop(writeMode = false): void {
  if (loopTimer) return;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runFullSweep({ dryRun: !writeMode });
    } catch (e: any) {
      console.error("[reconciliation] loop tick failed", e?.message || e);
    } finally {
      inFlight = false;
    }
  };
  setTimeout(tick, 30 * 1000); // first pass shortly after boot
  loopTimer = setInterval(tick, RECONCILE_INTERVAL_MS);
  console.log(`[reconciliation] background loop started (every 5 min, ${writeMode ? "WRITE" : "dry-run"} mode)`);
}

export function stopReconciliationLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}
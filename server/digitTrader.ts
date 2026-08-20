/**
 * Digit Trader — prediction layer + optional real execution.
 *
 * The page runs continuously: it observes the recent digit stream, emits
 * OVER/UNDER/EVEN/ODD predictions whose confidence is capped near 58 (a tilt is
 * never sold as an edge), records each prediction with the user's stake, and
 * settles every prediction against the NEXT real tick so the ledger trend is
 * truthful (~50%). Auto-predict is ON by default so the ledger is always real;
 * Auto-exec places the same prediction as a REAL Deriv contract with the user's
 * balance. Deliberately self-contained: it does not piggyback on the concierge
 * loop or the bot loops.
 */

import * as db from "./db";
import { getTickHistory } from "./aitools";
import { buildDigitSnapshot, settleDigitRead, digitsFromTicks, DigitRead, DigitSnapshot, TickLike } from "@shared/digits";
import { getDecimalPlaces } from "@shared/lastDigit";
import { buildLimitOrder } from "@shared/slTp";
import { getStandardVolatilitySymbols } from "@shared/symbols";
import { derivManager } from "./derivConnection";
import { getRecentTicks, isFeedStale } from "./tickCollector";
import { fireWebhookEvent } from "./webhookExecutor";

export const READ_WINDOW_TICKS = 100; // digits sampled per read
export const READ_DEDUP_MS = 4 * 3600 * 1000; // same symbol+read kept open 4h
export const FETCH_COUNT = 200; // tick history depth for window + settle margin

/**
 * Auto settings (persisted per user via userMemory, additive like the Concierge
 * settings). Auto-predict is ON by default so the prediction ledger is always
 * populated with real outcomes; Auto-exec additionally places REAL trades.
 */
export interface DigitTraderSettings {
  autoPredict: boolean;
  autoExec: boolean;
  stake: number;
  stopLoss: number;
  takeProfit: number;
  symbols: string[]; // followed symbols the auto loop watches
  maxDailyLoss?: number; // realized loss cap per UTC day (0 = off)
  maxDailyTrades?: number; // prediction/trade cap per UTC day (0 = off)
}

export const DEFAULT_DT_SETTINGS: DigitTraderSettings = {
  autoPredict: true,
  autoExec: false,
  stake: 1,
  stopLoss: 0,
  takeProfit: 0,
  symbols: getStandardVolatilitySymbols(),
  maxDailyLoss: 0,
  maxDailyTrades: 0,
};

async function readSettings(userId: number): Promise<DigitTraderSettings> {
  const mem = await db.getUserMemory(userId);
  const raw = (mem?.digitTrader as any) || {};
  const out = { ...DEFAULT_DT_SETTINGS, ...raw };
  return {
    autoPredict: out.autoPredict !== false,
    autoExec: !!out.autoExec,
    stake: Math.max(0.35, Number(out.stake) || DEFAULT_DT_SETTINGS.stake),
    stopLoss: Math.max(0, Number(out.stopLoss) || 0),
    takeProfit: Math.max(0, Number(out.takeProfit) || 0),
    symbols:
      Array.isArray(out.symbols) && out.symbols.length
        ? out.symbols
            .map((s: any) => String(s).toUpperCase())
            .filter(Boolean)
            .slice(0, 12)
        : DEFAULT_DT_SETTINGS.symbols,
    maxDailyLoss: Math.max(0, Number(out.maxDailyLoss) || 0),
    maxDailyTrades: Math.max(0, Math.floor(Number(out.maxDailyTrades) || 0)),
  };
}

export async function getDTPSettingsFor(userId: number): Promise<DigitTraderSettings> {
  const s = await readSettings(userId);
  touchEnabledUser(userId, s.autoPredict || s.autoExec);
  return s;
}

/** Persist settings via userMemory (additive; keeps existing memory intact). */
export async function saveDTPSettings(userId: number, patch: Partial<DigitTraderSettings>): Promise<DigitTraderSettings> {
  const mem = (await db.getUserMemory(userId)) || {};
  const next = { ...DEFAULT_DT_SETTINGS, ...((mem.digitTrader as any) || {}), ...patch };
  const cleaned = {
    autoPredict: next.autoPredict !== false,
    autoExec: !!next.autoExec,
    stake: Math.max(0.35, Number(next.stake) || DEFAULT_DT_SETTINGS.stake),
    stopLoss: Math.max(0, Number(next.stopLoss) || 0),
    takeProfit: Math.max(0, Number(next.takeProfit) || 0),
    symbols: (Array.isArray(next.symbols) && next.symbols.length ? next.symbols : DEFAULT_DT_SETTINGS.symbols)
      .map((s: any) => String(s).toUpperCase())
      .filter(Boolean)
      .slice(0, 12),
    maxDailyLoss: Math.max(0, Number(next.maxDailyLoss) || 0),
    maxDailyTrades: Math.max(0, Math.floor(Number(next.maxDailyTrades) || 0)),
  };
  if (cleaned.symbols.length === 0) cleaned.symbols = ["R_100"];
  await db.setUserMemory(userId, { ...mem, digitTrader: cleaned });
  touchEnabledUser(userId, cleaned.autoPredict || cleaned.autoExec);
  return cleaned;
}

/** Tag for auto-executed trades in the real ledger (keeps the Digit Trader history query cheap). */
export const DIGIT_TRADER_SOURCE = "digitTrader";

const AUTO_EXEC_INTERVAL_MS = 5000; // near-live digit auto trading
const TRADE_COOLDOWN_MS = 60_000; // at most one auto trade per symbol per minute
const MAX_AUTO_SYMBOLS = 8;
const ENABLED_RESCAN_MS = 30_000; // how often to re-derive the enabled-user set
const MAX_OPEN_CONTRACTS_PER_USER = 6; // hard cap on concurrently open (pending) auto contracts per user

export interface DigitAutoStatus {
  enabled: boolean;
  running: boolean;
  inProgress: boolean;
  lastCycleAt: number | null;
  lastCycleTrades: number;
  lastCyclePredictions: number;
  intervalMs: number;
}

let autoInterval: ReturnType<typeof setInterval> | null = null;
let autoInProgress = false;
const autoStatus: DigitAutoStatus = {
  enabled: false,
  running: false,
  inProgress: false,
  lastCycleAt: null,
  lastCycleTrades: 0,
  lastCyclePredictions: 0,
  intervalMs: AUTO_EXEC_INTERVAL_MS,
};
const recentTradeAt = new Map<string, number>(); // `${userId}:${symbol}` → epoch ms
// Users with autoPredict=on and/or autoExec=on are polled every cycle
// (efficiency): hydrated from getSettings/patchSettings calls and reconciled
// against the whole user list periodically so toggles made from other clients
// still get picked up. Auto-predict is ON by default so the prediction ledger
// is continuously real; auto-exec additionally places REAL trades.
const enabledUsers = new Set<number>();

export function getDigitAutoExecStatus(): DigitAutoStatus {
  return { ...autoStatus };
}

function touchEnabledUser(userId: number, enabled: boolean): void {
  if (enabled) enabledUsers.add(userId);
  else enabledUsers.delete(userId);
}

async function reconcileEnabledUsers(): Promise<void> {
  try {
    const users = await db.listAllUsers();
    for (const u of users) {
      const s = await readSettings(u.id);
      touchEnabledUser(u.id, s.autoPredict || s.autoExec);
    }
  } catch (e) {
    console.warn("[digitTrader] reconcileEnabledUsers failed:", (e as any)?.message || e);
  }
}

/** Map a shared DigitRead to the Deriv contract type used by the manual terminal. */
function readToContract(read: DigitRead): { contractType: string; barrier?: string } {
  switch (read.type) {
    case "OVER":
      return { contractType: "DIGITOVER", barrier: String(read.barrier ?? 5) };
    case "UNDER":
      return { contractType: "DIGITUNDER", barrier: String(read.barrier ?? 5) };
    case "EVEN":
      return { contractType: "DIGITEVEN" };
    case "ODD":
      return { contractType: "DIGITODD" };
    case "MATCH":
      return { contractType: "DIGITMATCH", barrier: String(read.barrier ?? 0) };
    case "DIFFER":
      return { contractType: "DIGITDIFFER", barrier: String(read.barrier ?? 0) };
  }
}

/**
 * Place one real 1-tick digit contract, mirroring the executionEngine
 * proposal→buy flow. The pending ledger row (source=digitTrader) is settled by
 * the SettlementTracker like any other real trade, so the honesty ledger is
 * truthful. Never fabricates a fill: a failed buy records nothing.
 */
async function placeAutoTrade(userId: number, conn: any, symbol: string, read: DigitRead, settings: DigitTraderSettings, entryPrice: number): Promise<boolean> {
  const account = (conn as any)?.getSnapshot?.()?.account;
  const currency = account?.currency || "USD";
  // Skip cleanly when the connected account can't cover the stake (e.g. an
  // empty soft/demo account) instead of burning a proposal that Deriv rejects.
  const balance = typeof account?.balance === "number" ? account.balance : 0;
  if (balance > 0 && settings.stake > balance) {
    console.warn(`[digitTrader] User ${userId}: balance $${balance.toFixed(2)} below stake $${settings.stake}. Skipping placement on ${symbol}.`);
    return false;
  }
  const { contractType, barrier } = readToContract(read);

  const proposalPayload: Record<string, any> = {
    proposal: 1,
    amount: settings.stake,
    basis: "stake",
    contract_type: contractType,
    currency,
    duration: 1,
    duration_unit: "t",
    underlying_symbol: symbol,
  };
  if (barrier) proposalPayload.barrier = barrier;
  // Deriv honors SL/TP only via `limit_order` on multiplier/accumulator
  // contracts (top-level stop_loss/take_profit are not part of the proposal
  // schema). Digit contracts settle instantly, so buildLimitOrder emits nothing
  // for them.
  const limitOrder = buildLimitOrder(contractType, settings.stopLoss, settings.takeProfit);
  if (limitOrder.limit_order) proposalPayload.limit_order = limitOrder.limit_order;

  const proposal = await (conn as any).sendRaw(proposalPayload).catch((e: any) => {
    console.warn(`[digitTrader] Deriv proposal failed (${symbol} ${read.label}): ${e?.message || e}`);
    return null;
  });
  if (!proposal?.proposal?.id) {
    console.warn(`[digitTrader] Deriv proposal returned no id (${symbol} ${read.label}). Response: ${JSON.stringify(proposal)}`);
    return false;
  }

  const buy = await (conn as any).sendRaw({ buy: proposal.proposal.id, price: proposal.proposal.ask_price }).catch((e: any) => {
    console.warn(`[digitTrader] Deriv buy failed (${symbol} ${read.label}): ${e?.message || e}`);
    return null;
  });
  if (!buy?.buy?.contract_id) {
    console.warn(`[digitTrader] Deriv buy failed (${symbol} ${read.label}). Trade not recorded.`);
    fireWebhookEvent(userId, "trade.error", { source: DIGIT_TRADER_SOURCE, symbol, stake: settings.stake, read: read.label, reason: "buy_failed" }).catch(
      () => {},
    );
    return false;
  }

  try {
    await db.saveTrade({
      userId,
      symbol,
      contractType,
      stake: String(settings.stake),
      entryPrice: String(entryPrice),
      result: "pending",
      contractId: String(buy.buy.contract_id),
      entryTime: new Date(),
      source: DIGIT_TRADER_SOURCE,
    });
  } catch (e: any) {
    console.error(
      `[digitTrader] CRITICAL: contract ${buy.buy.contract_id} was bought on Deriv but the DB save failed for user ${userId}. Not re-arming.`,
      e?.message || e,
    );
    fireWebhookEvent(userId, "trade.error", {
      source: DIGIT_TRADER_SOURCE,
      symbol,
      stake: settings.stake,
      contractId: buy.buy.contract_id,
      read: read.label,
      reason: "db_save_failed",
    }).catch(() => {});
    return false;
  }

  console.log(`[digitTrader] Auto trade placed — #${buy.buy.contract_id} ${symbol} ${read.label} (${contractType}) @ $${settings.stake}`);
  fireWebhookEvent(userId, "digitTrader.trade", {
    source: DIGIT_TRADER_SOURCE,
    contractId: buy.buy.contract_id,
    symbol,
    read: read.label,
    contractType,
    stake: settings.stake,
  }).catch(() => {});
  return true;
}

/** Start of the current UTC day — the reset boundary for the daily caps. */
function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(0);
  d.setUTCSeconds(0);
  d.setUTCMilliseconds(0);
  return d;
}

export interface DigitDailyUsage {
  trades: number;
  pnl: number;
  dayStart: string; // ISO — when the current daily window began
  maxDailyLoss: number;
  maxDailyTrades: number;
  lossHalted: boolean;
  tradesHalted: boolean;
}

/** Whether the daily caps pause auto-exec: realized loss ≤ -maxDailyLoss, or placed trades ≥ maxDailyTrades. */
export function computeDailyHalt(
  usage: { trades: number; pnl: number },
  settings: Pick<DigitTraderSettings, "maxDailyLoss" | "maxDailyTrades">,
): { lossHalted: boolean; tradesHalted: boolean } {
  return {
    lossHalted: !!(settings.maxDailyLoss && usage.pnl <= -settings.maxDailyLoss),
    tradesHalted: !!(settings.maxDailyTrades && usage.trades >= settings.maxDailyTrades),
  };
}

/**
 * Per-user daily usage from the ledger (source=digitTrader trades) plus whether
 * the configured caps make the auto loop pause. Read by the panel to explain
 * why auto-exec is idle.
 */
export async function getDailyUsageFor(userId: number): Promise<DigitDailyUsage> {
  const dayStart = startOfUtcDay();
  const settings = await readSettings(userId);
  const usage = await db.getDigitTraderDailyUsage(userId, dayStart);
  const { lossHalted, tradesHalted } = computeDailyHalt(usage, settings);
  return {
    trades: usage.trades,
    pnl: usage.pnl,
    dayStart: dayStart.toISOString(),
    maxDailyLoss: settings.maxDailyLoss || 0,
    maxDailyTrades: settings.maxDailyTrades || 0,
    lossHalted,
    tradesHalted,
  };
}

/**
 * Build, dedup, and persist the live reads for one symbol from ready tick data.
 * Shared by the manual scan (network ticks) and the auto prediction loop
 * (in-memory ticks) so both write the same truthful ledger.
 */
async function persistReadsForTicks(
  userId: number,
  symbol: string,
  ticks: TickLike[],
  nowEpoch: number,
  filterWeak = true, // when false, persist ALL reads including WEAK for ledger transparency
): Promise<{ snapshot: DigitSnapshot; persisted: number; emitted: DigitRead[] }> {
  const snapshot = buildDigitSnapshot(symbol, ticks);
  const reads = filterWeak ? snapshot.reads.filter((r) => r.strength !== "WEAK") : snapshot.reads;
  const since = nowEpoch * 1000 - READ_DEDUP_MS; // generatedAt is ms in the schema
  const open = await db.listOpenDigitReads(userId, symbol, since);
  const recentKeys = new Set(open.map((r) => `${r.readType}:${r.barrier ?? ""}`));

  let persisted = 0;
  for (const read of reads) {
    const key = `${read.type}:${read.barrier ?? ""}`;
    if (recentKeys.has(key)) continue;
    recentKeys.add(key);
    const ok = await db.saveDigitRead({
      userId,
      symbol,
      readType: read.type,
      barrier: read.barrier,
      label: read.label,
      confidence: read.confidence,
      strength: read.strength,
      sample: read.sample,
      freq: String(read.freq),
      baseline: String(read.baseline),
      deltaPp: String(read.deltaPp),
      reasons: read.reasons,
      decisionEpoch: ticks.length ? Number(ticks[ticks.length - 1].epoch) : nowEpoch,
      status: "open",
      generatedAt: nowEpoch * 1000,
    });
    if (ok) persisted++;
  }

  return { snapshot, persisted, emitted: reads };
}

/**
 * Compute reads for a symbol, persist any non-duplicate STRONG/MEDIUM ones
 * into the ledger, and settle every open read whose decision tick has passed.
 */
export async function scanAndPersistForUser(userId: number, symbol: string): Promise<DigitScanResult> {
  const ticks = await getTickHistory(symbol, FETCH_COUNT);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const { snapshot, persisted, emitted } = await persistReadsForTicks(userId, symbol, digitsToEpochs(ticks), nowEpoch, false);
  const settled = await settleOpenDigitReads(userId);
  return { snapshot, persisted, emitted, settled };
}

// Settle scans are throttled inside the auto loop (they fetch fresh tick
// history per symbol) — never more often than every 10s per user.
const lastAutoSettle = new Map<number, number>();
const AUTO_SETTLE_INTERVAL_MS = 10_000;

/**
 * One auto cycle: for every enrolled user, run the prediction pass on each
 * followed symbol (always-on, fresh data, no real trades) and, when auto-exec
 * is on, additionally place REAL Deriv contracts using the daily caps.
 */
async function autoCycle(): Promise<void> {
  if (autoInProgress) return;
  autoInProgress = true;
  autoStatus.running = true;
  let placed = 0;
  let predicted = 0;
  try {
    if (isFeedStale()) return;
    if (recentTradeAt.size > 5000) {
      const cutoff = Date.now() - TRADE_COOLDOWN_MS;
      for (const [k, at] of recentTradeAt) if (at < cutoff) recentTradeAt.delete(k);
    }
    const now = Date.now();
    const dayStart = startOfUtcDay();
    for (const userId of enabledUsers) {
      try {
        const settings = await readSettings(userId);
        if (!settings.autoPredict && !settings.autoExec) {
          enabledUsers.delete(userId);
          continue;
        }
        for (const symbol of settings.symbols.slice(0, MAX_AUTO_SYMBOLS)) {
          if (!settings.autoPredict) break;
          try {
            const ticks = getRecentTicks(symbol, 200);
            if (ticks.length < 16) continue;
            const lastEpoch = ticks[ticks.length - 1].epoch;
            if (!lastEpoch || now / 1000 - lastEpoch > 60) continue; // stale feed for this symbol
            const res = await persistReadsForTicks(userId, symbol, ticks, Math.floor(now / 1000), false);
            predicted += res.persisted;
          } catch (e) {
            console.warn(`[digitTrader] prediction error for user ${userId} symbol ${symbol}:`, (e as any)?.message || e);
          }
        }
        const lastSettle = lastAutoSettle.get(userId) || 0;
        if (now - lastSettle > AUTO_SETTLE_INTERVAL_MS) {
          try {
            await settleOpenDigitReads(userId);
            lastAutoSettle.set(userId, Date.now());
          } catch (e) {
            console.warn(`[digitTrader] auto settle error for user ${userId}:`, (e as any)?.message || e);
          }
        }
        if (!settings.autoExec) continue;
        const usage = await db.getDigitTraderDailyUsage(userId, dayStart);
        let placedToday = usage.trades;
        if (settings.maxDailyLoss && usage.pnl <= -settings.maxDailyLoss) {
          fireWebhookEvent(userId, "digitTrader.paused", { reason: "maxDailyLoss", pnl: usage.pnl, limit: settings.maxDailyLoss }).catch(() => {});
          continue;
        }
        const conn = await derivManager.ensureConnected(userId);
        if (!conn) {
          console.warn(`[digitTrader] No Deriv connection/token for user ${userId}. Auto-exec idle for this user.`);
          continue;
        }
        const openContracts = await db.countOpenDigitTraderTrades(userId);
        if (openContracts >= MAX_OPEN_CONTRACTS_PER_USER) {
          console.warn(`[digitTrader] User ${userId}: ${openContracts} open auto contracts at the ${MAX_OPEN_CONTRACTS_PER_USER} cap. Skipping this cycle.`);
          continue;
        }
        for (const symbol of settings.symbols.slice(0, MAX_AUTO_SYMBOLS)) {
          if (settings.maxDailyTrades && placedToday >= settings.maxDailyTrades) break;
          const key = `${userId}:${symbol}`;
          if ((recentTradeAt.get(key) || 0) + TRADE_COOLDOWN_MS > now) continue;
          try {
            const ticks = getRecentTicks(symbol, 200);
            if (ticks.length < 30) continue;
            const lastEpoch = ticks[ticks.length - 1].epoch;
            if (!lastEpoch || now / 1000 - lastEpoch > 60) continue; // stale feed for this symbol
            const snapshot = buildDigitSnapshot(symbol, ticks as TickLike[]);
            const reads = snapshot.reads.filter((r) => r.strength !== "WEAK");
            if (reads.length === 0) continue;
            const read = [...reads].sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp))[0];
            const ok = await placeAutoTrade(userId, conn, symbol, read, settings, ticks[ticks.length - 1].price);
            if (ok) {
              recentTradeAt.set(key, Date.now());
              placed++;
              placedToday++;
            }
          } catch (e) {
            // One bad symbol must never abort the user's other placements.
            console.warn(`[digitTrader] symbol ${symbol} placement error for user ${userId}:`, (e as any)?.message || e);
          }
        }
      } catch (e) {
        console.warn(`[digitTrader] auto cycle error for user ${userId}:`, (e as any)?.message || e);
      }
    }
    autoStatus.lastCycleTrades = placed;
    autoStatus.lastCyclePredictions = predicted;
    autoStatus.lastCycleAt = Date.now();
  } catch (e: any) {
    console.warn("[digitTrader] auto cycle error:", e?.message || e);
  } finally {
    autoInProgress = false;
    autoStatus.running = false;
  }
}

export function startDigitTraderAutoExec(): void {
  if (autoInterval) return;
  autoStatus.enabled = true;
  console.log("[digitTrader] Auto loop starting — predicting every 5s, auto-exec only for users with autoExec=on");
  reconcileEnabledUsers().catch(() => {});
  const reconcile = setInterval(() => reconcileEnabledUsers().catch(() => {}), ENABLED_RESCAN_MS);
  autoInterval = setInterval(() => {
    autoCycle().catch((e) => console.warn("[digitTrader] autoCycle failed:", e?.message || e));
  }, AUTO_EXEC_INTERVAL_MS);
  autoInterval.unref?.();
  reconcile.unref?.();
}

export function stopDigitTraderAutoExec(): void {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
  }
  autoStatus.enabled = false;
  autoInProgress = false;
}

const digitsToEpochs = (ticks: Array<{ price: number; timestamp: number }>): TickLike[] =>
  ticks.map((t) => ({ price: Number(t.price), epoch: Math.floor(Number(t.timestamp) / 1000) }));

export async function getDigitSnapshot(symbol: string): Promise<DigitSnapshot> {
  const ticks = await getTickHistory(symbol, FETCH_COUNT);
  return buildDigitSnapshot(symbol, digitsToEpochs(ticks));
}

export interface DigitScanResult {
  snapshot: DigitSnapshot;
  persisted: number;
  emitted: DigitRead[]; // reads shown to the user (before dedup)
  settled: { settled: number; wins: number; losses: number };
}

/** Resolve every open read against the first tick strictly after its decision tick. */
export async function settleOpenDigitReads(userId: number): Promise<{ settled: number; wins: number; losses: number }> {
  const open = await db.listOpenDigitReads(userId);
  let settled = 0;
  let wins = 0;
  let losses = 0;

  const bySymbol: Record<string, Array<{ id: number; decisionEpoch: number; readType: string; barrier: number | null }>> = {};
  for (const r of open) {
    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
    bySymbol[r.symbol].push({ id: r.id, decisionEpoch: r.decisionEpoch, readType: r.readType, barrier: r.barrier ?? null });
  }

  for (const [symbol, list] of Object.entries(bySymbol)) {
    let ticks: TickLike[] = [];
    try {
      ticks = digitsToEpochs(await getTickHistory(symbol, FETCH_COUNT));
    } catch {
      ticks = [];
    }
    if (ticks.length < 2) continue;
    const decimals = getDecimalPlaces(symbol);
    const digitTicks = digitsFromTicks(ticks, decimals);
    for (const item of list) {
      const idx = digitTicks.findIndex((t) => Number(t.epoch) > item.decisionEpoch);
      if (idx < 0) continue;
      const status = settleDigitRead({ type: item.readType as any, barrier: item.barrier }, digitTicks[idx].digit);
      await db.setDigitReadOutcome(item.id, status, digitTicks[idx].epoch);
      settled++;
      if (status === "win") wins++;
      else if (status === "loss") losses++;
    }
  }
  return { settled, wins, losses };
}

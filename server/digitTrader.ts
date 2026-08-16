/**
 * Digit Trader — the honest OVER/UNDER/EVEN/ODD setup layer.
 *
 * Pure-digit direction built on the repo's existing digit conventions
 * (shared/digits.ts reuses lastDigitOf/getDecimalPlaces and the fair baselines
 * documented in server/signalEngine.ts). No LLM, no forecasting: it observes
 * the recent digit stream, emits reads whose confidence is capped near 58 so a
 * tilt can never be sold as an edge, persists them to the digitReads ledger,
 * and resolves every open read against the NEXT tick so the ledger trend stays
 * truthful (~50%). Deliberately self-contained: it does not piggyback on the
 * concierge loop or the bot loops, so scanning is driven by the panel.
 */

import * as db from "./db";
import { getTickHistory } from "./aitools";
import {
  buildDigitSnapshot,
  settleDigitRead,
  digitsFromTicks,
  DigitRead,
  DigitSnapshot,
  TickLike,
} from "@shared/digits";
import { getDecimalPlaces } from "@shared/lastDigit";

export const READ_WINDOW_TICKS = 100; // digits sampled per read
export const READ_DEDUP_MS = 4 * 3600 * 1000; // same symbol+read kept open 4h
export const FETCH_COUNT = 200; // tick history depth for window + settle margin

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

/**
 * Compute reads for a symbol, persist any non-duplicate STRONG/MEDIUM ones
 * into the ledger, and settle every open read whose decision tick has passed.
 */
export async function scanAndPersistForUser(userId: number, symbol: string): Promise<DigitScanResult> {
  const ticks = await getTickHistory(symbol, FETCH_COUNT);
  const snapshot = buildDigitSnapshot(symbol, digitsToEpochs(ticks));
  const reads = snapshot.reads.filter((r) => r.strength !== "WEAK");
  const nowEpoch = Math.floor(Date.now() / 1000);
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
      decisionEpoch: lastDecisionEpoch(ticks),
      status: "open",
      generatedAt: nowEpoch * 1000,
    });
    if (ok) persisted++;
  }

  const settled = await settleOpenDigitReads(userId);
  return { snapshot, persisted, emitted: reads, settled };
}

/** Epoch (seconds) of the newest tick — the decision point for the next tick. */
function lastDecisionEpoch(ticks: Array<{ price: number; timestamp: number }>): number {
  if (ticks.length === 0) return Math.floor(Date.now() / 1000);
  return Math.floor(Number(ticks[ticks.length - 1].timestamp) / 1000);
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
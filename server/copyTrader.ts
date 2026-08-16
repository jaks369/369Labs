/**
 * Copy trading — deterministic mirror fan-out.
 *
 * When a leader records a fill, active followers get an audited copyMirror
 * record (with exact sizing math) and a push notification. Mirrors are NOT
 * auto-placed on the follower's Deriv account — the follower executes on their
 * own token through the existing buy flow, so we never create phantom pending
 * contracts or risk the follower's account without explicit action.
 *
 * Pure sizing math is exported for tests.
 */

import * as db from "./db";
import { notifyUser, notifyUserTelegram } from "./_core/notification";

/** Stake = leader stake × multiplier, capped by the follower's maxStake. */
export function computeMirrorStake(leaderStake: number, multiplier: number, maxStake: number | null | undefined): number {
  if (!leaderStake || leaderStake <= 0) return 0;
  const mult = multiplier > 0 ? multiplier : 1;
  let stake = leaderStake * mult;
  if (maxStake && maxStake > 0) stake = Math.min(stake, maxStake);
  return Math.round(stake * 100) / 100;
}

/**
 * Fan a leader's fill out to every active follower. Fire-and-forget — never
 * throws into the caller. Only the leader's own fill (userId === callerUserId)
 * triggers mirrors.
 */
export async function broadcastLeaderFill(leaderTrade: any, callerUserId: number): Promise<{ mirrored: number; skipped: number }> {
  try {
    if (!leaderTrade || leaderTrade.userId !== callerUserId) return { mirrored: 0, skipped: 0 };
    if (!leaderTrade.id || !leaderTrade.symbol || !leaderTrade.stake) return { mirrored: 0, skipped: 0 };
    const relations = await db.listRelationsForLeader(leaderTrade.userId);
    if (relations.length === 0) return { mirrored: 0, skipped: 0 };
    const leaderStake = Number(leaderTrade.stake) || 0;
    let mirrored = 0;
    let skipped = 0;
    for (const rel of relations) {
      if (rel.followerUserId === leaderTrade.userId) continue;
      const already = await db.didMirror(leaderTrade.id, rel.followerUserId);
      if (already) continue;
      const stake = computeMirrorStake(leaderStake, Number(rel.stakeMultiplier ?? 1), rel.maxStake ? Number(rel.maxStake) : null);
      if (stake < 0.35) {
        skipped++;
        await db.saveCopyMirror({
          leaderUserId: leaderTrade.userId,
          followerUserId: rel.followerUserId,
          sourceTradeId: leaderTrade.id,
          mirroredTradeId: null,
          symbol: leaderTrade.symbol,
          contractType: leaderTrade.contractType || "CALL",
          stake: String(stake),
          status: "skipped",
          reason: "below_minimum_stake",
        }).catch(() => {});
        continue;
      }
      mirrored++;
      await db.saveCopyMirror({
        leaderUserId: leaderTrade.userId,
        followerUserId: rel.followerUserId,
        sourceTradeId: leaderTrade.id,
        mirroredTradeId: null,
        symbol: leaderTrade.symbol,
        contractType: leaderTrade.contractType || "CALL",
        stake: String(stake),
        status: "mirrored",
        reason: null,
      }).catch(() => {});
      notifyUser(
        rel.followerUserId,
        "signalDetected",
        "Copy trade signal from your leader",
        `Your leader opened ${leaderTrade.symbol} ${leaderTrade.contractType || "CALL"} — mirrored at $${stake}. Review and execute on your own account.`,
        `Symbol: ${leaderTrade.symbol}\nContract: ${leaderTrade.contractType || "CALL"}\nMirror stake: $${stake}`,
      ).catch(() => {});
      notifyUserTelegram(rel.followerUserId, `📡 Copy Signal\nLeader opened ${leaderTrade.symbol} ${leaderTrade.contractType || "CALL"}\nMirror stake: $${stake}`).catch(() => {});
    }
    return { mirrored, skipped };
  } catch (e) {
    console.error("[copyTrader] broadcast failed", e instanceof Error ? e.message : e);
    return { mirrored: 0, skipped: 0 };
  }
}
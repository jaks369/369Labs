/**
 * Tick-history retention policy (TiDB free-tier quota relief).
 * Pure env-parsing logic — no DB imports — kept separate so it is trivially
 * testable. db.ts consumes these helpers.
 */

/** Retention window in days. Default 14; TICK_RETENTION_DAYS=0 disables pruning. */
export function tickRetentionDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.TICK_RETENTION_DAYS;
  if (raw === undefined || raw === "") return 14;
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/** Unix seconds before which ticks may be pruned; null when pruning disabled. */
export function tickRetentionCutoffSec(nowSec: number = Math.floor(Date.now() / 1000), env: NodeJS.ProcessEnv = process.env): number | null {
  const days = tickRetentionDays(env);
  if (days == null) return null;
  return nowSec - Math.floor(days * 86400);
}

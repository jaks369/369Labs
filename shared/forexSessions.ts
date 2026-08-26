/**
 * Forex session / liquidity awareness.
 *
 * "Open" is binary; liquidity is not. London does ~38-43% of daily FX volume
 * and the London–New York overlap (13:00-17:00 UTC) concentrates the majority
 * of it with the tightest spreads and most reliable directional movement. The
 * New York close → Sydney open window (~21:00-23:00 UTC) is the documented
 * thin spot: gappy prints, wider spreads, stop-levels less trustworthy.
 *
 * Purely calendar-based (fixed UTC schedules) — no new data feed required.
 * This EXTENDS the existing exchange_is_open gating ("open" → "open, and how
 * good are conditions"), it does not replace it.
 *
 * Note: these are calendar sessions. Local holidays thin liquidity further
 * but are out of scope here.
 */

export type LiquidityQuality = "peak" | "good" | "normal" | "thin";

export interface SessionInfo {
  /** Sessions currently active, e.g. ["London", "New York"]. */
  activeSessions: string[];
  /** True during the London–New York overlap (13:00–17:00 UTC). */
  londonNyOverlap: boolean;
  liquidity: LiquidityQuality;
  /** One-line explanation suitable for surfacing to a trader. */
  note: string;
}

const SESSIONS: Array<{ name: string; startUtc: number; endUtc: number }> = [
  // Ranges may wrap midnight; [start, end) in UTC hours.
  { name: "Sydney", startUtc: 21, endUtc: 6 },
  { name: "Tokyo", startUtc: 0, endUtc: 9 },
  { name: "London", startUtc: 7, endUtc: 16 },
  { name: "New York", startUtc: 12, endUtc: 21 },
];

function inSession(hourUtc: number, s: { startUtc: number; endUtc: number }): boolean {
  if (s.startUtc <= s.endUtc) return hourUtc >= s.startUtc && hourUtc < s.endUtc;
  return hourUtc >= s.startUtc || hourUtc < s.endUtc; // wraps midnight
}

export function getForexSessionInfo(date: Date = new Date()): SessionInfo {
  // Use fractional UTC hour so minute-level transitions behave sanely.
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;
  const active = SESSIONS.filter((s) => inSession(h, s)).map((s) => s.name);
  const londonNyOverlap = active.includes("London") && active.includes("New York");
  // NY close → Sydney open gap: after NY ends (21:00), before Sydney fully absorbs (~23:00).
  const thinWindow = h >= 21 && h < 23;

  let liquidity: LiquidityQuality;
  let note: string;
  if (londonNyOverlap) {
    liquidity = "peak";
    note = "London–New York overlap: deepest liquidity and tightest spreads of the day.";
  } else if (active.includes("London") || (active.includes("New York") && !thinWindow)) {
    liquidity = "good";
    note = active.includes("London") ? "London session: strong liquidity." : "New York session: solid liquidity.";
  } else if (thinWindow) {
    liquidity = "thin";
    note = "NY close → Sydney open: thinnest liquidity of the day — spreads widen and prints can gap.";
  } else {
    liquidity = "normal";
    note = `Off-peak (${active.join(" + ") || "between sessions"}): reduced but tradable liquidity.`;
  }

  return { activeSessions: active, londonNyOverlap, liquidity, note };
}

/**
 * Pure portfolio-insight math for the /portfolio page.
 *
 * Computed entirely from the settled trades the page already fetches — no new
 * server queries, no bot-loop coupling. Everything is an OBSERVATION of the
 * trade ledger: 30-day daily P&L trend and hold-time (time-in-trade) stats.
 * Degrades gracefully on missing/future/malformed timestamps; never fabricates
 * numbers (a day with no trades simply has pnl 0 and trades 0).
 */

export interface TradeLike {
  entryTime?: Date | string | number | null;
  exitTime?: Date | string | number | null;
  profitLoss?: string | number | null;
  result?: string | null;
}

export interface DailyPnl {
  date: string; // "YYYY-MM-DD"
  label: string; // "MM-DD"
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
}

export interface TimeInTradeStats {
  count: number; // settled trades with both times
  avgSec: number | null;
  medianSec: number | null;
  minSec: number | null;
  maxSec: number | null;
  buckets: { label: string; count: number; pct: number }[]; // hold-time distribution
}

/** PnL buckets by hold time — honest sense of how long trades run. */
export const HOLD_BUCKETS: Array<{ label: string; maxSec: number | null }> = [
  { label: "< 1m", maxSec: 60 },
  { label: "1-5m", maxSec: 300 },
  { label: "5-15m", maxSec: 900 },
  { label: "15-60m", maxSec: 3600 },
  { label: "> 1h", maxSec: null },
];

const toMs = (v: Date | string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const t = new Date(v as Date | string | number).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Roll a "date" (local timezone) label for bucketing. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Last `days` calendar days (oldest -> today), each with pnl/trades/win-rate. */
export function dailyTrend(trades: TradeLike[], days: number = 30): DailyPnl[] {
  const byDay = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
  for (const t of trades) {
    const ms = toMs(t.entryTime);
    if (ms == null || ms > Date.now() + 86400000) continue; // ignore future/replay-exported rows
    const pnl = Number(t.profitLoss ?? 0);
    if (!Number.isFinite(pnl)) continue;
    const key = dayKey(ms);
    const day = byDay.get(key) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
    day.pnl += pnl;
    day.trades += 1;
    if (t.result === "win") day.wins += 1;
    else if (t.result === "loss") day.losses += 1;
    byDay.set(key, day);
  }
  const out: DailyPnl[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = byDay.get(key);
    out.push({
      date: key,
      label: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      pnl: day ? Math.round(day.pnl * 100) / 100 : 0,
      trades: day?.trades ?? 0,
      wins: day?.wins ?? 0,
      losses: day?.losses ?? 0,
      winRatePct: day && day.trades > 0 ? Math.round((day.wins / day.trades) * 100) : 0,
    });
  }
  return out;
}

/** Total / win-rate over the rolling window (for headline stats). */
export function trendSummary(trend: DailyPnl[]): { pnl: number; trades: number; winRatePct: number } {
  const pnl = trend.reduce((s, d) => s + d.pnl, 0);
  const trades = trend.reduce((s, d) => s + d.trades, 0);
  const wins = trend.reduce((s, d) => s + d.wins, 0);
  return {
    pnl: Math.round(pnl * 100) / 100,
    trades,
    winRatePct: trades > 0 ? Math.round((wins / trades) * 100) : 0,
  };
}

/** Hold-time stats from settled trades that have both entry and exit times. */
export function timeInTradeStats(trades: TradeLike[]): TimeInTradeStats {
  const durations: number[] = [];
  for (const t of trades) {
    const entry = toMs(t.entryTime);
    const exit = toMs(t.exitTime);
    if (entry == null || exit == null || exit < entry) continue;
    durations.push(Math.round((exit - entry) / 1000));
  }
  durations.sort((a, b) => a - b);
  const count = durations.length;
  if (count === 0) {
    return { count: 0, avgSec: null, medianSec: null, minSec: null, maxSec: null, buckets: emptyBuckets() };
  }
  const medianSec = (): number | null => {
    if (count === 0) return null;
    const mid = Math.floor(count / 2);
    return count % 2 === 1 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2);
  };
  const buckets = HOLD_BUCKETS.map((b, i) => {
    const lower = i === 0 ? -1 : HOLD_BUCKETS[i - 1].maxSec!; // previous upper bound as exclusive lower
    const inBucket = durations.filter((s) => s >= lower && (b.maxSec == null ? true : s < b.maxSec));
    return { label: b.label, count: inBucket.length, pct: Math.round((inBucket.length / count) * 100) };
  });
  return {
    count,
    avgSec: Math.round(durations.reduce((a, b) => a + b, 0) / count),
    medianSec: medianSec(),
    minSec: durations[0],
    maxSec: durations[count - 1],
    buckets,
  };
}

function emptyBuckets(): { label: string; count: number; pct: number }[] {
  return HOLD_BUCKETS.map((b) => ({ label: b.label, count: 0, pct: 0 }));
}

/** Human-readable duration from seconds ("42s", "3m 12s", "1h 4m"). */
export function formatDurationSec(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export interface EquityPoint {
  i: number; // trade index (0-based)
  time: number; // entry epoch ms
  pnl: number; // cumulative P&L
}

export interface EquityStats {
  points: EquityPoint[];
  totalPnl: number;
  peakPnl: number;
  maxDrawdownPct: number; // % from peak to trough
  currentDrawdownPct: number; // % from peak to last point
}

/**
 * Cumulative equity curve from settled trades (chronological).
 * Drawdown is measured against cumulative NET P&L (peak of the P&L curve), not
 * against deposited capital, so the % saturates at 100 and never reports
 * impossible values like "DD 515%" (which happened when peak P&L was tiny and
 * the net then went negative) — the underlying dollars are still exact.
 */
export function equityCurve(trades: TradeLike[]): EquityStats {
  const settled = trades
    .map((t) => ({ time: toMs(t.entryTime), pnl: Number(t.profitLoss ?? 0) }))
    .filter((t) => t.time != null && Number.isFinite(t.pnl))
    .sort((a, b) => (a.time as number) - (b.time as number));
  let running = 0;
  let peak = 0;
  let maxDD = 0;
  const points: EquityPoint[] = settled.map((t, i) => {
    running += t.pnl;
    peak = Math.max(peak, running);
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
    return { i, time: t.time as number, pnl: Math.round(running * 100) / 100 };
  });
  const last = points.length ? points[points.length - 1].pnl : 0;
  const peakPnl = peak;
  const cdPct = peak > 0 && last < peak ? ((peak - last) / peak) * 100 : 0;
  const currentDrawdownPct = Math.min(100, cdPct);
  const maxDrawdownPct = Math.min(100, Math.round(maxDD * 10) / 10);
  return {
    points,
    totalPnl: last,
    peakPnl: Math.round(peakPnl * 100) / 100,
    maxDrawdownPct,
    currentDrawdownPct: Math.round(currentDrawdownPct * 10) / 10,
  };
}

export interface CalendarDay {
  date: string; // "YYYY-MM-DD"
  pnl: number;
  trades: number;
  intensity: number; // 0..1 (0 = no trades, up to 1 = biggest |pnl| day)
}

/** GitHub-style P&L calendar for the last `months` calendar months. */
export function calendarHeatmap(trades: TradeLike[], months = 12): CalendarDay[] {
  const byDay = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const ms = toMs(t.entryTime);
    if (ms == null || ms > Date.now() + 86400000) continue;
    const pnl = Number(t.profitLoss ?? 0);
    if (!Number.isFinite(pnl)) continue;
    const key = dayKey(ms);
    const day = byDay.get(key) || { pnl: 0, trades: 0 };
    day.pnl += pnl;
    day.trades += 1;
    byDay.set(key, day);
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const endMs = now.getTime();
  const out: CalendarDay[] = [];
  let maxAbs = 1;
  for (let d = new Date(start); d.getTime() <= endMs; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d.getTime());
    const day = byDay.get(key);
    if (day) maxAbs = Math.max(maxAbs, Math.abs(day.pnl));
  }
  for (let d = new Date(start); d.getTime() <= endMs; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d.getTime());
    const day = byDay.get(key);
    out.push({
      date: key,
      pnl: day ? Math.round(day.pnl * 100) / 100 : 0,
      trades: day?.trades ?? 0,
      intensity: day ? Math.min(1, Math.abs(day.pnl) / maxAbs) : 0,
    });
  }
  return out;
}
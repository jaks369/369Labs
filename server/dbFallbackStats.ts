/**
 * Drizzle→raw-SQL fallback observability.
 *
 * db.ts routes most reads through `try { drizzle } catch { rawPool }`. From a
 * static read you cannot tell whether the Drizzle path succeeds normally
 * (fallbacks are rare noise) or fails on EVERY call (every request silently
 * pays for a failed query before the real one runs — a hidden double
 * round-trip across ~46 code paths).
 *
 * This counter answers that with production data instead of guesses:
 * call noteDrizzleFallback("<site>") inside each fallback's catch. Totals are
 * logged at most every 10 minutes per report cycle so the log stays quiet,
 * and exposed programmatically for health endpoints.
 */

const counts = new Map<string, number>();
let lastReported = new Map<string, number>();
const REPORT_INTERVAL_MS = 10 * 60_000;
let lastReportAt = 0;

export function noteDrizzleFallback(site: string): void {
  counts.set(site, (counts.get(site) || 0) + 1);
  maybeReport();
}

function maybeReport(force = false): void {
  const now = Date.now();
  if (!force && now - lastReportAt < REPORT_INTERVAL_MS) return;
  lastReportAt = now;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return;
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([site, n]) => {
      const delta = n - (lastReported.get(site) || 0);
      return `${site}: ${n} total (+${delta})`;
    });
  // Single structured line — greppable, cheap.
  console.warn(`[db-fallback] drizzle->raw fallbacks triggered. ${lines.join("; ")}`);
  lastReported = new Map(counts);
}

export function getDrizzleFallbackCounts(): Record<string, number> {
  return Object.fromEntries(counts.entries());
}

// Report whatever accumulated when the process is shutting down gracefully.
process.on("SIGTERM", () => {
  maybeReport(true);
});

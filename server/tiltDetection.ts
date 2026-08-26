/**
 * Behavioral tilt ("revenge trading") detection.
 *
 * Research basis: Barber & Odean (2000, Journal of Finance) — active retail
 * traders underperform ~6.5%/yr primarily through behavioral mistakes, not
 * strategy selection. The revenge-trading signature is mechanically detectable
 * from ordinary trade logs:
 *
 *   1. RAPID RE-ENTRY    — new position opened minutes after a stop-out,
 *                          far faster than the trader's own normal cadence.
 *   2. SIZE ESCALATION   — stake raised above the trader's typical size
 *                          specifically AFTER losses (not before).
 *   3. FREQUENCY BURST   — trading frequency well above the trader's own
 *                          baseline following a losing stretch.
 *
 * Design policy (matches credible tools in this category): this SURFACES the
 * pattern at the decision point in plain language — it does NOT block. The
 * mechanical version of the same protection already exists server-side
 * (maxConsecutiveLosses floors); this is the human-facing counterpart.
 *
 * Pure functions only — no DB/network. Callers pass recent trades.
 */

export type TiltSeverity = "none" | "watch" | "warning";

export interface TiltTradeInput {
  id: number | string;
  result: string | null; // "win" | "loss" | "pending" | "stuck" | ...
  stake: string | number | null;
  entryTime: Date | string | number;
}

export interface TiltSignals {
  rapidReentry: boolean;
  sizeEscalation: boolean;
  frequencyBurst: boolean;
}

export interface TiltReport {
  detected: boolean;
  severity: TiltSeverity;
  signals: TiltSignals;
  /** Plain-language messages for Concierge/UI. Empty when nothing detected. */
  messages: string[];
  /** Sample sizes backing each verdict, so the UI can show provenance. */
  evidence: {
    tradesAnalyzed: number;
    lossStreakRecent: number;
    medianGapMinutes: number | null;
  };
}

const MIN_TRADES = 8; // below this we know nothing about the trader's baseline
const RAPID_REENTRY_MS = 5 * 60_000; // ≤5 min after a loss counts as "rapid"
const ESCALATION_WINDOW_MS = 30 * 60_000; // post-loss window for sizing checks
const ESCALATION_RATIO = 1.35; // post-loss stake ≥35% above typical
const BURST_MULTIPLIER = 2; // 2× baseline hourly rate
const BURST_BASELINE_HOURS = 24; // baseline window
const BURST_WINDOW_MS = 60 * 60_000; // burst detection window

function ms(v: TiltTradeInput["entryTime"]): number {
  const t = new Date(v as any).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function stakeNum(s: TiltTradeInput["stake"]): number {
  const n = parseFloat(String(s ?? ""));
  return Number.isFinite(n) ? n : NaN;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Detect tilt from a trader's recent history. `trades` may be in any order;
 * only SETTLED trades (win/loss) inform behavior. Trades with unusable
 * timestamps/stakes are skipped, never guessed.
 */
export function detectTilt(rawTrades: TiltTradeInput[], now: number = Date.now()): TiltReport {
  const empty: TiltReport = {
    detected: false,
    severity: "none",
    signals: { rapidReentry: false, sizeEscalation: false, frequencyBurst: false },
    messages: [],
    evidence: { tradesAnalyzed: 0, lossStreakRecent: 0, medianGapMinutes: null },
  };

  const trades = rawTrades
    .filter((t) => t.result === "win" || t.result === "loss")
    .map((t) => ({ ...t, _t: ms(t.entryTime), _stake: stakeNum(t.stake) }))
    .filter((t) => Number.isFinite(t._t) && Number.isFinite(t._stake))
    .sort((a, b) => a._t - b._t);

  if (trades.length < MIN_TRADES) return { ...empty, evidence: { ...empty.evidence, tradesAnalyzed: trades.length } };

  const messages: string[] = [];
  const signals: TiltSignals = { rapidReentry: false, sizeEscalation: false, frequencyBurst: false };

  // --- Baseline cadence: median gap between consecutive entries -------------
  const gaps: number[] = [];
  for (let i = 1; i < trades.length; i++) {
    const g = trades[i]._t - trades[i - 1]._t;
    if (g > 0 && g < 24 * 3600_000) gaps.push(g); // ignore day-scale gaps
  }
  const medianGapMs = median(gaps);
  const evidence = {
    tradesAnalyzed: trades.length,
    lossStreakRecent: 0,
    medianGapMinutes: medianGapMs != null ? Math.round((medianGapMs / 60_000) * 10) / 10 : null,
  };

  // --- Recent loss streak ---------------------------------------------------
  let lossStreak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].result === "loss") lossStreak++;
    else break;
  }
  evidence.lossStreakRecent = lossStreak;

  // --- 1. Rapid re-entry after a loss --------------------------------------
  if (medianGapMs != null && medianGapMs > 3 * RAPID_REENTRY_MS) {
    // Only meaningful if the trader's NORMAL cadence is much slower than the
    // rapid threshold — otherwise fast re-entry IS their style, not tilt.
    for (let i = 1; i < trades.length; i++) {
      const prev = trades[i - 1];
      const cur = trades[i];
      if (prev.result === "loss" && cur._t - prev._t <= RAPID_REENTRY_MS) {
        signals.rapidReentry = true;
        messages.push(
          `Rapid re-entry: a new trade went in ${Math.round((cur._t - prev._t) / 60_000)} min after a loss — your usual pace between trades is about ${evidence.medianGapMinutes} min.`,
        );
        break; // one instance flagged; message cites the clearest case
      }
    }
  }

  // --- 2. Size escalation after losses -------------------------------------
  const typicalStake = median(trades.map((t) => t._stake)) ?? 0;
  if (typicalStake > 0) {
    let escalated = 0;
    let escalatedTotal = 0;
    for (let i = 1; i < trades.length; i++) {
      const prev = trades[i - 1];
      const cur = trades[i];
      if (prev.result === "loss" && cur._t - prev._t <= ESCALATION_WINDOW_MS && cur._stake >= typicalStake * ESCALATION_RATIO) {
        escalated++;
        escalatedTotal += cur._stake;
      }
    }
    if (escalated >= 2) {
      signals.sizeEscalation = true;
      messages.push(
        `Size escalation: ${escalated} trades placed within 30 min of a loss were sized ${Math.round(((escalatedTotal / escalated) / typicalStake - 1) * 100)}% above your usual ${typicalStake} stake.`,
      );
    }
  }

  // --- 3. Frequency burst after losses -------------------------------------
  const baselineCutoff = now - BURST_BASELINE_HOURS * 3600_000;
  const baselineTrades = trades.filter((t) => t._t >= baselineCutoff && t._t <= now - BURST_WINDOW_MS);
  const baselineRate = baselineTrades.length / BURST_BASELINE_HOURS; // trades/hour
  const recentCount = trades.filter((t) => t._t > now - BURST_WINDOW_MS).length;
  if (baselineRate > 0 && recentCount >= Math.max(3, baselineRate * BURST_WINDOW_MS / 3600_000 * BURST_MULTIPLIER)) {
    // Require a losing start to the burst — frequency alone is not tilt.
    const firstRecentLoss = trades.find((t) => t._t > now - BURST_WINDOW_MS && t.result === "loss");
    if (firstRecentLoss) {
      signals.frequencyBurst = true;
      messages.push(
        `Frequency burst: ${recentCount} trades in the last hour vs a baseline of about ${(baselineRate * BURST_WINDOW_MS / 3600_000).toFixed(1)}/hour, starting after a loss.`,
      );
    }
  }

  const fired = Object.values(signals).filter(Boolean).length;
  const severity: TiltSeverity = fired >= 2 || (signals.rapidReentry && lossStreak >= 3) ? "warning" : fired === 1 ? "watch" : "none";

  if (severity === "warning") {
    messages.push("This matches your revenge-loop pattern. The strongest move available right now is usually no move — consider stopping for the session.");
  } else if (severity === "watch") {
    messages.push("Mild tilt markers present. Worth a pause before the next trade.");
  }

  return { detected: fired > 0, severity, signals, messages, evidence };
}

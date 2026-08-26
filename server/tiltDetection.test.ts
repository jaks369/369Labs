import { describe, it, expect } from "vitest";
import { detectTilt, type TiltTradeInput } from "./tiltDetection";

const MIN = 60_000;
let id = 0;
function t(minutesAgo: number, result: "win" | "loss", stake = 10): TiltTradeInput {
  return { id: ++id, result, stake, entryTime: new Date(Date.now() - minutesAgo * MIN) };
}

// A calm trader: ~45 min between trades, flat 10 stake.
function calmTrader(n = 12): TiltTradeInput[] {
  const out: TiltTradeInput[] = [];
  let ago = n * 45 + 60;
  for (let i = 0; i < n; i++) {
    out.push(t(ago, i % 3 === 0 ? "loss" : "win"));
    ago -= 45;
  }
  return out.reverse(); // oldest first is fine — detector sorts
}

describe("detectTilt — behavioral tilt detection", () => {
  it("calm trader with mixed results → no tilt", () => {
    const r = detectTilt(calmTrader());
    expect(r.detected).toBe(false);
    expect(r.severity).toBe("none");
    expect(r.messages).toHaveLength(0);
  });

  it("too little history → no verdict, sample size reported", () => {
    const r = detectTilt([t(30, "win"), t(60, "loss"), t(90, "win")]);
    expect(r.detected).toBe(false);
    expect(r.evidence.tradesAnalyzed).toBeLessThan(8);
  });

  it("rapid re-entry after a loss flags when normal cadence is slow", () => {
    const trades = calmTrader();
    // Latest trade: a loss, then re-entry 2 minutes later (vs ~45 min baseline).
    trades.push(t(4, "loss"));
    trades.push(t(2, "win", 10));
    const r = detectTilt(trades);
    expect(r.signals.rapidReentry).toBe(true);
    expect(r.evidence.medianGapMinutes).toBeGreaterThan(15);
  });

  it("fast-but-consistent traders are NOT flagged for rapid re-entry", () => {
    // Baseline cadence of 3 min means ≤5min re-entry IS their style.
    const trades: TiltTradeInput[] = [];
    let ago = 60;
    for (let i = 0; i < 14; i++) {
      trades.push(t(ago, i % 3 === 0 ? "loss" : "win", 10));
      ago -= 3;
    }
    const r = detectTilt(trades);
    expect(r.signals.rapidReentry).toBe(false);
  });

  it("post-loss size escalation flags after repeated raises", () => {
    const trades = calmTrader(10);
    // Loss then two escalated re-entries within 30 min.
    trades.push(t(50, "loss", 10));
    trades.push(t(20, "loss", 20)); // 2× typical, 30 min window
    trades.push(t(8, "win", 18)); // still elevated
    const r = detectTilt(trades);
    expect(r.signals.sizeEscalation).toBe(true);
  });

  it("frequency burst after a loss flags vs own baseline", () => {
    const trades: TiltTradeInput[] = [];
    // Baseline: one trade every ~50 min across the prior day.
    for (let i = 0; i < 16; i++) trades.push(t(20 * 60 + i * 50, "win", 10));
    // Burst: loss, then 5 quick trades in the last hour.
    trades.push(t(62, "loss", 10));
    for (const m of [40, 28, 17, 9, 3]) trades.push(t(m, "loss", 10));
    const r = detectTilt(trades);
    expect(r.signals.frequencyBurst).toBe(true);
  });

  it("two signals → warning severity with the session-level message", () => {
    const trades = calmTrader();
    trades.push(t(40, "loss"));
    trades.push(t(20, "loss", 20)); // escalation instance 1
    trades.push(t(6, "loss", 18)); // escalation instance 2
    trades.push(t(2, "win", 10)); // rapid re-entry (4 min after loss)
    const r = detectTilt(trades);
    expect(r.signals.sizeEscalation).toBe(true);
    expect(r.signals.rapidReentry).toBe(true);
    expect(r.severity).toBe("warning");
    expect(r.messages.some((m) => /revenge-loop/i.test(m))).toBe(true);
  });

  it("pending/stuck/unparseable rows are ignored, never guessed", () => {
    const trades = calmTrader();
    trades.push({ id: 99, result: "pending", stake: "abc", entryTime: "not-a-date" });
    const r = detectTilt(trades);
    expect(r.detected).toBe(false);
    // Only the 12 settled, parseable rows count as evidence; the pending/garbage row is skipped.
    expect(r.evidence.tradesAnalyzed).toBe(12);
  });
});

import { describe, it, expect } from "vitest";
import {
  suggestStakeInput,
  suggestStakeForSettings,
  winRateOf,
  computeSessionCoach,
  computeSmartAlerts,
  computePreTradeChecklist,
  upcomingCalendarEvents,
  guidingSignalPnl,
} from "./concierge";

describe("concierge pure helpers", () => {
  it("never suggests a stake below the platform minimum", () => {
    expect(suggestStakeInput(0).stake).toBeGreaterThanOrEqual(0.35);
  });

  it("sizes the stake from risk %, not signal confidence", () => {
    const base = suggestStakeInput(470, 1);
    const half = suggestStakeInput(470, 0.5);
    const capped = suggestStakeInput(470, 100); // riskPct clamps to 2%
    expect(base.stake).toBeCloseTo(4.7, 2);
    expect(base.riskPct).toBe(1);
    expect(half.stake).toBeCloseTo(2.35, 2);
    expect(capped.stake).toBeCloseTo(9.4, 2);
    expect(capped.riskPct).toBe(2);
  });

  it("defaults to 2% of the account and caps max at 3× the recommendation", () => {
    const r = suggestStakeInput(470);
    expect(r.riskPct).toBe(2);
    expect(r.stake).toBeCloseTo(9.4, 2); // 2% of 470
    expect(r.maxStake).toBeCloseTo(28.2, 2); // 3 × the 2% recommendation
  });

  it("suggested stake never exceeds a small % of balance", () => {
    const r = suggestStakeInput(470, 1);
    expect(r.stake).toBeLessThanOrEqual(r.maxStake);
    expect(r.stake / 470).toBeLessThanOrEqual(0.05);
    expect(r.maxStake).toBeCloseTo(r.stake * 3, 2);
  });

  it("note makes clear the stake is risk-driven, not confidence-driven", () => {
    const r = suggestStakeInput(470, 1);
    expect(r.note.toLowerCase()).toContain("risk");
  });

  it("absolute stake setting wins over the % baseline when within the risk guard", () => {
    const r = suggestStakeForSettings(1000, { stakePct: 2, stake: 3 });
    expect(r.stake).toBe(3); // user's explicit $3
    expect(r.maxStake).toBe(60); // 3 × 2% of 1000
  });

  it("caps an oversized absolute stake at the risk guard instead of recommending it", () => {
    const r = suggestStakeForSettings(1000, { stakePct: 2, stake: 200 });
    expect(r.stake).toBe(60); // 3 × 2% of 1000
    expect(r.note).toContain("capped");
  });

  it("falls back to the % baseline when no absolute stake is set", () => {
    const r = suggestStakeForSettings(1000, { stakePct: 2, stake: 0 });
    expect(r.stake).toBeCloseTo(20, 2);
  });

  it("never lets a typo drop the stake below the platform minimum", () => {
    const r = suggestStakeForSettings(1000, { stakePct: 2, stake: 0.01 });
    expect(r.stake).toBeGreaterThanOrEqual(0.35);
  });

  it("computes win rate from settled trades only", () => {
    expect(winRateOf(3, 1)).toBe(75);
    expect(winRateOf(0, 0)).toBe(0);
  });

  it("detects a high-volatility loss streak as whipsaw watching", () => {
    const trades = [
      { symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" },
      { symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" },
    ];
    const res = computeSessionCoach({ trades, sessionStartMs: 0, balance: 100, volatilityBySymbol: { R_100: "High" } });
    const messages = res.coachingMessages.map((m) => m.message).join(" ");
    expect(messages.toLowerCase()).toContain("high-volatility");
  });

  it("sends a critical message on a long loss streak", () => {
    const trades = Array.from({ length: 4 }, (_, i) => ({ symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" }));
    const res = computeSessionCoach({ trades, sessionStartMs: 0, balance: 100, volatilityBySymbol: {} });
    expect(res.currentStreak).toBe("Losses");
    expect(res.streakCount).toBe(4);
    expect(res.coachingMessages.some((m) => m.level === "critical")).toBe(true);
  });

  it("coach tells a losing session to cut stake", () => {
    // 2W / 3L, no streak long enough for the critical message, losses > wins.
    const trades = [
      { symbol: "R_100", result: "win", stake: "1", profitLoss: "0.95" },
      { symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" },
      { symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" },
      { symbol: "R_100", result: "win", stake: "1", profitLoss: "0.95" },
      { symbol: "R_100", result: "loss", stake: "1", profitLoss: "-1" },
    ];
    const res = computeSessionCoach({ trades, sessionStartMs: 0, balance: 100, volatilityBySymbol: {} });
    const joined = res.coachingMessages.map((m) => m.message).join(" ");
    expect(joined.toLowerCase()).toContain("struggling");
    expect(joined.toLowerCase()).toContain("stake");
  });

  it("flags critical advisories as critical alerts", () => {
    const alerts = computeSmartAlerts([], [{ symbol: "R_100", riskLevel: "CRITICAL", recommendation: "Stand aside", score: 90, confidence: 90, factors: [], timestamp: 0 } as any]);
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
  });

  it("flags three straight losses on one symbol", () => {
    const trades = [
      { symbol: "R_100", result: "loss" },
      { symbol: "R_100", result: "loss" },
      { symbol: "R_100", result: "loss" },
    ];
    const alerts = computeSmartAlerts(trades, []);
    expect(alerts.some((a) => a.message.includes("3 straight losses"))).toBe(true);
  });

  it("pre-trade checklist uses the 2% risk cap with the 3× max guard", () => {
    const c = computePreTradeChecklist({ symbol: "R_100", stake: 200, balance: 500 });
    expect(c.suggestedStake).toBeCloseTo(10, 2); // 2% of 500
    expect(c.maxStake).toBeCloseTo(30, 2); // 3 × the 2% recommendation
    expect(c.warnings.some((w) => w.includes("exceeds"))).toBe(true);
  });

  it("calendar returns a bounded list", () => {
    const cal = upcomingCalendarEvents(4);
    expect(cal.length).toBeLessThanOrEqual(6);
  });

  it("signal P&L pays the documented payout on a win", () => {
    expect(guidingSignalPnl("win", "2")).toBeCloseTo(1.9, 2);
  });

  it("signal P&L loses the full stake on a loss and refunds a flat tick", () => {
    expect(guidingSignalPnl("loss", "2")).toBe(-2);
    expect(guidingSignalPnl("expired", "2")).toBe(0);
  });

  it("open signals have no P&L until resolved", () => {
    expect(guidingSignalPnl("open", "1")).toBeNull();
    expect(guidingSignalPnl(null, "1")).toBeNull();
  });
});
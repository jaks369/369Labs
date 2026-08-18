import { describe, it, expect } from "vitest";
import {
  suggestStakeInput,
  winRateOf,
  computeSessionCoach,
  computeSmartAlerts,
  computePreTradeChecklist,
  upcomingCalendarEvents,
  guidingSignalPnl,
} from "./concierge";

describe("concierge pure helpers", () => {
  it("never suggests a stake below the platform minimum", () => {
    expect(suggestStakeInput(0, 90).stake).toBeGreaterThanOrEqual(0.35);
  });

  it("caps suggested stake at a small % of balance", () => {
    const r = suggestStakeInput(5000, 100);
    expect(r.stake).toBeLessThanOrEqual(r.maxStake);
    expect(r.maxStake).toBeLessThanOrEqual(250);
  });

  it("scales the stake up with confidence (below the cap)", () => {
    const low = suggestStakeInput(1000, 20).stake;
    const high = suggestStakeInput(1000, 50).stake;
    expect(high).toBeGreaterThan(low);
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

  it("pre-trade checklist warns when stake exceeds the 5% cap", () => {
    const c = computePreTradeChecklist({ symbol: "R_100", stake: 200, balance: 500 });
    expect(c.warnings.some((w) => w.includes("exceeds"))).toBe(true);
    expect(c.suggestedStake).toBeLessThanOrEqual(25);
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
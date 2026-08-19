import { describe, it, expect } from "vitest";
import { dailyTrend, trendSummary, timeInTradeStats, formatDurationSec, equityCurve, calendarHeatmap } from "./portfolio";

function t(entry: string, pnl: number, result: "win" | "loss" | null, exit?: string) {
  return { entryTime: entry, exitTime: exit ?? null, profitLoss: pnl, result };
}

describe("dailyTrend", () => {
  const today = new Date();
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);
  const tenDaysAgo = new Date(today.getTime() - 10 * 86400000);
  const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("returns exactly the rolling window days", () => {
    const trend = dailyTrend([], 30);
    expect(trend.length).toBe(30);
    expect(trend[0].date <= trend[29].date).toBe(true);
  });

  it("buckets trades onto calendar days and sums pnl", () => {
    const trend = dailyTrend([t(twoDaysAgo.toISOString(), 10, "win"), t(twoDaysAgo.toISOString(), -4, "loss"), t(tenDaysAgo.toISOString(), 7, "win")], 30);
    const day = trend.find((d) => d.date === localKey(twoDaysAgo));
    expect(day).toBeDefined();
    expect(day!.pnl).toBe(6);
    expect(day!.trades).toBe(2);
    expect(day!.winRatePct).toBe(50);
  });

  it("ignores malformed or future timestamps", () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString();
    const todayIso = new Date(localKey(today) + "T12:00:00").toISOString();
    const trend = dailyTrend([t("not-a-date", 5, "win"), t(future, 5, "win"), t(todayIso, 5, "win")], 30);
    const todayDay = trend[trend.length - 1];
    expect(todayDay!.pnl).toBe(5);
    expect(todayDay!.trades).toBe(1);
  });
});

describe("trendSummary", () => {
  it("rolls up pnl / trades / win rate", () => {
    const now = new Date();
    const d1 = new Date(now.getTime() - 86400000).toISOString(); // yesterday
    const d2 = now.toISOString(); // today
    const trend = dailyTrend([t(d1, 10, "win"), t(d2, -2, "loss")], 2);
    const s = trendSummary(trend);
    expect(s.pnl).toBe(8);
    expect(s.trades).toBe(2);
    expect(s.winRatePct).toBe(50);
  });
});

describe("timeInTradeStats", () => {
  it("computes avg/median/min/max from entry+exit", () => {
    const stats = timeInTradeStats([
      t("2026-01-01T00:00:00Z", 0, null, "2026-01-01T00:01:00Z"), // 60s
      t("2026-01-01T00:00:00Z", 0, null, "2026-01-01T00:02:00Z"), // 120s
      t("2026-01-01T00:00:00Z", 0, null, "2026-01-01T00:09:00Z"), // 540s
    ]);
    expect(stats.count).toBe(3);
    expect(stats.minSec).toBe(60);
    expect(stats.maxSec).toBe(540);
    expect(stats.avgSec).toBe(240);
    expect(stats.medianSec).toBe(120);
    expect(stats.buckets.find((b) => b.label === "< 1m")!.count).toBe(0);
    expect(stats.buckets.find((b) => b.label === "1-5m")!.count).toBe(2);
    expect(stats.buckets.find((b) => b.label === "5-15m")!.count).toBe(1);
  });

  it("skips missing or inverted timestamps", () => {
    const stats = timeInTradeStats([
      t("2026-01-01T00:00:00Z", 0, null), // no exit
      t("2026-01-01T00:00:00Z", 0, null, "2019-01-01T00:00:00Z"), // exit before entry
    ]);
    expect(stats.count).toBe(0);
    expect(stats.avgSec).toBeNull();
  });

  it("formats durations readably", () => {
    expect(formatDurationSec(42)).toBe("42s");
    expect(formatDurationSec(null)).toBe("—");
    expect(formatDurationSec(192)).toBe("3m 12s");
    expect(formatDurationSec(3840)).toBe("1h 4m");
  });
});

describe("equityCurve", () => {
  it("accumulates pnl chronologically", () => {
    const eq = equityCurve([
      t("2026-01-01T00:00:00Z", 10, "win"),
      t("2026-01-01T00:05:00Z", -4, "loss"),
      t("2026-01-02T00:00:00Z", 7, "win"),
    ]);
    expect(eq.points.map((p) => p.pnl)).toEqual([10, 6, 13]);
    expect(eq.totalPnl).toBe(13);
    expect(eq.peakPnl).toBe(13);
    expect(eq.maxDrawdownPct).toBe(40);
    expect(eq.currentDrawdownPct).toBe(0);
  });

  it("measures drawdown from peak", () => {
    const eq = equityCurve([
      t("2026-01-01T00:00:00Z", 100, "win"),
      t("2026-01-01T00:05:00Z", -50, "loss"),
    ]);
    expect(eq.points.map((p) => p.pnl)).toEqual([100, 50]);
    expect(eq.peakPnl).toBe(100);
    expect(eq.maxDrawdownPct).toBe(50);
    expect(eq.currentDrawdownPct).toBe(50);
  });

  it("sorts out-of-order rows and ignores invalid pnl", () => {
    const eq = equityCurve([
      t("2026-01-02T00:00:00Z", 5, "win"),
      t("not-a-date", 999, "win"),
      t("2026-01-01T00:00:00Z", -5, "loss"),
    ]);
    expect(eq.points.map((p) => p.pnl)).toEqual([-5, 0]);
  });

  it("caps drawdown % at 100 so a tiny peak + deep loss can't read as 515%", () => {
    const eq = equityCurve([
      t("2026-01-01T00:00:00Z", 1, "win"),
      t("2026-01-01T00:05:00Z", -20, "loss"),
    ]);
    expect(eq.points.map((p) => p.pnl)).toEqual([1, -19]);
    expect(eq.peakPnl).toBe(1);
    expect(eq.maxDrawdownPct).toBe(100);
    expect(eq.currentDrawdownPct).toBe(100);
  });

  it("reports 0 drawdown when the net pnl never goes positive", () => {
    const eq = equityCurve([
      t("2026-01-01T00:00:00Z", -5, "loss"),
      t("2026-01-01T00:05:00Z", -3, "loss"),
    ]);
    expect(eq.points.map((p) => p.pnl)).toEqual([-5, -8]);
    expect(eq.peakPnl).toBe(0);
    expect(eq.maxDrawdownPct).toBe(0);
    expect(eq.currentDrawdownPct).toBe(0);
  });
});

describe("calendarHeatmap", () => {
  it("covers the requested month span in order", () => {
    const cal = calendarHeatmap([], 12);
    expect(cal.length).toBeGreaterThan(330);
    expect(cal.length).toBeLessThan(380);
    const first = new Date(cal[0].date);
    const last = new Date(cal[cal.length - 1].date);
    expect(last.getTime()).toBeGreaterThan(first.getTime());
  });

  it("buckets a trade onto its day with intensity", () => {
    const cal = calendarHeatmap([t(new Date().toISOString(), 25, "win")], 12);
    const today = cal[cal.length - 1];
    expect(today.trades).toBe(1);
    expect(today.pnl).toBe(25);
    expect(today.intensity).toBe(1);
  });

  it("normalizes intensity to the largest |pnl| day", () => {
    const now = new Date();
    const day2 = new Date(now.getTime() - 2 * 86400000);
    const cal = calendarHeatmap([t(now.toISOString(), 10, "win"), t(day2.toISOString(), -100, "loss")], 12);
    const today = cal[cal.length - 1];
    expect(today.intensity).toBeCloseTo(0.1, 1);
    expect(today.trades).toBe(1);
  });
});
import { describe, it, expect } from "vitest";
import {
  computeExpectancy,
  computeExcursion,
  summarizeExcursions,
  analyzeSymbols,
  MIN_ANALYTICS_SAMPLE,
} from "./tradeAnalytics";

function makeTrade(overrides: Partial<{ id: number; symbol: string; contractType: string; result: string; stake: number; profitLoss: number | null; entryPrice: number; exitPrice: number | null }> = {}): any {
  return {
    id: overrides.id ?? 1,
    symbol: overrides.symbol ?? "EURUSD",
    contractType: overrides.contractType ?? "CALL",
    result: overrides.result ?? "win",
    stake: overrides.stake ?? 10,
    profitLoss: overrides.profitLoss ?? 8,
    entryPrice: overrides.entryPrice ?? 1.10000,
    exitPrice: overrides.exitPrice ?? 1.10050,
  };
}

describe("computeExpectancy", () => {
  it("returns empty result for no trades", () => {
    const r = computeExpectancy([]);
    expect(r.sampleCount).toBe(0);
    expect(r.sufficient).toBe(false);
  });

  it("returns empty result for un-settled trades", () => {
    const r = computeExpectancy([makeTrade({ result: "open", profitLoss: null })]);
    expect(r.sampleCount).toBe(0);
  });

  it("computes win rate and R-multiple for a small sample", () => {
    const trades = [
      makeTrade({ id: 1, result: "win", profitLoss: 8, stake: 10 }),
      makeTrade({ id: 2, result: "loss", profitLoss: -10, stake: 10 }),
    ];
    const r = computeExpectancy(trades);
    expect(r.sampleCount).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.winRatePct).toBe(50);
    // R: +0.8 and -1.0 → avg -0.10
    expect(r.avgR).toBe(-0.1);
    expect(r.rStats.avgWinR).toBe(0.8);
    expect(r.rStats.avgLossR).toBe(-1);
  });

  it("enforces min sample gate", () => {
    const trades = Array.from({ length: 20 }, () => makeTrade({ result: "win", profitLoss: 8 }));
    const r = computeExpectancy(trades);
    expect(r.sufficient).toBe(false);
    const ok = computeExpectancy([...trades, ...trades.slice(0, 10)]);
    expect(ok.sufficient).toBe(true);
  });

  it("computes profit factor", () => {
    const trades = [
      makeTrade({ result: "win", profitLoss: 20 }),
      makeTrade({ result: "win", profitLoss: 10 }),
      makeTrade({ result: "loss", profitLoss: -10 }),
      makeTrade({ result: "loss", profitLoss: -10 }),
    ];
    const r = computeExpectancy(trades);
    expect(r.profitFactor).toBe(1.5);
  });

  it("handles infinite profit factor when no losses", () => {
    const trades = [makeTrade({ result: "win", profitLoss: 5 })];
    const r = computeExpectancy(trades);
    expect(r.profitFactor).toBe(Infinity);
  });

  it("computes max drawdown in R", () => {
    const trades = [
      makeTrade({ result: "win", profitLoss: 5, stake: 10 }),
      makeTrade({ result: "loss", profitLoss: -10, stake: 10 }),
      makeTrade({ result: "loss", profitLoss: -10, stake: 10 }),
      makeTrade({ result: "win", profitLoss: 8, stake: 10 }),
    ];
    const r = computeExpectancy(trades);
    // R: +0.5, -1.0, -1.0, +0.8 → cumulative: 0.5, -0.5, -1.5, -0.7 → max DD = -1.5
    expect(r.maxDrawdownR).toBe(-1.5);
  });
});

describe("computeExcursion", () => {
  it("returns nulls for insufficient ticks", () => {
    const trade = makeTrade({ exitPrice: 1.10050 });
    const e = computeExcursion(trade, []);
    expect(e.maePrice).toBeNull();
    expect(e.mfePrice).toBeNull();
  });

  it("computes MAE/MFE for a CALL that dipped then rallied", () => {
    const trade = makeTrade({ contractType: "CALL", entryPrice: 100, exitPrice: 102 });
    const ticks = [
      { price: 101, epoch: 1 },
      { price: 99, epoch: 2 },
      { price: 101.5, epoch: 3 },
      { price: 102, epoch: 4 },
      { price: 102, epoch: 5 },
    ];
    const e = computeExcursion(trade, ticks);
    // Adverse: (99-100)/100 = -1%, favorable: (102-100)/100 = 2%
    expect(e.maePrice).toBeCloseTo(-1, 5);
    expect(e.mfePrice).toBeCloseTo(2, 5);
  });

  it("computes MAE/MFE for a PUT", () => {
    const trade = makeTrade({ contractType: "PUT", entryPrice: 100, exitPrice: 98 });
    const ticks = [
      { price: 101, epoch: 1 },
      { price: 99.5, epoch: 2 },
      { price: 97.5, epoch: 3 },
      { price: 98, epoch: 4 },
      { price: 98, epoch: 5 },
    ];
    const e = computeExcursion(trade, ticks);
    // Adverse: (101-100)/100 = +1%, favorable: (97.5-100)/100 = -2.5%
    expect(e.maePrice).toBeCloseTo(-1, 5);
    expect(e.mfePrice).toBeCloseTo(2.5, 5);
  });
});

describe("summarizeExcursions", () => {
  it("returns null below min sample", () => {
    const s = summarizeExcursions([
      { trade: makeTrade(), maePct: -0.1, mfePct: 0.5 },
    ]);
    expect(s).toBeNull();
  });

  it("counts premature exits on winners", () => {
    const excursions = Array.from({ length: 10 }, (_, i) => ({
      trade: makeTrade({ id: i, result: "win", exitPrice: 100.1 }),
      maePct: -0.2,
      mfePct: i % 2 === 0 ? 0.8 : 0.2,
    }));
    const s = summarizeExcursions(excursions)!;
    expect(s).not.toBeNull();
    expect(s.prematureExits).toBe(5); // 5 winners with MFE > 0.3%
  });
});

describe("analyzeSymbols", () => {
  it("groups by symbol and applies gate per symbol", () => {
    const trades = [
      ...Array.from({ length: 10 }, (_, i) => makeTrade({ id: i, symbol: "EURUSD", result: "win", profitLoss: 8 })),
      ...Array.from({ length: 40 }, (_, i) => makeTrade({ id: i + 100, symbol: "GBPUSD", result: "loss", profitLoss: -10 })),
    ];
    const symbols = analyzeSymbols(trades);
    expect(symbols.length).toBe(2);
    const eur = symbols.find((s) => s.symbol === "EURUSD");
    const gbp = symbols.find((s) => s.symbol === "GBPUSD");
    expect(eur!.expectancy.sufficient).toBe(false);
    expect(gbp!.expectancy.sufficient).toBe(true);
  });
});
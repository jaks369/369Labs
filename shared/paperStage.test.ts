import { describe, it, expect } from "vitest";
import {
  evaluatePromotion,
  simulatePaperTrade,
  type PaperTrade,
  type PaperStageConfig,
} from "./paperStage";

function makeTrades(count: number, winRate: number): PaperTrade[] {
  const wins = Math.round(count * winRate);
  return Array.from({ length: count }, (_, i) => ({
    id: `paper_${i}`,
    symbol: "EURUSD",
    prediction: "rise",
    confidence: 65,
    stake: 10,
    result: i < wins ? ("win" as const) : ("loss" as const),
    pnl: i < wins ? 8 : -10,
    timestamp: Date.now() - (count - i) * 1000,
  }));
}

describe("evaluatePromotion", () => {
  it("returns paper status when insufficient trades", () => {
    const trades = makeTrades(10, 0.6);
    const result = evaluatePromotion(trades, { minPaperTrades: 20, minWinRate: 55, minNetProfit: 0, maxPaperTrades: 50 });
    expect(result.status).toBe("paper");
    expect(result.tradesCompleted).toBe(10);
    expect(result.reason).toContain("10 more");
  });

  it("promotes when all criteria met", () => {
    const trades = makeTrades(25, 0.65); // 65% win rate, 25 trades
    const result = evaluatePromotion(trades, { minPaperTrades: 20, minWinRate: 55, minNetProfit: 0, maxPaperTrades: 50 });
    expect(result.status).toBe("promoted");
    expect(result.winRate).toBeCloseTo(64, 0);
  });

  it("rejects when win rate too low", () => {
    const trades = makeTrades(25, 0.4); // 40% win rate
    const result = evaluatePromotion(trades, { minPaperTrades: 20, minWinRate: 55, minNetProfit: 0, maxPaperTrades: 50 });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("Win rate");
  });

  it("rejects when net profit too low", () => {
    const trades = makeTrades(25, 0.6); // 60% win rate but small profit
    const result = evaluatePromotion(trades, { minPaperTrades: 20, minWinRate: 55, minNetProfit: 100, maxPaperTrades: 50 });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("Net profit");
  });

  it("rejects when max paper trades exceeded", () => {
    const trades = makeTrades(55, 0.6);
    const result = evaluatePromotion(trades, { minPaperTrades: 20, minWinRate: 55, minNetProfit: 0, maxPaperTrades: 50 });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("Exceeded max");
  });
});

describe("simulatePaperTrade", () => {
  it("produces valid paper trade", () => {
    const trade = simulatePaperTrade("EURUSD", "rise", 70, 0.3);
    expect(trade.symbol).toBe("EURUSD");
    expect(trade.prediction).toBe("rise");
    expect(trade.confidence).toBe(70);
    expect(["win", "loss"]).toContain(trade.result);
    expect(typeof trade.pnl).toBe("number");
  });

  it("higher confidence tends to win more", () => {
    const wins90 = Array.from({ length: 100 }, () => simulatePaperTrade("EURUSD", "rise", 90, 0.5)).filter((t) => t.result === "win").length;
    const wins50 = Array.from({ length: 100 }, () => simulatePaperTrade("EURUSD", "rise", 50, 0.5)).filter((t) => t.result === "win").length;
    expect(wins90).toBeGreaterThan(wins50);
  });
});

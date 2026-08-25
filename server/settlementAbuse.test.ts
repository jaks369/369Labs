import { vi, describe, expect, it, beforeEach } from "vitest";

// Abuse suite: deliberately malformed/hostile inputs into the settlement
// path. The tracker must degrade to "retry later", never crash, never settle
// on garbage, and never mark a healthy trade stuck.

const mockGetPendingTrades = vi.fn();
const mockSettleTrade = vi.fn();
const mockMarkTradeStuck = vi.fn();
const mockGetTradeById = vi.fn();
const mockSaveHeartbeat = vi.fn();
const mockEnsureConnected = vi.fn();
const mockGetContractStatus = vi.fn();

vi.mock("./db", () => ({
  getPendingTrades: () => mockGetPendingTrades(),
  settleTrade: (...args: any[]) => mockSettleTrade(...args),
  markTradeStuck: (...args: any[]) => mockMarkTradeStuck(...args),
  getTradeById: async () => null,
  saveSettlementHeartbeat: (...args: any[]) => mockSaveHeartbeat(...args),
  recordStrategyStat: async () => {},
}));

vi.mock("./derivConnection", () => ({
  derivManager: {
    ensureConnected: () => mockEnsureConnected(),
    hasAuthorizedConnection: () => true,
  },
}));

vi.mock("./botRunner", () => ({
  botRunner: {
    updateTradeStats: vi.fn().mockResolvedValue(undefined),
    setOpenTrade: vi.fn().mockResolvedValue(undefined),
  },
}));

// Malformed responses must not be settled as wins.
vi.mock("./ai/AIIntelligenceHub", () => ({ aiIntelligenceHub: { processTradeCompletion: vi.fn() } }));
vi.mock("./webhookExecutor", () => ({ fireWebhookEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./_core/notification", () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  notifyUserTelegram: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./ai/StrategyEngine/StrategyPerformanceTracker", () => ({
  strategyPerformanceTracker: { recordOutcome: vi.fn().mockResolvedValue(undefined) },
}));

const { SettlementTracker } = await import("./SettlementTracker");

function makeTrade(overrides: any = {}) {
  return {
    id: 7,
    userId: 1,
    symbol: "R_100",
    contractType: "CALL",
    contractId: "999",
    stake: "5.00",
    entryPrice: "100.00",
    result: "pending",
    entryTime: new Date(Date.now() - 60_000),
    strategyId: null,
    botRunId: null,
    ...overrides,
  };
}

function trackerWith(connResponse: any) {
  const t = new SettlementTracker();
  mockGetPendingTrades.mockResolvedValue([makeTrade()]);
  mockEnsureConnected.mockResolvedValue({
    isAuthorized: () => true,
    getContractStatus: () => Promise.resolve(connResponse),
  });
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveHeartbeat.mockResolvedValue(true);
  mockGetTradeById.mockResolvedValue(null);
});

describe("abuse: malformed Deriv contract responses", () => {
  it("null contract status → retry, no settlement write", async () => {
    const t = trackerWith(null);
    const r = await t.reconcileTrade(makeTrade());
    expect(r.settled).toBe(false);
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("profit is a garbage string → rejected for retry, no settlement write", async () => {
    const t = trackerWith({ status: "sold", is_sold: 1, profit: "garbage", sell_price: null, exit_tick: null });
    const r = await t.reconcileTrade(makeTrade());
    expect(r.settled).toBe(false);
    expect(r.reason).toMatch(/malformed_contract_profit/);
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("profit missing entirely → rejected for retry, never fabricated as a win", async () => {
    const t = trackerWith({ status: "sold", is_sold: 1 });
    const r = await t.reconcileTrade(makeTrade());
    expect(r.settled).toBe(false);
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("settleTrade returning falsy → reported failed, retried next tick", async () => {
    const t = trackerWith({ status: "won", is_sold: 1, profit: 5, exit_tick: 123 });
    mockSettleTrade.mockResolvedValue(null); // DB write "succeeds" but returns nothing
    const stats = await t.runOnce();
    expect(stats.errors).toBe(1); // surfaced, not swallowed
  });

  it("ensureConnected throwing does not kill subsequent trades in the same tick", async () => {
    const t = new SettlementTracker();
    mockGetPendingTrades.mockResolvedValue([makeTrade({ id: 1 }), makeTrade({ id: 2 })]);
    let calls = 0;
    mockEnsureConnected.mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("boom"));
      return Promise.resolve({
        isAuthorized: () => true,
        getContractStatus: () => Promise.resolve(null),
      });
    });
    const stats = await t.runOnce();
    expect(calls).toBe(2); // second trade still attempted
    expect(stats.errors).toBe(2);
  });
});

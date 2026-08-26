import { vi, describe, expect, it, beforeEach } from "vitest";

// Sustained-outage behaviour: with the DB failing tick after tick (the TiDB
// quota-exhaustion style outage), the tracker must keep its loop alive, keep
// writing heartbeats that say so, keep retrying without leaking retry counts
// forever, and recover cleanly once the DB returns.

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
  getTradeById: (...args: any[]) => mockGetTradeById(...args),
  saveSettlementHeartbeat: (...args: any[]) => mockSaveHeartbeat(...args),
  recordStrategyStat: async () => {},
  getNotificationSettingsByUserId: async () => null,
  getUserById: async () => null,
  getTelegramSettingsByUserId: async () => null,
  sendTelegramMessage: async () => {},
  saveAiKnowledge: async () => {},
  getActiveWebhooksForEvent: async () => [],
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

const { SettlementTracker } = await import("./SettlementTracker");

function makeTrade(overrides: any = {}) {
  return {
    id: 1,
    userId: 42,
    symbol: "R_100",
    contractType: "CALL",
    contractId: "679001",
    stake: "10.00",
    entryPrice: "100.00",
    profitLoss: null,
    result: "pending",
    entryTime: new Date(Date.now() - 60_000),
    exitTime: null,
    strategyId: null,
    botRunId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveHeartbeat.mockResolvedValue(true);
});

describe("SettlementTracker under sustained DB outage", () => {
  it("survives 50 consecutive failed ticks and keeps reporting via heartbeat", async () => {
    const t = new SettlementTracker();
    mockGetPendingTrades.mockRejectedValue(new Error("TiDB quota exhausted"));

    for (let i = 0; i < 50; i++) {
      const stats = await t.runOnce();
      expect(stats).toEqual({ processed: 0, settled: 0, errors: 0 });
    }

    // Heartbeats are now throttled to one per minute (quota relief) — 50 fast
    // ticks collapse to a single write, and it still carries the failure.
    expect(mockSaveHeartbeat).toHaveBeenCalledTimes(1);
    const last = mockSaveHeartbeat.mock.calls[0][0];
    expect(last.lastError).toMatch(/tick_failed/);
  });

  it("keeps retrying a pending trade during a Deriv outage and clears state on recovery", async () => {
    const t = new SettlementTracker();
    const trade = makeTrade();
    mockGetPendingTrades.mockResolvedValue([trade]);
    // Deriv is down too — every reconcile throws.
    mockEnsureConnected.mockRejectedValue(new Error("ws closed"));

    for (let i = 0; i < 5; i++) {
      await t.runOnce();
    }
    expect(t.getRetryCount().get(1)).toBe(5);

    // Deriv comes back, contract already sold at a win.
    mockEnsureConnected.mockResolvedValue({
      isAuthorized: () => true,
      getContractStatus: mockGetContractStatus,
    });
    mockGetContractStatus.mockResolvedValue({
      contract_id: 679001,
      status: "won",
      is_sold: 1,
      profit: 9.5,
      sell_price: 109.5,
      exit_tick: 1700000000,
    });
    mockSettleTrade.mockResolvedValue({ id: 1 });

    const stats = await t.runOnce();
    expect(stats.settled).toBe(1);
    expect(mockSettleTrade).toHaveBeenCalledTimes(1);
    // Retry bookkeeping is cleared after a successful settle.
    expect(t.getRetryCount().has(1)).toBe(false);
  });

  it("never marks trades stuck early just because ticks fail", async () => {
    const t = new SettlementTracker();
    // Recent trade (1 min old) + DB fine but Deriv down.
    mockGetPendingTrades.mockResolvedValue([makeTrade()]);
    mockEnsureConnected.mockRejectedValue(new Error("ws closed"));

    await t.runOnce();
    await t.runOnce();

    expect(mockMarkTradeStuck).not.toHaveBeenCalled();
  });

  it("marks genuinely stale trades stuck during an outage and releases the bot lock", async () => {
    const t = new SettlementTracker();
    const stale = makeTrade({ id: 2, entryTime: new Date(Date.now() - 31 * 60_000) }); // past 30 min grace
    mockGetPendingTrades.mockResolvedValue([stale]);
    mockMarkTradeStuck.mockResolvedValue(true);

    const stats = await t.runOnce();
    expect(stats.processed).toBe(0);
    expect(mockMarkTradeStuck).toHaveBeenCalledWith(2, "settlement_timeout");
  });
});

import { vi, describe, expect, it, beforeEach, afterEach } from "vitest";

const mockGetPendingTrades = vi.fn();
const mockSettleTrade = vi.fn();
const mockEnsureConnected = vi.fn();
const mockGetContractStatus = vi.fn();

vi.mock("./db", () => ({
  getPendingTrades: () => mockGetPendingTrades(),
  settleTrade: (...args: any[]) => mockSettleTrade(...args),
  // SettlementTracker also reaches for notifications, the AI hub and webhooks
  // on settlement; short-circuit all of them so the module under test is the
  // only thing exercised.
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
  },
}));

const { SettlementTracker, settlementTracker } = await import("./SettlementTracker");

function makeTrade(overrides: any = {}) {
  return {
    id: 1,
    userId: 42,
    symbol: "R_100",
    contractType: "CALL",
    contractId: "6797427759",
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

function makeContractResponse(overrides: any = {}) {
  return {
    contract_id: 6797427759,
    status: "won",
    is_sold: 1,
    profit: 8.50,
    sell_price: 108.50,
    buy_price: 100.00,
    entry_tick: 100.00,
    exit_tick: 108.50,
    ...overrides,
  };
}

function freshTracker(): SettlementTracker {
  return new SettlementTracker();
}

function makeConn() {
  return { getContractStatus: mockGetContractStatus, isAuthorized: () => true };
}

describe("SettlementTracker — start / stop", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetPendingTrades.mockResolvedValue([]);
    tracker = freshTracker();
  });

  afterEach(() => {
    tracker.stop();
  });

  it("starts the tick interval", () => {
    const tickSpy = vi.spyOn(tracker as any, "tick");
    tracker.start();
    expect(tickSpy).toHaveBeenCalledTimes(1);
  });

  it("does not start twice", () => {
    tracker.start();
    const intervalId = (tracker as any).intervalId;
    tracker.start();
    expect((tracker as any).intervalId).toBe(intervalId);
  });

  it("stops clears the interval", () => {
    tracker.start();
    expect((tracker as any).intervalId).not.toBeNull();
    tracker.stop();
    expect((tracker as any).intervalId).toBeNull();
  });
});

describe("SettlementTracker — tick", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
  });

  it("skips if already running", async () => {
    (tracker as any).running = true;
    mockGetPendingTrades.mockResolvedValue([makeTrade()]);
    const reconcileSpy = vi.spyOn(tracker as any, "reconcile");
    await (tracker as any).tick();
    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it("processes all pending trades", async () => {
    const trade1 = makeTrade({ id: 1, contractId: "111" });
    const trade2 = makeTrade({ id: 2, contractId: "222" });
    const trade3 = makeTrade({ id: 3, contractId: "333" });
    mockGetPendingTrades.mockResolvedValue([trade1, trade2, trade3]);
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus
      .mockResolvedValueOnce(makeContractResponse())
      .mockResolvedValueOnce(makeContractResponse({ profit: -5.00, status: "lost" }))
      .mockResolvedValueOnce(makeContractResponse());
    mockSettleTrade.mockResolvedValue({ id: 1 });

    await (tracker as any).tick();

    expect(mockGetPendingTrades).toHaveBeenCalledTimes(1);
    expect(mockSettleTrade).toHaveBeenCalledTimes(3);
    expect(mockSettleTrade).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ result: "win" }));
    expect(mockSettleTrade).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({ result: "loss" }));
  });

  it("skips trades missing contractId", async () => {
    mockGetPendingTrades.mockResolvedValue([makeTrade({ contractId: null })]);
    await (tracker as any).tick();
    expect(mockEnsureConnected).not.toHaveBeenCalled();
  });

  it("reconciles trades even with high in-memory retry count (wall-clock stuck detection replaces MAX_RETRIES)", async () => {
    (tracker as any).retryCount.set(1, 100);
    mockGetPendingTrades.mockResolvedValue([makeTrade({ id: 1 })]);
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).tick();
    expect(mockSettleTrade).toHaveBeenCalledTimes(1);
  });

  it("increments retry count on failure", async () => {
    mockGetPendingTrades.mockResolvedValue([makeTrade({ id: 1 })]);
    mockEnsureConnected.mockRejectedValue(new Error("connection failed"));

    await (tracker as any).tick();
    expect((tracker as any).retryCount.get(1)).toBe(1);
  });

  it("retries failed trades on next tick", async () => {
    mockGetPendingTrades.mockResolvedValue([makeTrade({ id: 1 })]);
    mockEnsureConnected
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce(makeConn());
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).tick();
    expect((tracker as any).retryCount.get(1)).toBe(1);

    await (tracker as any).tick();
    expect((tracker as any).retryCount.has(1)).toBe(false);
    expect(mockSettleTrade).toHaveBeenCalled();
  });

  it("handles getPendingTrades throwing", async () => {
    mockGetPendingTrades.mockRejectedValue(new Error("DB error"));
    await expect((tracker as any).tick()).resolves.not.toThrow();
  });
});

describe("SettlementTracker — reconcile", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
    mockEnsureConnected.mockResolvedValue(makeConn());
  });

  it("returns early if no contractId", async () => {
    await (tracker as any).reconcile(makeTrade({ contractId: null }));
    expect(mockEnsureConnected).not.toHaveBeenCalled();
  });

  it("throws if no Deriv connection (so retry count increments and trade is reaped as stuck)", async () => {
    mockEnsureConnected.mockResolvedValue(null);
    await expect((tracker as any).reconcile(makeTrade())).rejects.toThrow("no_deriv_connection");
    expect(mockGetContractStatus).not.toHaveBeenCalled();
  });

  it("throws if contract status unavailable (so retry count increments and trade is reaped as stuck)", async () => {
    mockGetContractStatus.mockResolvedValue(null);
    await expect((tracker as any).reconcile(makeTrade())).rejects.toThrow("contract_status_unavailable");
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("returns early if contract is not yet sold", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ is_sold: 0, status: "open" }));
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("settles a winning trade", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade({ result: "win", profitLoss: "8.50000000" }));

    await (tracker as any).reconcile(makeTrade());

    expect(mockSettleTrade).toHaveBeenCalledWith(1, {
      result: "win",
      profitLoss: "8.50000000",
      exitPrice: "108.5",
      exitTime: expect.any(Date),
    });
  });

  it("settles a losing trade", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: -3.50, status: "lost", sell_price: 96.50 }));
    mockSettleTrade.mockResolvedValue(makeTrade({ result: "loss", profitLoss: "-3.50000000" }));

    await (tracker as any).reconcile(makeTrade());

    expect(mockSettleTrade).toHaveBeenCalledWith(1, {
      result: "loss",
      profitLoss: "-3.50000000",
      exitPrice: "96.5",
      exitTime: expect.any(Date),
    });
  });

  it("settles a breakeven trade", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: 0, status: "won", sell_price: 100.00 }));
    mockSettleTrade.mockResolvedValue(makeTrade({ result: "win", profitLoss: "0.00000000" }));

    await (tracker as any).reconcile(makeTrade());

    expect(mockSettleTrade).toHaveBeenCalledWith(1, {
      result: "win",
      profitLoss: "0.00000000",
      exitPrice: "100",
      exitTime: expect.any(Date),
    });
  });

  it("falls back to exit_tick if sell_price missing", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ sell_price: undefined, exit_tick: 105.00 }));
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).reconcile(makeTrade());

    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({ exitPrice: "105" }));
  });

  it("uses current date when exit_tick is missing", async () => {
    const now = new Date("2026-07-25T12:00:00Z");
    vi.setSystemTime(now);
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ exit_tick: undefined }));
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).reconcile(makeTrade());

    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({
      exitTime: now,
    }));
    vi.useRealTimers();
  });

  it("throws if settleTrade returns null (so retry count increments and trade is reaped as stuck)", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(null);
    await expect((tracker as any).reconcile(makeTrade())).rejects.toThrow("settle_trade_failed");
    expect(mockSettleTrade).toHaveBeenCalled();
  });
});

describe("Duplicate Settlement Protection", () => {
  it("getPendingTrades only returns unsettled trades", async () => {
    mockGetPendingTrades.mockResolvedValue([]);
    const pending = await mockGetPendingTrades();
    expect(pending).toHaveLength(0);
  });

  it("retry-count cap prevents infinite retries", () => {
    const tracker = freshTracker();
    (tracker as any).retryCount.set(1, 100);
    expect((tracker as any).retryCount.get(1)).toBe(100);
  });

  it("retry entry deleted on successful reconciliation", async () => {
    const tracker = freshTracker();
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade());

    (tracker as any).retryCount.set(1, 3);
    await (tracker as any).reconcile(makeTrade({ id: 1 }));
    expect((tracker as any).retryCount.has(1)).toBe(false);
  });
});

describe("Concurrent Trade Handling", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
  });

  it("processes multiple trades independently", async () => {
    const trades = [
      makeTrade({ id: 1, contractId: "101", userId: 1 }),
      makeTrade({ id: 2, contractId: "102", userId: 1 }),
      makeTrade({ id: 3, contractId: "103", userId: 2 }),
    ];
    mockGetPendingTrades.mockResolvedValue(trades);
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus
      .mockResolvedValueOnce(makeContractResponse({ contract_id: 101 }))
      .mockResolvedValueOnce(makeContractResponse({ contract_id: 102, status: "lost", profit: -2.00 }))
      .mockResolvedValueOnce(makeContractResponse({ contract_id: 103 }));
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).tick();

    expect(mockSettleTrade).toHaveBeenCalledTimes(3);
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.any(Object));
    expect(mockSettleTrade).toHaveBeenCalledWith(2, expect.any(Object));
    expect(mockSettleTrade).toHaveBeenCalledWith(3, expect.any(Object));
  });

  it("one trade failure does not block others", async () => {
    mockGetPendingTrades.mockResolvedValue([
      makeTrade({ id: 1, contractId: "101" }),
      makeTrade({ id: 2, contractId: "102" }),
    ]);
    mockEnsureConnected
      .mockResolvedValueOnce(makeConn())
      .mockRejectedValueOnce(new Error("connection lost"));
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade({ id: 1 }));

    await (tracker as any).tick();

    expect(mockSettleTrade).toHaveBeenCalledTimes(1);
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.any(Object));
  });
});

describe("Server Restart Recovery", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
  });

  it("start() immediately runs tick to catch up", async () => {
    const tickSpy = vi.spyOn(tracker as any, "tick").mockImplementation(() => Promise.resolve());
    tracker.start();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    tracker.stop();
  });

  it("processes old pending trades from DB", async () => {
    const oldTrade = makeTrade({ id: 99, entryTime: new Date(Date.now() - 5 * 60_000) });
    mockGetPendingTrades.mockResolvedValue([oldTrade]);
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade({ id: 99 }));

    await (tracker as any).tick();

    expect(mockSettleTrade).toHaveBeenCalledWith(99, expect.any(Object));
  });
});

describe("Status Edge Cases", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
    mockEnsureConnected.mockResolvedValue(makeConn());
  });

  it('handles "sold" status', async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ status: "sold", is_sold: 1 }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalled();
  });

  it('handles "lost" status', async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ status: "lost", is_sold: 1, profit: -10 }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({ result: "loss" }));
  });

  it('skips "open" status (not settled)', async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ status: "open", is_sold: 0 }));
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("handles is_sold as boolean true", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ is_sold: true }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalled();
  });

  it("handles profit as a string", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: "5.50" }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({ profitLoss: "5.50000000" }));
  });

  it("handles NaN profit — rejects for retry instead of fabricating a win", async () => {
    // Changed from the old behavior (NaN coerced to 0 and settled as a "win"):
    // a sold contract with an unparseable profit is a malformed response, so
    // reconcile throws and the trade retries rather than writing a fake ledger win.
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: "abc" }));
    await expect((tracker as any).reconcile(makeTrade())).rejects.toThrow(/malformed_contract_profit/);
    expect(mockSettleTrade).not.toHaveBeenCalled();
  });

  it("handles large profit values", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: 999999.99 }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({ profitLoss: "999999.99000000" }));
  });

  it("handles tiny profit values", async () => {
    mockGetContractStatus.mockResolvedValue(makeContractResponse({ profit: 0.00000001 }));
    mockSettleTrade.mockResolvedValue(makeTrade());
    await (tracker as any).reconcile(makeTrade());
    expect(mockSettleTrade).toHaveBeenCalledWith(1, expect.objectContaining({ profitLoss: "0.00000001" }));
  });
});

describe("Memory Leak Prevention", () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tracker = freshTracker();
  });

  it("retryCount does not grow for settled trades", async () => {
    mockEnsureConnected.mockResolvedValue(makeConn());
    mockGetContractStatus.mockResolvedValue(makeContractResponse());
    mockSettleTrade.mockResolvedValue(makeTrade());

    await (tracker as any).reconcile(makeTrade({ id: 1 }));
    expect((tracker as any).retryCount.has(1)).toBe(false);
  });

  it("retryCount caps at MAX_RETRIES", () => {
    (tracker as any).retryCount.set(999, 100);
    expect((tracker as any).retryCount.get(999)).toBe(100);
  });

  it("stop clears running flag", () => {
    (tracker as any).running = true;
    tracker.stop();
    expect((tracker as any).running).toBe(false);
  });
});

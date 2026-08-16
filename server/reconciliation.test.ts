import { vi, describe, expect, it, beforeEach, afterEach } from "vitest";

const mockEnsureConnected = vi.fn();
const mockGetPortfolio = vi.fn();
const mockGetPendingTradesForUser = vi.fn();
const mockGetTradeByContractId = vi.fn();
const mockMarkTradeStuck = vi.fn();
const mockSettleTrade = vi.fn();
const mockReconstructTradeFromContract = vi.fn();
const mockGetUsersWithActiveTokens = vi.fn();
const mockLogReconcilerRun = vi.fn();
const mockDerivManager = { ensureConnected: (...a: any[]) => mockEnsureConnected(...a) };

vi.mock("./derivConnection", () => ({ derivManager: mockDerivManager }));
vi.mock("./db", () => ({
  getPendingTradesForUser: (...a: any[]) => mockGetPendingTradesForUser(...a),
  getTradeByContractId: (...a: any[]) => mockGetTradeByContractId(...a),
  markTradeStuck: (...a: any[]) => mockMarkTradeStuck(...a),
  settleTrade: (...a: any[]) => mockSettleTrade(...a),
  reconstructTradeFromContract: (...a: any[]) => mockReconstructTradeFromContract(...a),
  getUsersWithActiveTokens: (...a: any[]) => mockGetUsersWithActiveTokens(...a),
  logReconcilerRun: (...a: any[]) => mockLogReconcilerRun(...a),
}));

const { reconcileUser, runFullSweep } = await import("./reconciliation");

const OLD_ENTRY = new Date(Date.now() - 40 * 60 * 1000); // past the 30-min grace
const FRESH_ENTRY = new Date(Date.now() - 60_000); // within grace

function makePending(overrides: any = {}) {
  return {
    id: 100,
    userId: 42,
    symbol: "R_100",
    contractType: "CALL",
    contractId: "6797427759",
    stake: "10.00",
    entryPrice: "100.00",
    profitLoss: null,
    result: "pending",
    entryTime: OLD_ENTRY,
    exitTime: null,
    strategyId: null,
    botRunId: null,
    ...overrides,
  };
}

function makePortfolio(overrides: any = {}) {
  return {
    contractId: 6797427759,
    contractType: "CALL",
    symbol: "R_100",
    stake: 10,
    entryPrice: 100,
    purchasedAt: Math.floor(Date.now() / 1000) - 3600,
    isSold: false,
    profit: 0,
    soldAt: null,
    ...overrides,
  };
}

describe("reconcileUser — classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsersWithActiveTokens.mockResolvedValue([42, 43]);
    mockGetPendingTradesForUser.mockResolvedValue([]);
    mockGetTradeByContractId.mockResolvedValue(undefined);
    mockEnsureConnected.mockResolvedValue({ getPortfolio: () => mockGetPortfolio() });
  });

  it("returns skippedNoToken when no token/connection exists", async () => {
    mockEnsureConnected.mockResolvedValue(null);
    const c = await reconcileUser(42, true);
    expect(c.skippedNoToken).toBe(1);
    expect(mockGetPortfolio).not.toHaveBeenCalled();
  });

  it("counts an error (not a crash) when the portfolio read fails", async () => {
    mockGetPortfolio.mockRejectedValue(new Error("Deriv down"));
    const c = await reconcileUser(42, true);
    expect(c.errors).toBe(1);
  });

  describe("A — DB pending row + Deriv knows the contract", () => {
    it("settles a sold contract (win) with the same fields the tracker would write", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending()]);
      mockGetPortfolio.mockResolvedValue([
        makePortfolio({ isSold: true, profit: 8.5, soldAt: Math.floor(Date.now() / 1000) }),
      ]);
      mockSettleTrade.mockResolvedValue({ ...makePending(), result: "win", profitLoss: "8.50000000" });
      const c = await reconcileUser(42, false);
      expect(c.settled).toBe(1);
      expect(mockSettleTrade).toHaveBeenCalledWith(100, expect.objectContaining({
        result: "win",
        profitLoss: "8.50000000",
      }));
    });

    it("leaves an open (not sold) contract for the tracker — pendingMatched", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending()]);
      mockGetPortfolio.mockResolvedValue([makePortfolio({ isSold: false })]);
      const c = await reconcileUser(42, false);
      expect(c.pendingMatched).toBe(1);
      expect(mockSettleTrade).not.toHaveBeenCalled();
    });

    it("dry-run counts the settle without writing", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending()]);
      mockGetPortfolio.mockResolvedValue([makePortfolio({ isSold: true, profit: -10 })]);
      const c = await reconcileUser(42, true);
      expect(c.settled).toBe(1);
      expect(mockSettleTrade).not.toHaveBeenCalled();
    });
  });

  describe("C — DB pending row but Deriv reports nothing", () => {
    it("marks stuck only past the grace period (entry old)", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending()]);
      mockGetPortfolio.mockResolvedValue([]);
      mockMarkTradeStuck.mockResolvedValue(true);
      const c = await reconcileUser(42, false);
      expect(c.stuck).toBe(1);
      expect(mockMarkTradeStuck).toHaveBeenCalledWith(100, "contract_not_found");
    });

    it("never marks stuck within the propagation grace period", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending({ entryTime: FRESH_ENTRY })]);
      mockGetPortfolio.mockResolvedValue([]);
      const c = await reconcileUser(42, false);
      expect(c.stuck).toBe(0);
      expect(c.pendingMatched).toBe(1);
      expect(mockMarkTradeStuck).not.toHaveBeenCalled();
    });

    it("dry-run reports the stuck candidate without writing", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([makePending()]);
      mockGetPortfolio.mockResolvedValue([]);
      const c = await reconcileUser(42, true);
      expect(c.stuck).toBe(1);
      expect(mockMarkTradeStuck).not.toHaveBeenCalled();
    });
  });

  describe("B — Deriv has a contract with no DB row (orphan)", () => {
    it("reconstructs a pending row (write mode)", async () => {
      mockGetPortfolio.mockResolvedValue([
        makePortfolio({ contractId: 9876543210, purchasedAt: Math.floor(Date.now() / 1000) }),
      ]);
      mockReconstructTradeFromContract.mockResolvedValue({ trade: { id: 999 }, existed: false });
      const c = await reconcileUser(42, false);
      expect(c.reconstructed).toBe(1);
      expect(mockReconstructTradeFromContract).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ contractId: 9876543210, source: "reconcile" }),
      );
    });

    it("does not reconstruct if a row already exists (settled, not an orphan)", async () => {
      mockGetPortfolio.mockResolvedValue([makePortfolio({ contractId: 1111111111, isSold: true })]);
      mockGetTradeByContractId.mockResolvedValue({ ...makePending(), id: 55, result: "win" });
      const c = await reconcileUser(42, false);
      expect(c.reconstructed).toBe(0);
      expect(mockReconstructTradeFromContract).not.toHaveBeenCalled();
    });

    it("settles an existing-but-still-pending row the A loop missed (index skew)", async () => {
      mockGetPendingTradesForUser.mockResolvedValue([]);
      mockGetPortfolio.mockResolvedValue([makePortfolio({ isSold: true, profit: 2 })]);
      mockGetTradeByContractId.mockResolvedValue(makePending({ id: 55 }));
      mockSettleTrade.mockResolvedValue({ ...makePending(), id: 55, result: "win" });
      const c = await reconcileUser(42, false);
      expect(c.settled).toBe(1);
    });
  });
});

describe("runFullSweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureConnected.mockResolvedValue({ getPortfolio: () => mockGetPortfolio() });
    mockGetPortfolio.mockResolvedValue([]);
    mockGetPendingTradesForUser.mockResolvedValue([]);
    mockGetUsersWithActiveTokens.mockResolvedValue([1, 2]);
    mockLogReconcilerRun.mockResolvedValue(undefined);
  });

  it("aggregates counts across users and logs a reconciler run", async () => {
    const dry = await runFullSweep({ dryRun: true });
    expect(dry.reconstructed).toBe(0);
    expect(dry.settled).toBe(0);
    expect(mockLogReconcilerRun).toHaveBeenCalledTimes(1);
    expect(mockGetUsersWithActiveTokens).toHaveBeenCalledTimes(1);
  });

  it("round-robins the cursor so users > batch size still get covered", async () => {
    const many = Array.from({ length: 120 }, (_, i) => i + 1);
    mockGetUsersWithActiveTokens.mockResolvedValue(many);
    const { getSweepCursor } = await import("./reconciliation");
    await runFullSweep({ dryRun: true });
    // Batch 1 covers [0..50), cursor advances to 50.
    expect(getSweepCursor()).toBe(50);
    await runFullSweep({ dryRun: true });
    expect(getSweepCursor()).toBe(100);
    await runFullSweep({ dryRun: true });
    // 150 % 120 = 30 — wraps to 30, and this window covers user 101..120.
    expect(getSweepCursor()).toBe(30);
    expect(mockGetUsersWithActiveTokens).toHaveBeenCalledTimes(3);
  });

  it("does not throw when one user errors", async () => {
    mockEnsureConnected.mockResolvedValueOnce(null); // user 1 skipped
    mockGetPortfolio.mockRejectedValue(new Error("boom")); // user 2 errors
    const c = await runFullSweep({ dryRun: true });
    expect(c.skippedNoToken).toBe(1);
    expect(c.errors).toBe(1);
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Event-driven evaluation: a tick for symbol S must trigger evaluation of
// bots watching S through the FULL guard chain (safety floors already tested
// elsewhere), and only those bots.

const mockGetRecentTicks = vi.fn();
export const tickEvents = new EventEmitter();

vi.mock("./tickCollector", () => ({
  getRecentTicks: (...a: any[]) => mockGetRecentTicks(...a),
  isFeedStale: () => false,
  isMarketOpen: () => true,
  tickEvents,
}));

const mockEnsureConnected = vi.fn();
vi.mock("./derivConnection", () => ({
  derivManager: { ensureConnected: () => mockEnsureConnected() },
}));

vi.mock("./db", () => ({
  getPendingTradesForUser: vi.fn().mockResolvedValue([]),
  saveTrade: vi.fn().mockImplementation(async (t: any) => ({ id: 55, ...t })),
}));

vi.mock("./webhookExecutor", () => ({ fireWebhookEvent: vi.fn().mockResolvedValue(undefined) }));

const mockListAll = vi.fn();
vi.mock("./botRunner", () => ({
  botRunner: {
    listAll: () => mockListAll(),
    setOpenTrade: vi.fn().mockResolvedValue(undefined),
    persistSummary: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeBot(id: string, symbol: string) {
  return {
    def: {
      id,
      userId: 1,
      name: `bot-${id}`,
      strategy: { condition: { indicator: "digit_over", barrier: 5 }, params: { stake: "2" }, symbol },
      safety: {},
      startedAt: Date.now(),
    },
    status: "running" as const,
    totalTrades: 0,
    totalProfitLoss: 0,
    dailyTrades: 0,
    dailyPnl: 0,
    lossStreak: 0,
    hasOpenTrade: false,
  };
}

function warmBuffer() {
  // 100 uniform hot ticks (digit 7 > barrier 5) so digit_over always fires.
  return Array.from({ length: 100 }, (_, i) => ({ price: 1000.0007, epoch: 1_700_000_000 + i * 2, lastDigit: 7 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListAll.mockReturnValue([]);
  mockGetRecentTicks.mockReturnValue(warmBuffer());
});

describe("event-driven bot evaluation", () => {
  it("a tick for R_100 evaluates only the R_100 bot through proposal+buy", async () => {
    const { evaluateOnTick } = await import("./executionEngine");
    const r100 = makeBot("1", "R_100");
    const eur = makeBot("2", "frxEURUSD");
    mockListAll.mockReturnValue([r100, eur]);

    const conn = {
      getSnapshot: () => ({ account: { balance: 1000, currency: "USD" } }),
      getProposal: vi.fn().mockResolvedValue({ proposal: { id: "p1", ask_price: "1.9" } }),
      buyContract: vi.fn().mockResolvedValue({ buy: { contract_id: 424242 } }),
    };
    mockEnsureConnected.mockResolvedValue(conn);

    await evaluateOnTick("R_100");

    expect(conn.getProposal).toHaveBeenCalledTimes(1);
    expect(conn.getProposal.mock.calls[0][0].underlying_symbol).toBe("R_100");
    expect(conn.buyContract).toHaveBeenCalledWith("p1", "1.9");
    // The forex bot must not have been touched by an R_100 tick.
    expect(eur.hasOpenTrade).toBe(false);
  });

  it("throttles bursts of ticks for the same symbol", async () => {
    const { evaluateOnTick } = await import("./executionEngine");
    mockListAll.mockReturnValue([makeBot("3", "R_25")]); // distinct symbol: throttle state is per-symbol
    const conn = {
      getSnapshot: () => ({ account: { balance: 1000, currency: "USD" } }),
      getProposal: vi.fn().mockResolvedValue({ proposal: { id: "p1", ask_price: "1.9" } }),
      buyContract: vi.fn().mockResolvedValue({ buy: { contract_id: 1 } }),
    };
    mockEnsureConnected.mockResolvedValue(conn);

    await evaluateOnTick("R_25");
    await evaluateOnTick("R_25"); // inside throttle window
    expect(conn.getProposal).toHaveBeenCalledTimes(1);
  });

  it("no tick for a symbol means its bots are never evaluated", async () => {
    const { evaluateOnTick } = await import("./executionEngine");
    const eur = makeBot("4", "frxEURUSD");
    mockListAll.mockReturnValue([eur]);
    const conn = { getSnapshot: () => ({ account: { balance: 1000, currency: "USD" } }), getProposal: vi.fn(), buyContract: vi.fn() };
    mockEnsureConnected.mockResolvedValue(conn);

    await evaluateOnTick("R_100"); // different symbol entirely
    expect(conn.getProposal).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";

// Quota-hygiene tests: retention policy parsing (pure) + heartbeat throttle
// (behavioral, via mocked DB). Mock consts live at MODULE scope because
// vi.mock factories are hoisted above describe blocks.

const mockSaveHeartbeat = vi.fn().mockResolvedValue(true);
const mockGetPendingTrades = vi.fn();

vi.mock("./db", () => ({
  getPendingTrades: () => mockGetPendingTrades(),
  saveSettlementHeartbeat: (...a: any[]) => mockSaveHeartbeat(...a),
  settleTrade: vi.fn().mockResolvedValue({ id: 1 }),
  markTradeStuck: vi.fn().mockResolvedValue(true),
  recordStrategyStat: vi.fn(),
}));
vi.mock("./derivConnection", () => ({
  derivManager: { ensureConnected: vi.fn().mockResolvedValue(null), hasAuthorizedConnection: () => true },
}));
vi.mock("./botRunner", () => ({
  botRunner: { updateTradeStats: vi.fn(), setOpenTrade: vi.fn() },
}));

describe("tick retention policy", () => {
  const ORIGINAL = process.env.TICK_RETENTION_DAYS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.TICK_RETENTION_DAYS;
    else process.env.TICK_RETENTION_DAYS = ORIGINAL;
  });

  it("defaults to 14 days when the env var is unset", async () => {
    delete process.env.TICK_RETENTION_DAYS;
    const { tickRetentionDays } = await import("./dbRetention");
    expect(tickRetentionDays()).toBe(14);
  });

  it("honors an explicit day count", async () => {
    process.env.TICK_RETENTION_DAYS = "30";
    const { tickRetentionDays } = await import("./dbRetention");
    expect(tickRetentionDays()).toBe(30);
  });

  it("TICK_RETENTION_DAYS=0 disables pruning entirely", async () => {
    process.env.TICK_RETENTION_DAYS = "0";
    const { tickRetentionCutoffSec } = await import("./dbRetention");
    expect(tickRetentionCutoffSec(1_700_000_000)).toBeNull();
  });

  it("cutoff arithmetic: 14-day window", async () => {
    process.env.TICK_RETENTION_DAYS = "14";
    const { tickRetentionCutoffSec } = await import("./dbRetention");
    const now = 1_700_000_000;
    expect(tickRetentionCutoffSec(now)).toBe(now - 14 * 86400);
  });
});

describe("SettlementTracker heartbeat throttle", () => {
  afterEach(() => {
    mockSaveHeartbeat.mockClear();
    mockGetPendingTrades.mockReset();
  });

  it("writes at most one heartbeat per 60s window even across many ticks", async () => {
    const { SettlementTracker } = await import("./SettlementTracker");
    const t = new SettlementTracker();
    mockGetPendingTrades.mockResolvedValue([]);

    await t.runOnce();
    await t.runOnce();
    await t.runOnce(); // all within one minute → exactly ONE write

    expect(mockSaveHeartbeat).toHaveBeenCalledTimes(1);
  });
});

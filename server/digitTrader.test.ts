import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import { getTickHistory } from "./aitools";
import { scanAndPersistForUser, settleOpenDigitReads, READ_WINDOW_TICKS, FETCH_COUNT } from "./digitTrader";

vi.mock("./db", () => ({
  listOpenDigitReads: vi.fn().mockResolvedValue([]),
  saveDigitRead: vi.fn().mockImplementation(async (row: any) => ({ ...row, id: 1 })),
  setDigitReadOutcome: vi.fn().mockResolvedValue(undefined),
  listDigitReads: vi.fn().mockResolvedValue([]),
}));

vi.mock("./aitools", () => ({
  getTickHistory: vi.fn(),
}));

// Uniform digit stream every 2s (R_50 cadence, 4 decimals), so no read should
// be emitted independently of the persistence plumbing, plus a hot-over stream
// for the positive case.
function makeTicks(seed: "uniform" | "hotOver", count = FETCH_COUNT): Array<{ price: number; timestamp: number }> {
  const now = Date.now();
  const out: Array<{ price: number; timestamp: number }> = [];
  for (let i = 0; i < count; i++) {
    const digit = seed === "uniform" ? (i % 10) : i < count * 0.6 ? 7 : 1;
    // Encode the digit in the 4th decimal place so lastDigitOf(price, 4) = digit.
    const price = 1000 + digit / 10000;
    out.push({ price, timestamp: now - (count - i) * 2000 });
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("digitTrader scan + settle", () => {
  it("defines the window and fetch constants sensibly", () => {
    expect(READ_WINDOW_TICKS).toBe(100);
    expect(FETCH_COUNT).toBeGreaterThan(READ_WINDOW_TICKS);
  });

  it("persists reads only when a real tilt exists", async () => {
    (getTickHistory as any).mockResolvedValue(makeTicks("uniform"));
    const res = await scanAndPersistForUser(1, "R_50");
    expect(res.persisted).toBe(0);
    expect(res.snapshot.reads.length).toBe(0);
    expect(vi.mocked(db.saveDigitRead)).not.toHaveBeenCalled();
  });

  it("persists a strong OVER read on a hot-over stream", async () => {
    (getTickHistory as any).mockResolvedValue(makeTicks("hotOver"));
    const res = await scanAndPersistForUser(1, "R_50");
    const over = res.emitted.find((r) => r.type === "OVER" && r.barrier === 4);
    expect(over).toBeDefined();
    expect(res.persisted).toBeGreaterThan(0);
    expect(vi.mocked(db.saveDigitRead)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, symbol: "R_50", readType: over!.type, barrier: 4 }),
    );
  });

  it("settles open reads against the next tick and dedups", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Stream with a clear next tick: last two ticks are digit 7 then digit 7.
    const settleTicks = [
      { price: 1000.0001, timestamp: (nowSec - 30) * 1000 },
      { price: 1000.0007, timestamp: (nowSec - 20) * 1000 },
      { price: 1000.0007, timestamp: (nowSec - 10) * 1000 },
    ];
    (getTickHistory as any).mockResolvedValue(settleTicks);
    vi.mocked(db.listOpenDigitReads).mockResolvedValue([
      {
        id: 10, userId: 1, symbol: "R_50", readType: "OVER", barrier: 4,
        decisionEpoch: nowSec - 20,
      },
    ] as any);

    const settled = await settleOpenDigitReads(1);
    expect(settled.settled).toBe(1);
    expect(vi.mocked(db.setDigitReadOutcome)).toHaveBeenCalledWith(10, "win", nowSec - 10);
  });
});
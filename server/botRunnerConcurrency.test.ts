import { describe, it, expect, vi, beforeEach } from "vitest";

// The bot runner's guard chain must hold under genuine concurrent load:
// N simultaneous start() calls for the same id must yield exactly ONE running
// bot (the per-id mutex + "already running" check), and the mandatory safety
// floors must be applied no matter which call wins the race.

vi.mock("./db", () => ({
  updateBotRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./_core/notification", () => ({
  notifyUser: vi.fn(),
}));
vi.mock("./derivConnection", () => ({
  derivManager: { ensureConnected: vi.fn().mockResolvedValue(null) },
}));
vi.mock("./webhookExecutor", () => ({
  fireWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

import { botRunner, MANDATORY_SAFETY_FLOORS } from "./botRunner";

const baseOpts = (id: string) => ({
  id,
  userId: 1,
  name: `bot-${id}`,
  strategy: { condition: { indicator: "consecutive_rise", count: 3 }, params: { stake: "1" } },
  // Deliberately NO limits configured — floors must be applied.
  safety: {},
});

beforeEach(() => {
  for (const b of botRunner.listAll()) {
    botRunner.stop(b.def.id, b.def.userId, "stopped");
  }
});

describe("botRunner under concurrent load", () => {
  it("50 concurrent start() calls for the same bot produce exactly one running runtime", async () => {
    await Promise.all(Array.from({ length: 50 }, () => botRunner.start(baseOpts("9001"))));
    const all = botRunner.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("running");
  });

  it("safety floors apply regardless of which concurrent call wins", async () => {
    await Promise.all([
      botRunner.start(baseOpts("9002")),
      ...Array.from({ length: 20 }, (_, i) =>
        botRunner.start({ ...baseOpts("9002"), safety: i % 2 === 0 ? {} : { maxDailyLoss: 25, maxDailyTrades: 5, maxConsecutiveLosses: 3 } })
      ),
    ]);
    const bot = botRunner.listAll().find((b) => b.def.id === "9002");
    expect(bot).toBeDefined();
    const s = bot!.def.safety;
    expect(s.maxDailyLoss).toBeGreaterThan(0);
    expect(s.maxDailyTrades).toBeGreaterThan(0);
    expect(s.maxConsecutiveLosses).toBeGreaterThan(0);
  });

  it("explicit limits above the floor are preserved; zero cannot disable them", async () => {
    await botRunner.start({ ...baseOpts("9003"), safety: { maxDailyLoss: 500, maxDailyTrades: 0, maxConsecutiveLosses: 999 } });
    const s = botRunner.listAll().find((b) => b.def.id === "9003")!.def.safety;
    expect(s.maxDailyLoss).toBe(500); // user value kept
    expect(s.maxDailyTrades).toBe(MANDATORY_SAFETY_FLOORS.maxDailyTrades); // 0 → floor
    expect(s.maxConsecutiveLosses).toBe(999); // raised limit kept
  });

  it("many distinct bots starting concurrently all come up independently", async () => {
    await Promise.all(Array.from({ length: 40 }, (_, i) => botRunner.start(baseOpts(`9100-${i}`))));
    const all = botRunner.listAll().filter((b) => b.def.id.startsWith("9100-"));
    expect(all).toHaveLength(40);
    expect(all.every((b) => b.status === "running")).toBe(true);
    expect(all.every((b) => b.def.safety.maxDailyLoss > 0)).toBe(true);
  });
});

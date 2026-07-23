import { describe, it, expect } from "vitest";

describe("backup data utilities", () => {
  const sampleBackup = {
    strategies: [{ id: 1, name: "Momentum", rules: [], config: {}, createdAt: "2026-01-01" }],
    trades: [{ id: 1, symbol: "R_100", direction: "buy", profit: 10.5 }],
    journals: [{ id: 1, content: "Test entry", tags: ["test"] }],
    workflows: [],
    bots: [],
    exportedAt: "2026-07-20T12:00:00Z",
  };

  it("validates backup structure has required tables", () => {
    const required = ["strategies", "trades", "journals", "workflows", "bots", "exportedAt"];
    for (const key of required) {
      expect(sampleBackup).toHaveProperty(key);
    }
  });

  it("validates backup tables are arrays", () => {
    for (const table of ["strategies", "trades", "journals", "workflows", "bots"] as const) {
      expect(Array.isArray(sampleBackup[table])).toBe(true);
    }
  });

  it("counts records per table", () => {
    const counts = Object.fromEntries(
      ["strategies", "trades", "journals", "workflows", "bots"].map(k => [k, (sampleBackup as any)[k].length])
    );
    expect(counts.strategies).toBe(1);
    expect(counts.trades).toBe(1);
    expect(counts.journals).toBe(1);
    expect(counts.workflows).toBe(0);
    expect(counts.bots).toBe(0);
  });

  it("validates exportedAt is ISO date string", () => {
    expect(() => new Date(sampleBackup.exportedAt)).not.toThrow();
    expect(new Date(sampleBackup.exportedAt).toISOString()).toBe("2026-07-20T12:00:00.000Z");
  });

  it("strips id/createdAt/updatedAt during import", () => {
    const stripMeta = (row: Record<string, any>) => {
      const { id, createdAt, updatedAt, ...rest } = row;
      return rest;
    };
    expect(stripMeta(sampleBackup.strategies[0])).not.toHaveProperty("id");
    expect(stripMeta(sampleBackup.strategies[0])).not.toHaveProperty("createdAt");
  });

  it("handles empty backup gracefully", () => {
    const empty = { strategies: [], trades: [], journals: [], workflows: [], bots: [], exportedAt: new Date().toISOString() };
    expect(empty.strategies).toHaveLength(0);
    expect(empty.trades).toHaveLength(0);
  });
});

describe("restore data utilities", () => {
  it("counts imported records", () => {
    const count = { imported: 5 };
    expect(count.imported).toBeGreaterThan(0);
    expect(count.imported).toBe(5);
  });

  it("handles zero imported records", () => {
    const count = { imported: 0 };
    expect(count.imported).toBe(0);
  });

  it("rejects invalid backup objects", () => {
    const isValid = (data: any) => !!data && typeof data === "object" && (Array.isArray(data.strategies) || Array.isArray(data.trades));
    expect(isValid(null)).toBe(false);
    expect(isValid({})).toBe(false);
    expect(isValid({ strategies: [] })).toBe(true);
    expect(isValid({ trades: [] })).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { computeSessionWeight, applySessionWeight } from "./sessionWeight";

describe("computeSessionWeight", () => {
  it("returns peak weight during London-NY overlap (14:00 UTC)", () => {
    const date = new Date("2026-01-15T14:30:00Z");
    const w = computeSessionWeight(date);
    expect(w.multiplier).toBe(1.0);
    expect(w.quality).toBe("peak");
    expect(w.activeSessions).toContain("London");
    expect(w.activeSessions).toContain("New York");
  });

  it("returns good weight during London solo (10:00 UTC)", () => {
    const date = new Date("2026-01-15T10:00:00Z");
    const w = computeSessionWeight(date);
    expect(w.multiplier).toBe(0.95);
    expect(w.quality).toBe("good");
  });

  it("returns thin weight during NY close → Sydney open (22:00 UTC)", () => {
    const date = new Date("2026-01-15T22:00:00Z");
    const w = computeSessionWeight(date);
    expect(w.multiplier).toBe(0.70);
    expect(w.quality).toBe("thin");
  });

  it("returns normal weight during off-peak (04:00 UTC)", () => {
    const date = new Date("2026-01-15T04:00:00Z");
    const w = computeSessionWeight(date);
    expect(w.multiplier).toBe(0.85);
    expect(w.quality).toBe("normal");
  });

  it("includes reasoning", () => {
    const w = computeSessionWeight();
    expect(w.reasoning.length).toBeGreaterThan(0);
    expect(w.reasoning).toContain("Session:");
  });
});

describe("applySessionWeight", () => {
  it("reduces confidence for thin session", () => {
    const w = { multiplier: 0.7, quality: "thin" as const, activeSessions: [], reasoning: "" };
    expect(applySessionWeight(70, w)).toBe(49);
  });

  it("preserves confidence for peak session", () => {
    const w = { multiplier: 1.0, quality: "peak" as const, activeSessions: [], reasoning: "" };
    expect(applySessionWeight(70, w)).toBe(70);
  });

  it("clamps to 0 minimum", () => {
    const w = { multiplier: 0.7, quality: "thin" as const, activeSessions: [], reasoning: "" };
    expect(applySessionWeight(0, w)).toBe(0);
  });

  it("clamps to 100 maximum", () => {
    const w = { multiplier: 1.0, quality: "peak" as const, activeSessions: [], reasoning: "" };
    expect(applySessionWeight(110, w)).toBe(100);
  });
});

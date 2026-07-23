import { describe, it, expect } from "vitest";

describe("string formatting", () => {
  it("capitalizes first letter", () => {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    expect(cap("hello")).toBe("Hello");
    expect(cap("")).toBe("");
  });

  it("truncates strings", () => {
    const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max) + "..." : s;
    expect(trunc("hello world", 5)).toBe("hello...");
    expect(trunc("hi", 5)).toBe("hi");
  });

  it("formats numbers with commas", () => {
    const fmt = (n: number) => n.toLocaleString();
    expect(fmt(1000)).toBe("1,000");
    expect(fmt(1234567)).toBe("1,234,567");
  });

  it("formats percentages", () => {
    const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
    expect(pct(0.25)).toBe("25.0%");
    expect(pct(1)).toBe("100.0%");
    expect(pct(0.333, 0)).toBe("33%");
  });
});

describe("date formatting", () => {
  it("formats ISO date to locale", () => {
    const d = new Date("2026-07-20T12:00:00Z");
    expect(d.toISOString().split("T")[0]).toBe("2026-07-20");
  });

  it("calculates days between dates", () => {
    const diffDays = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);
    expect(diffDays(new Date("2026-01-01"), new Date("2026-01-31"))).toBe(30);
  });
});

describe("number utilities", () => {
  it("clamps values", () => {
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("rounds to decimal places", () => {
    const round = (v: number, d: number) => Number(v.toFixed(d));
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
  });

  it("generates random integer in range", () => {
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    for (let i = 0; i < 100; i++) {
      const v = randInt(1, 10);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

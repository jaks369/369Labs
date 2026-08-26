import { describe, it, expect } from "vitest";
import { getForexSessionInfo } from "./forexSessions";

function atUtc(hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

describe("getForexSessionInfo — calendar-based liquidity awareness", () => {
  it("flags the London–NY overlap as peak", () => {
    const info = getForexSessionInfo(atUtc(14));
    expect(info.londonNyOverlap).toBe(true);
    expect(info.liquidity).toBe("peak");
    expect(info.activeSessions).toContain("London");
    expect(info.activeSessions).toContain("New York");
  });

  it("flags the NY close → Sydney open window as thin", () => {
    const info = getForexSessionInfo(atUtc(22));
    expect(info.liquidity).toBe("thin");
    expect(info.note).toMatch(/thin/i);
  });

  it("London-only morning is good liquidity", () => {
    const info = getForexSessionInfo(atUtc(8));
    expect(info.liquidity).toBe("good");
    expect(info.activeSessions).toContain("London");
  });

  it("handles midnight-wrapping sessions (Sydney 21–6)", () => {
    const early = getForexSessionInfo(atUtc(2));
    expect(early.activeSessions).toContain("Sydney");
    expect(early.activeSessions).toContain("Tokyo");
    // 23:30 is inside Sydney's wrap and outside the thin window's upper bound.
    const late = getForexSessionInfo(atUtc(23, 30));
    expect(late.activeSessions).toContain("Sydney");
    expect(late.liquidity).not.toBe("thin");
  });

  it("every hour of the day yields a defined quality and non-empty note", () => {
    for (let h = 0; h < 24; h++) {
      const info = getForexSessionInfo(atUtc(h));
      expect(["peak", "good", "normal", "thin"]).toContain(info.liquidity);
      expect(info.note.length).toBeGreaterThan(0);
    }
  });
});

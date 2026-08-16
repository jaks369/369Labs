import { describe, it, expect } from "vitest";
import {
  buildDigitReads,
  buildDigitSnapshot,
  settleDigitRead,
  streakOf,
  readBaseline,
  readLabel,
  digitsFromTicks,
  digitStrengthFor,
} from "./digits";

describe("readBaseline / readLabel", () => {
  it("uses the repo's fair baselines", () => {
    expect(readBaseline("EVEN", null)).toBe(50);
    expect(readBaseline("ODD", null)).toBe(50);
    expect(readBaseline("OVER", 4)).toBe(50); // digits 5-9
    expect(readBaseline("UNDER", 5)).toBe(50); // digits 0-4
    expect(readBaseline("OVER", 5)).toBe(40);
    expect(readBaseline("UNDER", 3)).toBe(30);
  });
  it("labels reads clearly", () => {
    expect(readLabel("OVER", 4)).toBe("Over 4");
    expect(readLabel("UNDER", 5)).toBe("Under 5");
    expect(readLabel("EVEN", null)).toBe("Even");
    expect(readLabel("ODD", null)).toBe("Odd");
  });
});

describe("streakOf", () => {
  it("counts trailing runs", () => {
    const digs = [1, 2, 2, 3, 3, 3];
    const s = streakOf(digs);
    expect(s.lastDigit).toBe(3);
    expect(s.digitRun).toBe(3);
    expect(s.oddRun).toBe(3);
    expect(s.evenRun).toBe(0);
  });
});

describe("buildDigitReads honesty", () => {
  it("emits nothing on a perfectly uniform stream (no tilt)", () => {
    const uniform = Array.from({ length: 100 }, (_, i) => i % 10);
    expect(buildDigitReads(uniform)).toEqual([]);
  });
  it("returns an OVER read only when the tilt is real (>=5pp)", () => {
    // 60 of 100 digits are >4 => OVER4 freq 60%, delta +10pp => emitted
    const digits = Array.from({ length: 100 }, (_, i) => (i < 60 ? 6 : 1));
    const reads = buildDigitReads(digits);
    const over = reads.find((r) => r.type === "OVER" && r.barrier === 4);
    expect(over).toBeDefined();
    expect(over!.freq).toBe(60);
    expect(over!.confidence).toBeLessThanOrEqual(58);
    expect(over!.strength).toBe("STRONG");
  });
  it("needs >=30 digits and caps confidence", () => {
    expect(buildDigitReads([6, 6, 6, 6, 6])).toEqual([]);
    const hot = Array.from({ length: 80 }, () => 9);
    const reads = buildDigitReads(hot);
    expect(reads.every((r) => r.confidence <= 58)).toBe(true);
    expect(reads.some((r) => r.strength === "STRONG")).toBe(true);
  });
});

describe("settleDigitRead (Deriv semantics)", () => {
  it("OVER 4: >4 win, <4 loss, ==4 expired", () => {
    const read = { type: "OVER" as const, barrier: 4 };
    expect(settleDigitRead(read, 5)).toBe("win");
    expect(settleDigitRead(read, 9)).toBe("win");
    expect(settleDigitRead(read, 3)).toBe("loss");
    expect(settleDigitRead(read, 4)).toBe("expired");
  });
  it("UNDER 5: <5 win, >5 loss, ==5 expired", () => {
    const read = { type: "UNDER" as const, barrier: 5 };
    expect(settleDigitRead(read, 4)).toBe("win");
    expect(settleDigitRead(read, 0)).toBe("win");
    expect(settleDigitRead(read, 9)).toBe("loss");
    expect(settleDigitRead(read, 5)).toBe("expired");
  });
  it("EVEN/ODD by parity, never expired", () => {
    expect(settleDigitRead({ type: "EVEN" as const, barrier: null }, 4)).toBe("win");
    expect(settleDigitRead({ type: "EVEN" as const, barrier: null }, 7)).toBe("loss");
    expect(settleDigitRead({ type: "ODD" as const, barrier: null }, 9)).toBe("win");
    expect(settleDigitRead({ type: "ODD" as const, barrier: null }, 2)).toBe("loss");
  });
});

describe("digitsFromTicks / buildDigitSnapshot", () => {
  it("reuses lastDigitOf to map prices to digits", () => {
    const ticks = [
      { price: 8123.45, epoch: 1 },
      { price: 8123.46, epoch: 2 },
      { price: 8123.50, epoch: 3 },
    ];
    const fromTicks = digitsFromTicks(ticks, 2);
    expect(fromTicks.map((d) => d.digit)).toEqual([5, 6, 0]);
  });
  it("builds the full snapshot with counts and percentages", () => {
    const ticks = Array.from({ length: 100 }, (_, i) => ({ price: 1000 + i * 0.01, epoch: i }));
    const snap = buildDigitSnapshot("R_100", ticks);
    expect(snap.symbol).toBe("R_100");
    expect(snap.counts).toBeTruthy();
    expect(snap.evenPct + snap.oddPct).toBeCloseTo(100, 0);
    expect(snap.streak.lastDigit).toBeGreaterThanOrEqual(0);
  });
});

describe("digitStrengthFor", () => {
  it("uses the concierge tiers", () => {
    expect(digitStrengthFor(80)).toBe("STRONG");
    expect(digitStrengthFor(60)).toBe("MEDIUM");
    expect(digitStrengthFor(40)).toBe("WEAK");
  });
});
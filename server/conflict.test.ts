import { describe, it, expect } from "vitest";
import { scorePriceActionConfluence, buildCandles, ConfluenceScore } from "@shared/indicators";
import { scanSignalForSymbol, detectMomentumPaConflict } from "./indicatorSignal";
import type { TickLike } from "@shared/indicators";

// Steady uptrend then a sharp structure break down — enough to make the
// momentum and price-action layers disagree in the combined scanner.
function makeTicks(count: number): TickLike[] {
  const now = Math.floor(Date.now() / 1000);
  const out: TickLike[] = [];
  for (let i = 0; i < count; i++) {
    let price = 1000 + i * 0.5; // steady rise
    if (i > count - 8) price -= (i - (count - 8)) * 4; // sharp break at the end
    out.push({ price, epoch: now - (count - i) * 2 });
  }
  return out;
}

describe("structural vs approximate signal sourcing", () => {
  it("every price-action detail declares its epistemic source", () => {
    const ticks = makeTicks(120);
    const candles = buildCandles(ticks, 60);
    const pa = scorePriceActionConfluence(candles);
    for (const d of pa.details) {
      expect(["structural", "approximate"]).toContain(d.source);
    }
    // SMC zones must always be flagged approximate when present.
    for (const d of pa.details) {
      if (d.name === "SMC zones") expect(d.source).toBe("approximate");
    }
  });
});

describe("momentum vs price-action conflict detection", () => {
  const upScore: ConfluenceScore = {
    score: 78,
    direction: "up",
    votes: { up: 4, down: 0, total: 4, agreement: 1 },
    details: [],
    reasons: [],
  };
  const downPa: ConfluenceScore = {
    score: 64,
    direction: "down",
    votes: { up: 0, down: 2, total: 3, agreement: 2 / 3 },
    details: [],
    reasons: [],
  };
  const emptyPa: ConfluenceScore = {
    score: 50,
    direction: "up",
    votes: { up: 0, down: 0, total: 0, agreement: 0 },
    details: [],
    reasons: [],
  };

  it("flags disagreement between layers as an explicit conflict", () => {
    const c = detectMomentumPaConflict(upScore, downPa);
    expect(c).toBeDefined();
    expect(c!.momentumDirection).toBe("up");
    expect(c!.priceActionDirection).toBe("down");
    expect(c!.note).toMatch(/CONFLICT/i);
  });

  it("does not flag agreement or missing layers", () => {
    expect(detectMomentumPaConflict(upScore, { ...downPa, direction: "up" })).toBeUndefined();
    expect(detectMomentumPaConflict(upScore, emptyPa)).toBeUndefined();
  });

  it("the scanner caps conflicted signals below STRONG", async () => {
    const res = scanSignalForSymbol("R_100", makeTicks(200));
    if (res.signal?.conflict) {
      expect(res.signal.confidence).toBeLessThanOrEqual(64);
      expect(res.signal.strength).not.toBe("STRONG");
      expect(res.signal.reasons.some((r) => /CONFLICT/.test(r))).toBe(true);
    }
  });
});

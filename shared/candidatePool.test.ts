import { describe, it, expect } from "vitest";
import { addToPool, getTopSignals, type CandidateSignal, type PoolState, DEFAULT_POOL_CONFIG } from "./candidatePool";

function makeSignal(overrides: Partial<CandidateSignal> = {}): CandidateSignal {
  return {
    id: `sig_${Math.random().toString(36).slice(2)}`,
    symbol: "EURUSD",
    direction: "rise",
    confidence: 70,
    netConfidence: 65,
    timestamp: Date.now(),
    ...overrides,
  };
}

const emptyPool: PoolState = { active: [], rejected: [], slotsAvailable: DEFAULT_POOL_CONFIG.maxSlots };

describe("addToPool", () => {
  it("adds signal to empty pool", () => {
    const sig = makeSignal();
    const result = addToPool(sig, emptyPool);
    expect(result.active).toHaveLength(1);
    expect(result.active[0].id).toBe(sig.id);
  });

  it("rejects signal below minimum confidence", () => {
    const sig = makeSignal({ netConfidence: 40 });
    const result = addToPool(sig, emptyPool);
    expect(result.active).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("evicts weakest when pool is full", () => {
    let pool = emptyPool;
    for (let i = 0; i < DEFAULT_POOL_CONFIG.maxSlots; i++) {
      pool = addToPool(makeSignal({ id: `sig_${i}`, netConfidence: 60 + i }), pool);
    }
    expect(pool.active).toHaveLength(DEFAULT_POOL_CONFIG.maxSlots);

    // Add a stronger signal
    const stronger = makeSignal({ id: "stronger", netConfidence: 90 });
    pool = addToPool(stronger, pool);
    expect(pool.active).toHaveLength(DEFAULT_POOL_CONFIG.maxSlots);
    expect(pool.active.some((s) => s.id === "stronger")).toBe(true);
  });

  it("rejects weaker signal when pool is full", () => {
    let pool = emptyPool;
    for (let i = 0; i < DEFAULT_POOL_CONFIG.maxSlots; i++) {
      pool = addToPool(makeSignal({ id: `sig_${i}`, netConfidence: 80 + i }), pool);
    }

    const weaker = makeSignal({ id: "weaker", netConfidence: 55 });
    pool = addToPool(weaker, pool);
    expect(pool.rejected.some((s) => s.id === "weaker")).toBe(true);
  });
});

describe("getTopSignals", () => {
  it("returns top N by net confidence", () => {
    let pool = emptyPool;
    pool = addToPool(makeSignal({ id: "low", netConfidence: 55 }), pool);
    pool = addToPool(makeSignal({ id: "mid", netConfidence: 70 }), pool);
    pool = addToPool(makeSignal({ id: "high", netConfidence: 85 }), pool);

    const top = getTopSignals(pool, 2);
    expect(top).toHaveLength(2);
    expect(top[0].id).toBe("high");
    expect(top[1].id).toBe("mid");
  });
});

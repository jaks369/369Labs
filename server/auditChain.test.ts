import { describe, it, expect } from "vitest";
import {
  appendEntry,
  verifyChain,
  getCorrelation,
  newCorrelationId,
  computeEntryHash,
  type AuditChainEntry,
} from "./auditChain";

function baseEntry(overrides: Partial<Omit<AuditChainEntry, "prevHash" | "hash" | "seq">> = {}) {
  return {
    userId: 1,
    action: "test_action",
    target: "test_target",
    detail: { foo: "bar" },
    correlationId: "corr-123",
    tsMs: Date.now(),
    ...overrides,
  };
}

describe("computeEntryHash", () => {
  it("is deterministic for same input", () => {
    const e = baseEntry({ seq: 1, prevHash: "0".repeat(64), tsMs: 1234567890000 });
    const h1 = computeEntryHash(e);
    const h2 = computeEntryHash(e);
    expect(h1).toBe(h2);
  });

  it("changes when any field changes", () => {
    const e = baseEntry({ seq: 1, prevHash: "0".repeat(64), tsMs: 1234567890000 });
    const h1 = computeEntryHash(e);
    const e2 = { ...e, detail: { foo: "baz" } };
    const h2 = computeEntryHash(e2);
    expect(h1).not.toBe(h2);
  });
});

describe("appendEntry", () => {
  it("creates genesis entry with zero prevHash", () => {
    const chain = appendEntry([], baseEntry());
    expect(chain.length).toBe(1);
    expect(chain[0].seq).toBe(1);
    expect(chain[0].prevHash).toBe("0".repeat(64));
    expect(chain[0].hash).toHaveLength(64);
  });

  it("links entries via prevHash", () => {
    let chain = appendEntry([], baseEntry({ action: "first" }));
    chain = appendEntry(chain, baseEntry({ action: "second" }));
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain[1].seq).toBe(2);
  });

  it("increments sequence", () => {
    let chain = appendEntry([], baseEntry());
    chain = appendEntry(chain, baseEntry());
    chain = appendEntry(chain, baseEntry());
    expect(chain[0].seq).toBe(1);
    expect(chain[1].seq).toBe(2);
    expect(chain[2].seq).toBe(3);
  });
});

describe("verifyChain", () => {
  it("validates a correct chain", () => {
    let chain = appendEntry([], baseEntry({ action: "a" }));
    chain = appendEntry(chain, baseEntry({ action: "b" }));
    chain = appendEntry(chain, baseEntry({ action: "c" }));
    expect(verifyChain(chain).valid).toBe(true);
  });

  it("detects tampered detail in middle entry", () => {
    let chain = appendEntry([], baseEntry({ action: "a" }));
    chain = appendEntry(chain, baseEntry({ action: "b" }));
    chain = appendEntry(chain, baseEntry({ action: "c" }));
    chain[1].detail = { tampered: true };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects broken prevHash link", () => {
    let chain = appendEntry([], baseEntry({ action: "a" }));
    chain = appendEntry(chain, baseEntry({ action: "b" }));
    chain[1].prevHash = "x".repeat(64);
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects recomputed hash mismatch", () => {
    let chain = appendEntry([], baseEntry({ action: "a" }));
    chain = appendEntry(chain, baseEntry({ action: "b" }));
    chain[1].hash = "x".repeat(64);
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("empty chain is valid", () => {
    expect(verifyChain([]).valid).toBe(true);
  });
});

describe("getCorrelation", () => {
  it("filters entries by correlationId", () => {
    const corr = newCorrelationId();
    let chain = appendEntry([], baseEntry({ correlationId: corr }));
    chain = appendEntry(chain, baseEntry({ correlationId: "other" }));
    chain = appendEntry(chain, baseEntry({ correlationId: corr }));
    const filtered = getCorrelation(chain, corr);
    expect(filtered.length).toBe(2);
    expect(filtered[0].seq).toBe(1);
    expect(filtered[1].seq).toBe(3);
  });

  it("returns empty for unknown correlationId", () => {
    let chain = appendEntry([], baseEntry({ correlationId: "a" }));
    chain = appendEntry(chain, baseEntry({ correlationId: "b" }));
    expect(getCorrelation(chain, "unknown")).toEqual([]);
  });
});

describe("newCorrelationId", () => {
  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(newCorrelationId());
    }
    expect(ids.size).toBe(100);
  });

  it("produces valid UUID format", () => {
    const id = newCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
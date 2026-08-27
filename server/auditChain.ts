/**
 * Immutable hash-chain audit log — tamper-evident ledger of every decision.
 *
 * Each entry carries:
 *   - prevHash: SHA-256 of the previous entry (genesis uses "0".repeat(64))
 *   - hash: SHA-256(payload + prevHash + timestampMs + seq)
 *   - correlationId: groups entries belonging to one decision chain
 *     (signal generated → trade opened → trade settled)
 *
 * Pure module: no DB, no network. Persistence layer in db.ts.
 */

import { createHash } from "crypto";

export interface AuditChainEntry {
  seq: number;
  userId: number;
  action: string;
  target: string | null;
  detail: any;
  correlationId: string | null;
  prevHash: string;
  hash: string;
  tsMs: number;
}

/** Compute SHA-256 hash as hex string. */
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the hash for an entry given its fields and the previous hash.
 * The hash covers: seq, userId, action, target, detail, correlationId, prevHash, tsMs.
 * Uses an explicit field array to guarantee deterministic serialization.
 */
export function computeEntryHash(entry: AuditChainEntry): string {
  const fields = [
    entry.seq,
    entry.userId,
    entry.action,
    entry.target,
    JSON.stringify(entry.detail),
    entry.correlationId,
    entry.prevHash,
    entry.tsMs,
  ];
  return sha256Hex(JSON.stringify(fields));
}

/**
 * Append a new entry to the chain, computing its hash from the previous tail.
 * Returns the new chain with the appended entry.
 */
export function appendEntry(
  chain: AuditChainEntry[],
  entry: Omit<AuditChainEntry, "prevHash" | "hash" | "seq">,
): AuditChainEntry[] {
  const prev = chain.length > 0 ? chain[chain.length - 1] : null;
  const seq = chain.length + 1;
  const prevHash = prev ? prev.hash : "0".repeat(64);
  const newEntry: AuditChainEntry = {
    ...entry,
    seq,
    prevHash,
    hash: "",
  };
  newEntry.hash = computeEntryHash(newEntry);
  return [...chain, newEntry];
}

/**
 * Verify the entire chain integrity.
 * Returns { valid: true } if all hashes link correctly,
 * { valid: false, brokenAt: index, reason: string } on first break.
 */
export function verifyChain(chain: AuditChainEntry[]): { valid: boolean; brokenAt?: number; reason?: string } {
  if (chain.length === 0) return { valid: true };
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    const expectedPrev = i === 0 ? "0".repeat(64) : chain[i - 1].hash;
    if (e.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: i, reason: `prevHash mismatch at index ${i}: expected ${expectedPrev.slice(0, 8)}..., got ${e.prevHash.slice(0, 8)}...` };
    }
    const expectedHash = computeEntryHash(e);
    if (e.hash !== expectedHash) {
      return { valid: false, brokenAt: i, reason: `hash mismatch at index ${i}: expected ${expectedHash.slice(0, 8)}..., got ${e.hash.slice(0, 8)}...` };
    }
  }
  return { valid: true };
}

/**
 * Find all entries in the chain with a given correlationId.
 * Returns them in chronological order (oldest first).
 */
export function getCorrelation(chain: AuditChainEntry[], correlationId: string): AuditChainEntry[] {
  return chain.filter((e) => e.correlationId === correlationId);
}

/**
 * Generate a new correlation ID (UUID v4 style).
 */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}
/**
 * Candidate Pool: Fixed-size signal competition for slots.
 *
 * Limits the number of active signals to prevent over-signaling.
 * Only the top N signals (by net confidence) are eligible for live execution.
 * This prevents signal flooding and ensures quality over quantity.
 */

export interface CandidateSignal {
  id: string;
  symbol: string;
  direction: "rise" | "fall";
  confidence: number;
  netConfidence: number;
  timestamp: number;
}

export interface PoolConfig {
  /** Maximum number of active signal slots. */
  maxSlots: number;
  /** Minimum net confidence to enter the pool. */
  minNetConfidence: number;
  /** Maximum age (ms) before a slot expires. */
  maxAgeMs: number;
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxSlots: 5,
  minNetConfidence: 55,
  maxAgeMs: 5 * 60 * 1000, // 5 minutes
};

export interface PoolState {
  /** Currently active signals in the pool. */
  active: CandidateSignal[];
  /** Signals that were rejected (below threshold or pool full). */
  rejected: CandidateSignal[];
  /** How many slots are available. */
  slotsAvailable: number;
}

/**
 * Add a signal to the pool. If the pool is full, the weakest signal is evicted.
 * Returns the updated pool state.
 */
export function addToPool(
  signal: CandidateSignal,
  current: PoolState,
  config: PoolConfig = DEFAULT_POOL_CONFIG,
): PoolState {
  // Reject if below minimum confidence
  if (signal.netConfidence < config.minNetConfidence) {
    return {
      active: current.active,
      rejected: [...current.rejected, signal],
      slotsAvailable: current.slotsAvailable,
    };
  }

  // Check for expired slots
  const now = Date.now();
  const active = current.active.filter((s) => now - s.timestamp < config.maxAgeMs);

  // If pool is full, evict the weakest signal
  if (active.length >= config.maxSlots) {
    const weakest = active.reduce((min, s) => s.netConfidence < min.netConfidence ? s : min, active[0]);
    if (signal.netConfidence > weakest.netConfidence) {
      // New signal is stronger — evict weakest
      const filtered = active.filter((s) => s.id !== weakest.id);
      return {
        active: [...filtered, signal],
        rejected: [...current.rejected, weakest],
        slotsAvailable: 0,
      };
    } else {
      // New signal is weaker — reject it
      return {
        active,
        rejected: [...current.rejected, signal],
        slotsAvailable: 0,
      };
    }
  }

  // Pool has space — add the signal
  return {
    active: [...active, signal],
    rejected: current.rejected,
    slotsAvailable: config.maxSlots - active.length - 1,
  };
}

/**
 * Get the top N signals from the pool by net confidence.
 */
export function getTopSignals(pool: PoolState, n: number): CandidateSignal[] {
  return pool.active
    .sort((a, b) => b.netConfidence - a.netConfidence)
    .slice(0, n);
}

import { lastDigitOf } from "@shared/lastDigit";

export type SimOutcome = "win" | "loss";

// Deriv payouts vary by contract type, duration, and symbol (typically 80–97%).
// Set to match your broker's actual rate for the contracts you trade.
export const PAYOUT_RATE = 0.95;

// Map a strategy rule's action (and its condition barrier) into the real Deriv
// contract type + barrier. The digit barrier lives on rule.condition.barrier —
// the action carries only the tradeType. Callers that only have the action
// should prefer passing the full rule so the barrier is not silently lost.
export function actionToContractType(strategy: any): { contractType: string; barrier?: number } {
  const action = strategy?.action || {};
  const barrier = strategy?.condition?.barrier !== undefined ? strategy.condition.barrier : action.barrier;
  switch (action.tradeType) {
    case "buy_rise":
      return { contractType: "CALL" };
    case "buy_fall":
      return { contractType: "PUT" };
    case "buy_higher":
      return { contractType: "CALL", barrier };
    case "buy_lower":
      return { contractType: "PUT", barrier };
    case "buy_even":
      return { contractType: "DIGITEVEN" };
    case "buy_odd":
      return { contractType: "DIGITODD" };
    case "buy_over":
      return { contractType: "DIGITOVER", barrier: barrier ?? 5 };
    case "buy_under":
      return { contractType: "DIGITUNDER", barrier: barrier ?? 5 };
    case "buy_digit_match":
      return { contractType: "DIGITMATCH", barrier: barrier ?? 0 };
    case "buy_digit_diff":
      return { contractType: "DIGITDIFF", barrier: barrier ?? 0 };
    default:
      return { contractType: "CALL" };
  }
}

export const DIGIT_CONTRACT_TYPES = ["DIGITMATCH", "DIGITDIFF", "DIGITOVER", "DIGITUNDER", "DIGITEVEN", "DIGITODD"];

export function isDigitContract(contractType: string): boolean {
  return DIGIT_CONTRACT_TYPES.includes(contractType);
}

// Determine the outcome of a contract given the entry and exit (next) price.
// For rise/fall, a flat tick (exit === entry) is a draw/refund on Deriv and is
// reported as neither win nor loss — use "draw" to exclude it from win-rate math.
// For higher/lower (CALL/PUT with barrier), the barrier is a fixed strike price:
// CALL wins if exit > barrier, PUT wins if exit < barrier. Flat at barrier = draw.
export function simulateOutcome(entryPrice: number, exitPrice: number, contractType: string, barrier?: number, decimals?: number): SimOutcome | "draw" {
  const d = decimals ?? 2;
  switch (contractType) {
    case "CALL":
      // Higher/Lower: barrier present → exit must clear barrier
      if (barrier !== undefined && barrier !== null) {
        if (exitPrice === barrier) return "draw";
        return exitPrice > barrier ? "win" : "loss";
      }
      // Rise/Fall: exit must beat entry
      if (exitPrice === entryPrice) return "draw";
      return exitPrice > entryPrice ? "win" : "loss";
    case "PUT":
      // Higher/Lower: barrier present → exit must clear barrier downward
      if (barrier !== undefined && barrier !== null) {
        if (exitPrice === barrier) return "draw";
        return exitPrice < barrier ? "win" : "loss";
      }
      // Rise/Fall: exit must beat entry downward
      if (exitPrice === entryPrice) return "draw";
      return exitPrice < entryPrice ? "win" : "loss";
    case "DIGITEVEN":
      return lastDigitOf(exitPrice, d) % 2 === 0 ? "win" : "loss";
    case "DIGITODD":
      return lastDigitOf(exitPrice, d) % 2 === 1 ? "win" : "loss";
    case "DIGITOVER":
      return lastDigitOf(exitPrice, d) > (barrier ?? 5) ? "win" : "loss";
    case "DIGITUNDER":
      return lastDigitOf(exitPrice, d) < (barrier ?? 5) ? "win" : "loss";
    case "DIGITMATCH":
      return lastDigitOf(exitPrice, d) === (barrier ?? 0) ? "win" : "loss";
    case "DIGITDIFF":
      return lastDigitOf(exitPrice, d) !== (barrier ?? 0) ? "win" : "loss";
    default:
      if (exitPrice === entryPrice) return "draw";
      return exitPrice > entryPrice ? "win" : "loss";
  }
}

export function calcPnl(result: SimOutcome, stake: number, payoutRate: number = PAYOUT_RATE): number {
  return result === "win" ? stake * payoutRate : -stake;
}

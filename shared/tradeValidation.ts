/**
 * Client-side trade validation.
 *
 * Catches obviously-invalid contract/duration/symbol combinations before
 * they hit the Deriv API, surfacing inline warnings instead of a rejected
 * buy. The Deriv API is the final arbiter — this just prevents the most
 * common user mistakes.
 */

import type { ContractSelection } from "@/components/ContractTypeSelector";
import type { DurationUnit } from "@/components/DurationSelector";

export interface TradeValidationWarning {
  field: string;
  message: string;
}

/**
 * Validate a trade combination before submission.
 * Returns an array of warnings (empty = all clear).
 */
export function validateTrade(
  contract: ContractSelection,
  duration: number,
  durationUnit: DurationUnit,
  symbol: string,
): TradeValidationWarning[] {
  const warnings: TradeValidationWarning[] = [];
  const category = contract.category;

  // Accumulator: duration is meaningless (no end duration, only growth rate)
  if (category === "accumulator" && durationUnit !== "t") {
    // Accumulators don't use duration at all — not an error, but clarify
  }

  // Digit contracts: only tick duration is supported on Deriv
  const isDigitContract = category === "over_under" || category === "even_odd" || category === "digits";
  if (isDigitContract && durationUnit !== "t") {
    warnings.push({
      field: "duration",
      message: "Digit contracts only support tick duration on Deriv",
    });
  }

  // Higher/Lower: barrier (strike price) is required
  if (category === "higher_lower" && (contract.barrier === undefined || contract.barrier === null)) {
    warnings.push({
      field: "barrier",
      message: "Set a strike price before trading Higher/Lower",
    });
  }

  // Over/Under: barrier (digit 0-9) is required
  if (category === "over_under" && contract.barrier === undefined) {
    warnings.push({
      field: "barrier",
      message: "Select a barrier digit before trading Over/Under",
    });
  }

  // Digits: digit is required
  if (category === "digits" && contract.digit === undefined) {
    warnings.push({
      field: "digit",
      message: "Select a digit before trading Matches/Differs",
    });
  }

  return warnings;
}

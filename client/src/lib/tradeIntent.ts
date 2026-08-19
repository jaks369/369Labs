/**
 * Execution-assist bridge: one tap from a Concierge/Digit Trader setup writes
 * the same localStorage keys the Dashboard terminal uses (369labs.terminal.*),
 * so navigating to /dashboard lands with the symbol, contract, stake and
 * duration pre-filled. Nothing executes a trade by itself — the user always
 * confirms in the terminal.
 */

import type { ContractSelection } from "@/components/ContractTypeSelector";
import type { DurationUnit } from "@/components/DurationSelector";
import type { DigitRead } from "../../../shared/digits";

export interface TradeIntent {
  symbol: string;
  contract: ContractSelection;
  stake: number;
  duration: number;
  durationUnit: DurationUnit;
  label: string;
  stopLoss?: number;
  takeProfit?: number;
}

/** Map a shared DigitRead to the terminal's contract shape. */
export function digitReadToContract(read: DigitRead): ContractSelection {
  switch (read.type) {
    case "OVER":
      return { category: "over_under", overUnder: "over", barrier: read.barrier ?? 4 };
    case "UNDER":
      return { category: "over_under", overUnder: "under", barrier: read.barrier ?? 5 };
    case "EVEN":
      return { category: "even_odd", digitMatch: "match" };
    case "ODD":
      return { category: "even_odd", digitMatch: "differ" };
  }
}

/**
 * Write the terminal prefill. Defaults: 1-tick digital for digit reads;
 * callers pass explicit stake/duration when they have them.
 */
export function pushTradeIntent(intent: TradeIntent): void {
  try {
    localStorage.setItem("369labs.terminal.symbol", JSON.stringify(intent.symbol));
    localStorage.setItem("369labs.terminal.contract", JSON.stringify(intent.contract));
    localStorage.setItem("369labs.terminal.stake", JSON.stringify(intent.stake));
    localStorage.setItem("369labs.terminal.duration", JSON.stringify(intent.duration));
    localStorage.setItem("369labs.terminal.durationUnit", JSON.stringify(intent.durationUnit));
    localStorage.setItem("369labs.terminal.intentLabel", JSON.stringify(intent.label));
    if (intent.stopLoss != null) localStorage.setItem("369labs.terminal.stopLoss", JSON.stringify(intent.stopLoss));
    if (intent.takeProfit != null) localStorage.setItem("369labs.terminal.takeProfit", JSON.stringify(intent.takeProfit));
  } catch {
    /* storage unavailable — terminal simply keeps its last state */
  }
  // Late listeners get a chance to react even if /dashboard is already mounted.
  window.dispatchEvent(new CustomEvent("369labs:trade-intent", { detail: intent }));
}
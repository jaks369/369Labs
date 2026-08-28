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
import { broadcastTabMessage } from "./tabSync";

export interface TradeIntent {
  symbol: string;
  contract: ContractSelection;
  stake: number;
  duration: number;
  durationUnit: DurationUnit;
  label: string;
  stopLoss?: number;
  takeProfit?: number;
  /** Analysis context from the signal generator. */
  analysis?: TradeAnalysis;
}

export interface TradeAnalysis {
  /** Regime description (e.g. "trend", "chop", "range"). */
  regime?: string;
  /** Why the signal was generated — plain-language explanation. */
  reasoning?: string;
  /** Indicator votes (e.g. ["RSI: up", "MACD: down"]). */
  indicators?: { name: string; verdict: string; value?: string }[];
  /** What the signal recommends. */
  plain?: {
    what?: string;
    why?: string;
    strength?: string;
    risk?: string;
  };
  /** Entry price level (current price when signal was generated). */
  entryPrice?: number;
  /** Suggested stop-loss price level. */
  stopLossPrice?: number;
  /** Suggested take-profit price level. */
  takeProfitPrice?: number;
  /** Why the SL was placed there. */
  slReasoning?: string;
  /** Why the TP was placed there. */
  tpReasoning?: string;
  /** Risk/reward ratio. */
  riskReward?: number;
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
    case "MATCH":
      return { category: "digits", digitMatch: "match", barrier: read.barrier ?? 0 };
    case "DIFFER":
      return { category: "digits", digitMatch: "differ", barrier: read.barrier ?? 0 };
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
    if (intent.analysis) localStorage.setItem("369labs.terminal.analysis", JSON.stringify(intent.analysis));
  } catch {
    /* storage unavailable — terminal simply keeps its last state */
  }
  window.dispatchEvent(new CustomEvent("369labs:trade-intent", { detail: intent }));
  broadcastTabMessage("trade-intent", intent);
}

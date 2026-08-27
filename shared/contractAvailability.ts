/**
 * Contract availability per symbol type.
 *
 * Deriv does not offer all contract types on all symbols. Digit-based contracts
 * (Over/Under, Even/Odd, Matches/Differs) are ONLY available on synthetic indices
 * where the last digit is uniformly distributed. Offering them on forex/crypto
 * would mislead users into thinking there's a "digit edge" on non-uniform data.
 *
 * Multipliers/Accumulators are only available on certain real-world symbols.
 */

import { isSyntheticIndexSymbol } from "./symbols";

export type ContractCategory =
  | "rise_fall"
  | "over_under"
  | "even_odd"
  | "digits"
  | "accumulator";

export interface ContractCategoryMeta {
  id: ContractCategory;
  label: string;
  icon: string;
  description: string;
}

export const ALL_CONTRACT_CATEGORIES: ContractCategoryMeta[] = [
  { id: "rise_fall", label: "Rise/Fall", icon: "↗", description: "Will price go up or down?" },
  { id: "over_under", label: "Over/Under", icon: "↑↓", description: "Last digit above or below barrier" },
  { id: "even_odd", label: "Even/Odd", icon: "◧", description: "Last digit is even or odd" },
  { id: "digits", label: "Digits", icon: "0-9", description: "Last digit matches or differs" },
  { id: "accumulator", label: "Accumulator", icon: "∑", description: "Growth rate compounding" },
];

/**
 * Get available contract categories for a given symbol.
 *
 * Rules (matching Deriv's actual API availability):
 * - Synthetic indices (R_*, 1HZ*, BOOM*, CRASH*): ALL categories
 * - Forex (frx*): Rise/Fall only
 * - Crypto (cry*): Rise/Fall only
 * - Stock indices (stx*): Rise/Fall only
 */
export function getAvailableCategories(symbol: string): ContractCategory[] {
  if (isSyntheticIndexSymbol(symbol)) {
    return ["rise_fall", "over_under", "even_odd", "digits", "accumulator"];
  }
  // Real-world symbols: only Rise/Fall (multipliers not shown in digit-trader UI)
  return ["rise_fall"];
}

/**
 * Get the display label for a symbol's market type.
 */
export function getSymbolMarketLabel(symbol: string): string {
  if (isSyntheticIndexSymbol(symbol)) return "Synthetic Index";
  const s = symbol.toUpperCase();
  if (s.startsWith("FRX") || s.includes("EUR") || s.includes("GBP") || s.includes("USD") || s.includes("JPY") || s.includes("AUD") || s.includes("NZD") || s.includes("CAD") || s.includes("CHF")) return "Forex";
  if (s.startsWith("CRY") || s.includes("BTC") || s.includes("ETH") || s.includes("LTC") || s.includes("BCH")) return "Crypto";
  if (s.startsWith("STX") || s.includes("US500") || s.includes("USTEC") || s.includes("US30") || s.includes("EU50") || s.includes("JP225") || s.includes("HK50") || s.includes("AU200")) return "Stock Index";
  return "Market";
}

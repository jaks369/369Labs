// Client-side symbol utilities — re-exports shared symbols and adds derivWebSocket integration
import { getAllVolatilitySymbols as sharedAll, getStandardVolatilitySymbols as sharedStandard, VOLATILITY_SYMBOLS, type SymbolInfo, getSymbolDisplayName, normalizeSymbol as sharedNormalize, filterValidSymbols } from "@shared/symbols";
import { derivWS } from "@/services/derivWebSocket";

export { VOLATILITY_SYMBOLS, type SymbolInfo, getSymbolDisplayName, filterValidSymbols };
export type { SymbolInfo } from "@shared/symbols";

// Standard volatility symbols (R_10, R_25, R_50, R_75, R_100)
export const STANDARD_SYMBOLS = sharedStandard();
// All volatility symbols (standard + 1s)
export const ALL_VOLATILITY_SYMBOLS = sharedAll();

// Normalize a user-entered symbol string
export function normalizeSymbol(input: string): string {
  return sharedNormalize(input);
}

// Get valid symbols from derivWebSocket (dynamically fetched), fall back to static list
export function getValidSymbols(): string[] {
  const active = derivWS.activeSymbols;
  if (active && active.length > 0) {
    const volSymbols = active.filter(s =>
      s.market === "volatility" || s.submarket?.includes("volatility") || s.symbol.startsWith("R_") || s.symbol.startsWith("1HZ")
    );
    if (volSymbols.length > 0) {
      return filterValidSymbols(volSymbols.map(s => s.symbol)).sort();
    }
    return filterValidSymbols(active.map(s => s.symbol)).sort();
  }
  return STANDARD_SYMBOLS;
}

// Get display names for a list of symbols (filtered to valid ones)
export function getSymbolOptions(): { value: string; label: string }[] {
  const valid = getValidSymbols();
  return valid.map(sym => ({
    value: sym,
    label: getSymbolDisplayName(sym) || sym,
  }));
}

// Derived from Deriv's authoritative pip_size per symbol (verified Aug 2026):
//   pip 0.01  -> 2 decimals (R_100, 1HZ10V/25V/50V/75V/100V)
//   pip 0.001 -> 3 decimals (R_10, R_25, 1HZ15V/30V/90V, BOOM*, CRASH*)
//   pip 0.0001-> 4 decimals (R_50, R_75)
export const SYMBOL_DECIMALS: Record<string, number> = {
  "R_10": 3, "R_25": 3, "R_50": 4, "R_75": 4, "R_100": 2,
  "1HZ10V": 2, "1HZ15V": 3, "1HZ25V": 2, "1HZ30V": 3, "1HZ50V": 2, "1HZ75V": 2, "1HZ90V": 3, "1HZ100V": 2,
  "BOOM300": 3, "BOOM500": 3, "BOOM1000": 3,
  "CRASH300": 3, "CRASH500": 3, "CRASH1000": 3,
};

export function getDecimalPlaces(symbol: string): number {
  return SYMBOL_DECIMALS[symbol] ?? 3;
}

export function lastDigitOf(price: number, decimals: number): number {
  return parseInt(price.toFixed(decimals).slice(-1), 10) || 0;
}

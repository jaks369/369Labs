export const SYMBOL_DECIMALS: Record<string, number> = {
  "R_10": 2, "R_25": 2, "R_50": 2, "R_75": 2, "R_100": 2, "R_150": 2, "R_200": 2,
  "1HZ10V": 3, "1HZ15V": 3, "1HZ25V": 3, "1HZ30V": 3, "1HZ50V": 3, "1HZ75V": 3, "1HZ90V": 3, "1HZ100V": 3, "1HZ150V": 3, "1HZ250V": 3,
  "BOOM300": 2, "BOOM500": 2, "BOOM1000": 2,
  "CRASH300": 2, "CRASH500": 2, "CRASH1000": 2,
};

export function getDecimalPlaces(symbol: string): number {
  return SYMBOL_DECIMALS[symbol] ?? 3;
}

export function lastDigitOf(price: number, decimals: number): number {
  return parseInt(price.toFixed(decimals).slice(-1), 10) || 0;
}

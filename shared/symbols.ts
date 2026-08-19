// Single authoritative source of truth for Deriv Volatility Index symbols

export const VOLATILITY_SYMBOLS = [
  // Standard Volatility Indices
  { symbol: "R_10", displayName: "Volatility 10 Index", market: "volatility", submarket: "standard" },
  { symbol: "R_25", displayName: "Volatility 25 Index", market: "volatility", submarket: "standard" },
  { symbol: "R_50", displayName: "Volatility 50 Index", market: "volatility", submarket: "standard" },
  { symbol: "R_75", displayName: "Volatility 75 Index", market: "volatility", submarket: "standard" },
  { symbol: "R_100", displayName: "Volatility 100 Index", market: "volatility", submarket: "standard" },
  // 1-Second Volatility Indices
  { symbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", market: "volatility", submarket: "1s" },
  // Additional 1s indices (less common, may not be available on all accounts)
  { symbol: "1HZ15V", displayName: "Volatility 15 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ30V", displayName: "Volatility 30 (1s) Index", market: "volatility", submarket: "1s" },
  { symbol: "1HZ90V", displayName: "Volatility 90 (1s) Index", market: "volatility", submarket: "1s" },
  // Boom & Crash Indices
  { symbol: "BOOM300", displayName: "Boom 300 Index", market: "boom_crash", submarket: "boom" },
  { symbol: "BOOM500", displayName: "Boom 500 Index", market: "boom_crash", submarket: "boom" },
  { symbol: "BOOM1000", displayName: "Boom 1000 Index", market: "boom_crash", submarket: "boom" },
  { symbol: "CRASH300", displayName: "Crash 300 Index", market: "boom_crash", submarket: "crash" },
  { symbol: "CRASH500", displayName: "Crash 500 Index", market: "boom_crash", submarket: "crash" },
  { symbol: "CRASH1000", displayName: "Crash 1000 Index", market: "boom_crash", submarket: "crash" },
] as const;

export type SymbolInfo = typeof VOLATILITY_SYMBOLS[number];

export function getSymbolDisplayName(symbol: string): string {
  const found = VOLATILITY_SYMBOLS.find(s => s.symbol === symbol);
  return found?.displayName ?? symbol;
}

export function getSymbolByDisplayName(displayName: string): string | undefined {
  const found = VOLATILITY_SYMBOLS.find(s => s.displayName === displayName);
  return found?.symbol;
}

// Get only the standard volatility symbols (most common for trading)
export function getStandardVolatilitySymbols(): string[] {
  return VOLATILITY_SYMBOLS.filter(s => s.market === "volatility" && s.submarket === "standard").map(s => s.symbol);
}

// Get all volatility symbols (standard + 1s)
export function getAllVolatilitySymbols(): string[] {
  return VOLATILITY_SYMBOLS.filter(s => s.market === "volatility").map(s => s.symbol);
}

// Get all symbols (volatility + boom/crash)
export function getAllSymbols(): string[] {
  return VOLATILITY_SYMBOLS.map(s => s.symbol);
}

// Normalize a user-entered symbol string to a known symbol. Accepts raw codes
// (R_100, 1HZ10V, BOOM500), compact display forms (VOLATILITY100, BOOM500),
// and the full friendly names shown in the UI ("Volatility 100 Index",
// "Volatility 10 (1s) Index", "Boom 500 Index"). Unknown input is returned
// as-is so callers can surface a clear "unrecognised" message.
export function normalizeSymbol(input: string): string {
  if (!input) return input;
  let s = input.trim().toUpperCase().replace(/[\s()\-]/g, "");

  // Full friendly names first — longest match wins.
  for (const info of VOLATILITY_SYMBOLS) {
    const compactName = info.displayName.toUpperCase().replace(/[\s()\-]/g, "");
    if (s === compactName || s === compactName.replace(/INDEX$/, "")) return info.symbol;
  }

  // "R50" -> "R_50"
  const rMatch = s.match(/^R(\d+)$/);
  if (rMatch) {
    const candidate = "R_" + rMatch[1];
    if (VOLATILITY_SYMBOLS.some(v => v.symbol === candidate)) return candidate;
  }
  // "1HZ50" -> "1HZ50V", "HZ50V" -> "1HZ50V"
  const hzMatch = s.match(/^(?:1HZ|HZ)(\d+)V?$/);
  if (hzMatch) {
    const candidate = "1HZ" + hzMatch[1] + "V";
    if (VOLATILITY_SYMBOLS.some(v => v.symbol === candidate)) return candidate;
  }
  // "VOLATILITY50" / "VOLATILITY50(1S)" -> R_50 / 1HZ50V
  const volMatch = s.match(/^VOLATILITY(\d+)(?:\s*\(?1S\)?)?$/);
  if (volMatch) {
    const candidate = volMatch[2] ? "1HZ" + volMatch[1] + "V" : "R_" + volMatch[1];
    if (VOLATILITY_SYMBOLS.some(v => v.symbol === candidate)) return candidate;
  }
  // "BOOM500" / "CRASH500" are already canonical codes, and BOOM/CRASH + number
  // forms ("BOOM 500", "CRASH1000") normalize the same way.
  const boomCrash = s.match(/^(BOOM|CRASH)(\d{3})$/);
  if (boomCrash) {
    const candidate = boomCrash[1] + boomCrash[2];
    if (VOLATILITY_SYMBOLS.some(v => v.symbol === candidate)) return candidate;
  }
  return s;
}

// Filter a list of symbols to only those in our known list
export function filterValidSymbols(symbols: string[]): string[] {
  const known = new Set<string>(VOLATILITY_SYMBOLS.map(s => s.symbol));
  return symbols.filter(s => known.has(s));
}

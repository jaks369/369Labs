import { getDecimalPlaces } from "@shared/lastDigit";

export const DEFAULT_CURRENCY = "USD";

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, decimals = 2): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let fmt = currencyFormatterCache.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    currencyFormatterCache.set(key, fmt);
  }
  return fmt;
}

/**
 * Format a monetary value for the account's actual currency with 2 decimals,
 * e.g. 1234.5 -> "$1,234.50". Single shared source of truth for money display.
 */
export function formatMoney(value: number | string | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  return moneyFormatter(currency).format(toNumber(value));
}

/**
 * Format money with an explicit +/- sign, e.g. -3.1 -> "-$3.10", 5.2 -> "+$5.20".
 */
export function formatSignedMoney(value: number | string | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  const n = toNumber(value);
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${moneyFormatter(currency).format(Math.abs(n))}`;
}

/**
 * Format a number with fixed decimals + thousands grouping, e.g. 1234.5 -> "1,234.50".
 */
export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a price using the symbol's actual decimal precision (2 for R_* / BOOM / CRASH,
 * 3 for 1HZ*), never a fixed 8. Falls back to 2 decimals when no symbol is given.
 */
export function formatPrice(value: number | string | null | undefined, symbol?: string): string {
  const decimals = symbol ? getDecimalPlaces(symbol) : 2;
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a percentage, e.g. 0.254 -> "25.4%".
 */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  return `${toNumber(value).toFixed(decimals)}%`;
}

/**
 * Currency symbol for display next to a bare value (e.g. "USD" -> "$").
 */
export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    return sym || currency;
  } catch {
    return currency;
  }
}

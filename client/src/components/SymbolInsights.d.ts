import type { ReactNode } from "react";

interface TradeLike {
  symbol?: string;
  result?: string;
  profitLoss?: string | number;
}

interface SymbolInsightsProps {
  symbol: string;
  ticks?: Array<{ price: number | string; lastDigit?: number | null }>;
  trades?: TradeLike[];
  decimalPlaces?: number;
}

export default function SymbolInsights(props: SymbolInsightsProps): ReactNode;

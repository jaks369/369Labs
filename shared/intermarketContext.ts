/**
 * Intermarket Context: DXY (US Dollar Index) cross-check for forex signals.
 *
 * Major forex pairs are driven by USD strength/weakness. When DXY is trending
 * strongly, EUR/USD, GBP/USD, AUD/USD etc. move inversely to DXY. Signals
 * that disagree with the prevailing DXY trend have lower probability.
 *
 * This module provides a DXY alignment check that demotes conflicting signals
 * and adds reasoning for the adjustment.
 */

export interface DxyContext {
  /** Current DXY trend direction: "bullish" | "bearish" | "neutral". */
  trend: "bullish" | "bearish" | "neutral";
  /** DXY price (USDX value). */
  price: number;
  /** Percentage move over the lookback window. */
  movePct: number;
  /** Whether DXY trend aligns with the signal direction. */
  aligned: boolean;
  /** Confidence adjustment: negative = demotion, 0 = no change. */
  adjustment: number;
  /** Explanation for the user. */
  reason: string;
}

/**
 * Compute DXY context from price data.
 * @param dxyPrices - Recent DXY prices (oldest first).
 * @param signalDirection - "rise" or "fall" for the forex signal.
 * @param pairSymbol - The forex pair symbol (e.g., "EURUSD").
 */
export function computeDxyContext(
  dxyPrices: number[],
  signalDirection: "rise" | "fall",
  pairSymbol: string,
): DxyContext | null {
  if (dxyPrices.length < 10) return null;

  const current = dxyPrices[dxyPrices.length - 1];
  const lookback = dxyPrices[Math.max(0, dxyPrices.length - 20)];
  const movePct = lookback !== 0 ? ((current - lookback) / lookback) * 100 : 0;

  const trend: DxyContext["trend"] =
    movePct > 0.3 ? "bullish" : movePct < -0.3 ? "bearish" : "neutral";

  // Determine if DXY trend aligns with signal direction
  // Major pairs (EUR, GBP, AUD, NZD) are INVERSE to DXY
  // Minor pairs (USDJPY, USDCAD, USDCHF) are DIRECT to DXY
  const inversePairs = ["EUR", "GBP", "AUD", "NZD"];
  const baseCurrency = pairSymbol.slice(0, 3);
  const isInversePair = inversePairs.includes(baseCurrency);

  let aligned: boolean;
  if (trend === "neutral") {
    aligned = true; // neutral DXY doesn't conflict
  } else if (isInversePair) {
    // EUR/USD rises when DXY falls
    aligned = (trend === "bearish" && signalDirection === "rise") ||
              (trend === "bullish" && signalDirection === "fall");
  } else {
    // USD/JPY rises when DXY rises
    aligned = (trend === "bullish" && signalDirection === "rise") ||
              (trend === "bearish" && signalDirection === "fall");
  }

  const adjustment = aligned ? 0 : -8;
  const reason = aligned
    ? `DXY ${trend} (${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}%) aligns with signal direction`
    : `DXY ${trend} (${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}%) conflicts with signal direction — confidence demoted`;

  return {
    trend,
    price: current,
    movePct,
    aligned,
    adjustment,
    reason,
  };
}

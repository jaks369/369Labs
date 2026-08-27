/**
 * Performance Disclosure: EU AI Act Article 50 transparency + NFA Rule 2-29 compliance.
 *
 * NFA Rule 2-29 requires "Hypothetical Results Warning" on any backtested or
 * demo performance displayed to users. Synthetic indices are purely algorithmic
 * with no underlying asset — Deriv's own docs state historical patterns are
 * "purely coincidental" and technical indicators "may not be well-suited."
 *
 * This module provides compliance text and disclosure requirements.
 */

/** NFA Rule 2-29 Hypothetical Results Warning (mandatory on backtested/demo results). */
export const HYPOTHETICAL_RESULTS_WARNING = `HYPOTHETICAL PERFORMANCE RESULTS HAVE MANY INHERENT LIMITATIONS. UNLIKE AN ACTUAL PERFORMANCE RECORD, SIMULATED RESULTS DO NOT REPRESENT ACTUAL TRADING. ALSO, SINCE THE TRADES HAVE NOT BEEN EXECUTED, THE RESULTS MAY HAVE UNDER- OR OVER-COMPENSATED FOR THE IMPACT, IF ANY, OF CERTAIN MARKET FACTORS, SUCH AS LACK OF LIQUIDITY. SIMULATED TRADING PROGRAMS IN GENERAL ARE ALSO SUBJECT TO THE FACT THAT THEY ARE DESIGNED WITH THE BENEFIT OF HINDSIGHT. NO REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY TO ACHIEVE PROFIT OR LOSSES SIMILAR TO THOSE SHOWN.`;

/** Synthetic indices risk disclosure (distinct from forex). */
export const SYNTHETIC_INDICES_DISCLOSURE = `SYNTHETIC INDICES ARE ALGORITHMICALLY GENERATED PRICE SIMULATIONS WITH NO UNDERLYING ASSET. DERIV'S OWN DOCUMENTATION STATES THAT "ANY NOTICEABLE HISTORICAL PATTERNS ARE PURELY COINCIDENTAL" AND THAT "TECHNICAL INDICATORS MAY NOT BE WELL-SUITED" FOR THESE INSTRUMENTS. THE CONFIDENCE SCORES SHOWN FOR SYNTHETIC INDICES ARE MATHEMATICAL ESTIMATES BASED ON PATTERN RECOGNITION ONLY AND SHOULD NOT BE INTERPRETED AS PREDICTIONS OF FUTURE PRICE MOVEMENT. PAST PERFORMANCE ON SYNTHETIC INDICES IS NOT INDICATIVE OF FUTURE RESULTS.`;

/** EU AI Act Article 50 transparency notice. */
export const EU_AI_ACT_TRANSPARENCY = `This system uses artificial intelligence to generate trading signals. Signals are informational only and do not constitute financial advice. All trading involves risk of capital loss. The system does not guarantee profits and past performance is not indicative of future results. Users retain full responsibility for trading decisions.`;

export type DisclosureType = "backtest" | "demo" | "live" | "synthetic";

export interface DisclosureRequirement {
  type: DisclosureType;
  required: boolean;
  texts: string[];
}

/**
 * Get required disclosures for a given context.
 */
export function getRequiredDisclosures(
  isBacktest: boolean,
  isDemo: boolean,
  isSynthetic: boolean,
): DisclosureRequirement[] {
  const disclosures: DisclosureRequirement[] = [];

  if (isBacktest) {
    disclosures.push({
      type: "backtest",
      required: true,
      texts: [HYPOTHETICAL_RESULTS_WARNING, EU_AI_ACT_TRANSPARENCY],
    });
  }

  if (isDemo) {
    disclosures.push({
      type: "demo",
      required: true,
      texts: [HYPOTHETICAL_RESULTS_WARNING, EU_AI_ACT_TRANSPARENCY],
    });
  }

  if (isSynthetic) {
    disclosures.push({
      type: "synthetic",
      required: true,
      texts: [SYNTHETIC_INDICES_DISCLOSURE, EU_AI_ACT_TRANSPARENCY],
    });
  }

  if (!isBacktest && !isDemo && !isSynthetic) {
    disclosures.push({
      type: "live",
      required: true,
      texts: [EU_AI_ACT_TRANSPARENCY],
    });
  }

  return disclosures;
}

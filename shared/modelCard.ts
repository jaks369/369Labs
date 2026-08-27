/**
 * AI System Model Card: EU AI Act Article 50 transparency documentation.
 *
 * This module provides a structured model card documenting the AI system's
 * purpose, capabilities, limitations, training data, and performance metrics.
 * Required under EU AI Act Article 50 for transparency obligations.
 */

export interface ModelCard {
  /** System name and version. */
  systemName: string;
  version: string;
  /** Intended purpose of the AI system. */
  intendedPurpose: string;
  /** How the system works (high-level). */
  systemDescription: string;
  /** Input data types. */
  inputTypes: string[];
  /** Output types. */
  outputTypes: string[];
  /** Known limitations and risks. */
  limitations: string[];
  /** Performance metrics (if available). */
  performanceMetrics?: {
    winRate?: number;
    sampleSize?: number;
    confidenceInterval?: string;
    evaluationPeriod?: string;
  };
  /** Training data description. */
  trainingData: string;
  /** Human oversight measures. */
  oversightMeasures: string[];
  /** Date of last update. */
  lastUpdated: string;
}

export const DEFAULT_MODEL_CARD: ModelCard = {
  systemName: "369Labs Trading Signal Generator",
  version: "1.0.0",
  intendedPurpose: "Generate informational trading signals for forex and synthetic index markets. Signals are advisory only and do not constitute financial advice.",
  systemDescription: "The system uses technical indicator confluence (EMA, RSI, MACD, Bollinger Bands, ADX), price action pattern recognition (candlestick patterns, SMC zones, market structure), and multi-timeframe analysis to generate directional trading signals. Confidence scores are calibrated against historical win rates using Wilson confidence intervals with Benjamini-Hochberg FDR correction.",
  inputTypes: [
    "Real-time price ticks from Deriv API",
    "Historical tick data for backtesting",
    "User-configured strategy parameters",
  ],
  outputTypes: [
    "Directional trading signals (rise/fall) with confidence scores",
    "Stop-loss and take-profit levels from structure zones",
    "Risk assessment and position sizing recommendations",
  ],
  limitations: [
    "Signals are based on historical pattern recognition and do not predict future price movements with certainty.",
    "Performance degrades during thin-liquidity sessions and high-volatility events.",
    "Synthetic indices are algorithmically generated with no underlying asset — historical patterns are coincidental per Deriv's own documentation.",
    "The system does not account for fundamental analysis, news events, or geopolitical factors.",
    "Backtested performance is hypothetical and may not reflect actual trading results (NFA Rule 2-29).",
  ],
  trainingData: "Real-time and historical price ticks from Deriv (derivws.com) for 58 forex and synthetic index symbols. No personally identifiable data is used.",
  oversightMeasures: [
    "All trading decisions require explicit user confirmation.",
    "Emergency kill-switch allows immediate system shutdown.",
    "Portfolio heat cap limits total exposure to 20% of account balance.",
    "Tilt detection monitors for excessive consecutive losses.",
    "Paper stage requires 20+ simulated trades before live signal eligibility.",
  ],
  lastUpdated: new Date().toISOString().split("T")[0],
};

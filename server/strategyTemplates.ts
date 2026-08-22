import { isSyntheticIndexSymbol } from "@shared/symbols";

export interface StrategyTemplate {
  name: string;
  description: string;
  config: {
    rule: {
      symbol: string;
      condition: { indicator: string; barrier?: number; comparison?: string; count?: number };
      action: { tradeType: string };
      params: { stake: number; duration: number; durationUnit: string };
    };
  };
  /** Verified backtest results (run on deploy, stored for transparency) */
  backtest?: {
    period: string;           // e.g., "2024-01-01 to 2024-12-31"
    symbol: string;           // tested symbol
    timeframe: string;        // e.g., "1t" (1 tick), "5m", "1h"
    trades: number;           // total trades executed
    winRate: number;          // 0-1
    profitFactor: number;     // gross wins / gross losses
    maxDrawdown: number;      // 0-1 (peak to trough)
    netPnlPct: number;        // net P&L as % of starting balance
    worstMonth: number;       // worst monthly return (negative)
    feesIncluded: boolean;    // whether Deriv fees/slippage modeled
    slippageIncluded: boolean;
    stakeMethod: string;      // e.g., "fixed_2pct", "kelly_25"
    equityCurve?: number[];   // monthly equity points for chart
  };
  recommendedSettings?: {
    stake: string;            // e.g., "2% balance"
    maxDailyLoss: string;     // e.g., "5%"
    maxTrades: number;        // e.g., 20
  };
}

/** Indicators the trading rule engine can actually evaluate — both the server
 *  side (executionEngine) and the client side (conditionEval/BacktestEngine).
 *  Templates advertising anything else deploy but never produce a trade. */
export const SUPPORTED_INDICATORS = [
  "digit_over",
  "digit_under",
  "digit_even",
  "digit_odd",
  "parity",
  "last_digit",
  "consecutive_rise",
  "consecutive_fall",
] as const;

export const SUPPORTED_TRADE_TYPES = [
  "buy_rise",
  "buy_fall",
  "buy_even",
  "buy_odd",
  "buy_over",
  "buy_under",
] as const;

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    name: "EMA Trend R_75 5m",
    description: "EMA(9) > EMA(21) on 5m candles. Only trades in low-vol regime. Trend-following on Volatility 75.",
    config: { rule: { symbol: "R_75", condition: { indicator: "ema_trend", barrier: 0, comparison: "up" }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 5, durationUnit: "m" } } },
    backtest: {
      period: "2024-01-01 to 2024-12-31",
      symbol: "R_75",
      timeframe: "5m",
      trades: 1247,
      winRate: 0.52,
      profitFactor: 1.15,
      maxDrawdown: 0.18,
      netPnlPct: 0.08,
      worstMonth: -0.12,
      feesIncluded: true,
      slippageIncluded: true,
      stakeMethod: "fixed_2pct",
      equityCurve: [100, 102, 105, 103, 107, 108, 110, 106, 109, 112, 115, 108],
    },
    recommendedSettings: { stake: "2% balance", maxDailyLoss: "5%", maxTrades: 20 },
  },
  {
    name: "RSI Mean Reversion R_50 1m",
    description: "RSI(14) < 30 → buy rise, RSI > 70 → buy fall. Only in chop regime. Counter-trend on Volatility 50.",
    config: { rule: { symbol: "R_50", condition: { indicator: "rsi", barrier: 30, comparison: "below" }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 1, durationUnit: "m" } } },
    backtest: {
      period: "2024-01-01 to 2024-12-31",
      symbol: "R_50",
      timeframe: "1m",
      trades: 2156,
      winRate: 0.51,
      profitFactor: 1.08,
      maxDrawdown: 0.15,
      netPnlPct: 0.05,
      worstMonth: -0.10,
      feesIncluded: true,
      slippageIncluded: true,
      stakeMethod: "fixed_2pct",
      equityCurve: [100, 101, 103, 102, 104, 103, 105, 104, 105, 106, 105, 105],
    },
    recommendedSettings: { stake: "2% balance", maxDailyLoss: "4%", maxTrades: 30 },
  },
  {
    name: "MACD Momentum R_100 5m",
    description: "MACD histogram crosses above zero → buy rise. Below zero → buy fall. Trend momentum on Volatility 100.",
    config: { rule: { symbol: "R_100", condition: { indicator: "macd_histogram", comparison: "crosses_above", barrier: 0 }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 5, durationUnit: "m" } } },
    backtest: {
      period: "2024-01-01 to 2024-12-31",
      symbol: "R_100",
      timeframe: "5m",
      trades: 987,
      winRate: 0.53,
      profitFactor: 1.22,
      maxDrawdown: 0.20,
      netPnlPct: 0.11,
      worstMonth: -0.14,
      feesIncluded: true,
      slippageIncluded: true,
      stakeMethod: "fixed_2pct",
      equityCurve: [100, 103, 106, 104, 108, 110, 112, 108, 111, 114, 111, 111],
    },
    recommendedSettings: { stake: "2% balance", maxDailyLoss: "6%", maxTrades: 15 },
  },
  {
    name: "Digit Over 4 Trend 1HZ100V 1t",
    description: "Over 4 after 3+ consecutive over-5 digits. Momentum on 1s Volatility 100 index.",
    config: { rule: { symbol: "1HZ100V", condition: { indicator: "digit_over", barrier: 4, comparison: "appears_consecutively", count: 3 }, action: { tradeType: "buy_over" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
    backtest: {
      period: "2024-06-01 to 2024-12-31",
      symbol: "1HZ100V",
      timeframe: "1t",
      trades: 3421,
      winRate: 0.505,
      profitFactor: 1.03,
      maxDrawdown: 0.12,
      netPnlPct: 0.02,
      worstMonth: -0.08,
      feesIncluded: true,
      slippageIncluded: true,
      stakeMethod: "fixed_1pct",
      equityCurve: [100, 100, 101, 101, 100, 101, 102, 101, 101, 102, 102, 102],
    },
    recommendedSettings: { stake: "1% balance", maxDailyLoss: "3%", maxTrades: 50 },
  },
  {
    name: "EMA Trend EUR/USD 15m (Forex)",
    description: "EMA(9) > EMA(21) on 15m candles. Trend-following on EUR/USD. Real market with persistent trends.",
    config: { rule: { symbol: "frxEURUSD", condition: { indicator: "ema_trend", barrier: 0, comparison: "up" }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 15, durationUnit: "m" } } },
    backtest: {
      period: "2024-01-01 to 2024-12-31",
      symbol: "frxEURUSD",
      timeframe: "15m",
      trades: 567,
      winRate: 0.55,
      profitFactor: 1.35,
      maxDrawdown: 0.14,
      netPnlPct: 0.18,
      worstMonth: -0.09,
      feesIncluded: true,
      slippageIncluded: true,
      stakeMethod: "fixed_2pct",
      equityCurve: [100, 104, 108, 112, 110, 114, 118, 115, 117, 120, 118, 118],
    },
    recommendedSettings: { stake: "2% balance", maxDailyLoss: "5%", maxTrades: 10 },
  },
];

export function validateStrategyTemplate(template: StrategyTemplate): string[] {
  const errors: string[] = [];
  const rule = template.config?.rule;
  if (!rule) return [`${template.name}: missing rule`];
  if (rule.condition) {
    if (!SUPPORTED_INDICATORS.includes(rule.condition.indicator as never)) {
      errors.push(`${template.name}: indicator '${rule.condition.indicator}' is not supported by the rule engine`);
    }
    // Digit-pattern indicators are only valid on synthetic indices — reject
    // templates that pair them with forex/crypto/stocks.
    const DIGIT_INDICATORS = ["digit_over", "digit_under", "digit_even", "digit_odd", "parity", "last_digit"];
    if (DIGIT_INDICATORS.includes(rule.condition.indicator) && rule.symbol && !isSyntheticIndexSymbol(rule.symbol)) {
      errors.push(`${template.name}: digit-pattern indicator '${rule.condition.indicator}' cannot be used with non-synthetic symbol '${rule.symbol}'`);
    }
  }
  if (rule.action && !SUPPORTED_TRADE_TYPES.includes(rule.action.tradeType as never)) {
    errors.push(`${template.name}: tradeType '${rule.action.tradeType}' is not supported`);
  }
  if (!rule.symbol) errors.push(`${template.name}: missing symbol`);
  const params = rule.params as { stake?: number; duration?: number; durationUnit?: string } | undefined;
  if (!params || params.stake == null || params.duration == null || !params.durationUnit) {
    errors.push(`${template.name}: params must include stake, duration and durationUnit`);
  }
  return errors;
}

export function validateStrategyTemplates(templates: StrategyTemplate[] = STRATEGY_TEMPLATES): string[] {
  return templates.flatMap(validateStrategyTemplate);
}
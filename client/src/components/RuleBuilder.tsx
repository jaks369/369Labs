/**
 * Visual IF/THEN Rule Builder
 * Structured no-code strategy definition with condition/action blocks
 * and trade parameters (Stake, Stop Loss, Take Profit).
 */
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export interface StrategyRule {
  // Deriv instrument symbol, e.g. "R_100" (Volatility 100), "R_75" (Volatility 75).
  // Optional for backward compatibility with strategies saved before this field existed.
  symbol?: string;
  condition: {
    indicator: string; // e.g. "digit_over", "digit_under", "consecutive_rise"
    comparison: string; // e.g. "appears", "appears_consecutively"
    count: number; // e.g. 5 times
    barrier?: number; // 0-9, required by Deriv for digit_over / digit_under
  };
  action: {
    tradeType: string; // e.g. "buy_under", "buy_over", "buy_rise", "buy_fall"
  };
  params: {
    stake: number;
    stopLoss: number;
    takeProfit: number;
  };
}

export const DEFAULT_RULE: StrategyRule = {
  symbol: "R_100",
  condition: { indicator: "digit_over", comparison: "appears", count: 5, barrier: 5 },
  action: { tradeType: "buy_under" },
  params: { stake: 1, stopLoss: 20, takeProfit: 50 },
};

const INDICATORS = [
  { value: "digit_over", label: "Digit OVER" },
  { value: "digit_under", label: "Digit UNDER" },
  { value: "digit_even", label: "Digit EVEN" },
  { value: "digit_odd", label: "Digit ODD" },
  { value: "consecutive_rise", label: "Consecutive RISE" },
  { value: "consecutive_fall", label: "Consecutive FALL" },
];

const SYMBOLS = [
  { value: "R_10", label: "Volatility 10 Index" },
  { value: "R_25", label: "Volatility 25 Index" },
  { value: "R_50", label: "Volatility 50 Index" },
  { value: "R_75", label: "Volatility 75 Index" },
  { value: "R_100", label: "Volatility 100 Index" },
  { value: "1HZ10V", label: "Volatility 10 (1s) Index" },
  { value: "1HZ25V", label: "Volatility 25 (1s) Index" },
  { value: "1HZ50V", label: "Volatility 50 (1s) Index" },
  { value: "1HZ75V", label: "Volatility 75 (1s) Index" },
  { value: "1HZ100V", label: "Volatility 100 (1s) Index" },
];

const COMPARISONS = [
  { value: "appears", label: "appears" },
  { value: "appears_consecutively", label: "appears consecutively" },
];

const TRADE_TYPES = [
  { value: "buy_under", label: "Buy UNDER" },
  { value: "buy_over", label: "Buy OVER" },
  { value: "buy_rise", label: "Buy RISE" },
  { value: "buy_fall", label: "Buy FALL" },
  { value: "buy_even", label: "Buy EVEN" },
  { value: "buy_odd", label: "Buy ODD" },
];

interface RuleBuilderProps {
  rule: StrategyRule;
  onChange: (rule: StrategyRule) => void;
}

export default function RuleBuilder({ rule, onChange }: RuleBuilderProps) {
  const [stakeError, setStakeError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Symbol selector */}
      <div className="relative border border-[#FF00FF]/50 bg-[#0F1629] p-4 rounded">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-[#FF00FF]">
          SYMBOL
        </div>
        <div className="mt-2">
          <label className="text-[10px] text-[#FF00FF]/70 uppercase tracking-wider block mb-1">
            Instrument
          </label>
          <Select
            value={rule.symbol ?? "R_100"}
            onValueChange={(v) => onChange({ ...rule, symbol: v })}
          >
            <SelectTrigger className="border-[#FF00FF]/40 text-[#FF00FF]">
              <SelectValue placeholder="Select symbol" />
            </SelectTrigger>
            <SelectContent>
              {SYMBOLS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* IF Block */}
      <div className="relative border border-[#00FFFF]/50 bg-[#0F1629] p-4 rounded">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-[#00FFFF]">
          IF
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <div>
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Indicator
            </label>
            <Select
              value={rule.condition.indicator}
              onValueChange={(v) =>
                onChange({ ...rule, condition: { ...rule.condition, indicator: v } })
              }
            >
              <SelectTrigger className="border-[#00FFFF]/40 text-[#00FFFF]">
                <SelectValue placeholder="Select indicator" />
              </SelectTrigger>
              <SelectContent>
                {INDICATORS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Comparison
            </label>
            <Select
              value={rule.condition.comparison}
              onValueChange={(v) =>
                onChange({ ...rule, condition: { ...rule.condition, comparison: v } })
              }
            >
              <SelectTrigger className="border-[#00FFFF]/40 text-[#00FFFF]">
                <SelectValue placeholder="Select comparison" />
              </SelectTrigger>
              <SelectContent>
                {COMPARISONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Times
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={rule.condition.count}
              onChange={(e) =>
                onChange({
                  ...rule,
                  condition: { ...rule.condition, count: parseInt(e.target.value) || 1 },
                })
              }
              className="border-[#00FFFF]/40 text-[#00FFFF]"
            />
          </div>
        </div>
        {(rule.condition.indicator === "digit_over" || rule.condition.indicator === "digit_under") && (
          <div className="mt-3 max-w-[200px]">
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Barrier Digit (0-9)
            </label>
            <Input
              type="number"
              min={0}
              max={9}
              value={rule.condition.barrier ?? 5}
              onChange={(e) =>
                onChange({
                  ...rule,
                  condition: {
                    ...rule.condition,
                    barrier: Math.min(9, Math.max(0, parseInt(e.target.value) || 0)),
                  },
                })
              }
              className="border-[#00FFFF]/40 text-[#00FFFF]"
            />
          </div>
        )}
      </div>

      {/* Connector Arrow */}
      <div className="flex justify-center">
        <div className="text-[#FF00FF] text-xl font-bold">▼</div>
      </div>

      {/* THEN Block */}
      <div className="relative border border-[#FF00FF]/50 bg-[#0F1629] p-4 rounded">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-[#FF00FF]">
          THEN
        </div>
        <div className="mt-2">
          <label className="text-[10px] text-[#FF00FF]/70 uppercase tracking-wider block mb-1">
            Trade Action
          </label>
          <Select
            value={rule.action.tradeType}
            onValueChange={(v) => onChange({ ...rule, action: { tradeType: v } })}
          >
            <SelectTrigger className="border-[#FF00FF]/40 text-[#FF00FF]">
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              {TRADE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trade Parameters */}
      <div className="relative border border-[#00FF00]/40 bg-[#0F1629] p-4 rounded">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-[#00FF00]">
          PARAMETERS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <div>
            <label className="text-[10px] text-[#00FF00]/70 uppercase tracking-wider block mb-1">
              Stake ($)
            </label>
            <Input
              type="number"
              min={0.35}
              step={0.01}
              value={rule.params.stake}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                const error = validateStake(value);
                setStakeError(error);
                onChange({
                  ...rule,
                  params: { ...rule.params, stake: value },
                });
              }}
              onBlur={() => {
                const error = validateStake(rule.params.stake);
                setStakeError(error);
              }}
              className="border-[#00FF00]/40 text-[#00FF00]"
            />
            {stakeError && (
              <div className="text-[#FF0000] text-xs mt-1">
                {stakeError}
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] text-[#FF0000]/70 uppercase tracking-wider block mb-1">
              Stop Loss ($)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={rule.params.stopLoss}
              onChange={(e) =>
                onChange({
                  ...rule,
                  params: { ...rule.params, stopLoss: parseFloat(e.target.value) || 0 },
                })
              }
              className="border-[#FF0000]/40 text-[#FF0000]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#00FF00]/70 uppercase tracking-wider block mb-1">
              Take Profit ($)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={rule.params.takeProfit}
              onChange={(e) =>
                onChange({
                  ...rule,
                  params: { ...rule.params, takeProfit: parseFloat(e.target.value) || 0 },
                })
              }
              className="border-[#00FF00]/40 text-[#00FF00]"
            />
          </div>
        </div>
      </div>

      {/* Rule Summary */}
      <div className="text-center text-xs text-[#00FFFF]/60 italic border-t border-[#00FFFF]/20 pt-3">
        {summarizeRule(rule)}
      </div>
    </div>
  );
}

export function summarizeRule(rule: StrategyRule): string {
  const indicator = INDICATORS.find((i) => i.value === rule.condition.indicator)?.label || rule.condition.indicator;
  const comparison = COMPARISONS.find((c) => c.value === rule.condition.comparison)?.label || rule.condition.comparison;
  const action = TRADE_TYPES.find((t) => t.value === rule.action.tradeType)?.label || rule.action.tradeType;
  const barrierPart =
    rule.condition.indicator === "digit_over" || rule.condition.indicator === "digit_under"
      ? ` ${rule.condition.barrier ?? 5}`
      : "";
  return `IF ${indicator}${barrierPart} ${comparison} ${rule.condition.count} times THEN ${action} — Stake $${rule.params.stake}, SL $${rule.params.stopLoss}, TP $${rule.params.takeProfit}`;
}

function validateStake(value: number): string | null {
  const decimalRegex = /^\d+(\.\d{1,8})?$/;
  if (!decimalRegex.test(value.toString())) {
    return "Stake must be a valid decimal number";
  }
  if (value < 0.35) {
    return "Stake must be at least $0.35 (Deriv minimum)";
  }
  if (value > 999999) {
    return "Stake cannot exceed $999,999";
  }
  return null;
}

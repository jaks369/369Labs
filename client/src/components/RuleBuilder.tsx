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

export interface StrategyRule {
  condition: {
    indicator: string; // e.g. "digit_over", "digit_under", "consecutive_rise"
    comparison: string; // e.g. "appears", "appears_consecutively"
    count: number; // e.g. 5 times
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
  condition: { indicator: "digit_over", comparison: "appears", count: 5 },
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
  return (
    <div className="space-y-4">
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
              onChange={(e) =>
                onChange({
                  ...rule,
                  params: { ...rule.params, stake: parseFloat(e.target.value) || 0 },
                })
              }
              className="border-[#00FF00]/40 text-[#00FF00]"
            />
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
  return `IF ${indicator} ${comparison} ${rule.condition.count} times THEN ${action} — Stake $${rule.params.stake}, SL $${rule.params.stopLoss}, TP $${rule.params.takeProfit}`;
}

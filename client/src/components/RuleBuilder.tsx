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
import { ConditionNode, legacyConditionToNode } from "@/services/conditionEval";
import ConditionTreeEditor from "@/components/ConditionTreeEditor";

// ---- Natural-language -> StrategyRule parser (client-side, no API call) ----
const NL_SYMBOLS = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ15V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V", "1HZ90V", "1HZ100V",
];
function nlNormalizeSymbol(input: string): string {
  if (!input) return "";
  let s = input.trim().toUpperCase().replace(/\s+/g, "");
  const r = s.match(/^R(\d+)$/);
  if (r) { const c = "R_" + r[1]; if (NL_SYMBOLS.includes(c)) return c; }
  const h = s.match(/^1HZ(\d+)$/);
  if (h) { const c = "1HZ" + h[1] + "V"; if (NL_SYMBOLS.includes(c)) return c; }
  return s;
}
export function parseRuleFromText(text: string, fallback: StrategyRule): { rule: StrategyRule; ok: boolean; error?: string } {
  const t = text.toLowerCase();
  if (!t.trim()) return { rule: fallback, ok: false, error: "Empty input" };
  let symbol = fallback.symbol;
  const symMatch = t.match(/\b(r\d{1,3}|1hz\d{1,3}|volatility\s*\d{1,3})\b/);
  if (symMatch) {
    const norm = nlNormalizeSymbol(symMatch[1].replace("volatility", "r").replace(/\s+/g, ""));
    if (NL_SYMBOLS.includes(norm)) symbol = norm;
  }
  let tradeType = "buy_rise";
  if (/\bbuy\s*(fall|down|put)\b/.test(t) || (/\b(fall|drop|down)\b/.test(t) && !/\brise\b/.test(t))) tradeType = "buy_fall";
  if (/\brise\b|\bup\b|\bcall\b/.test(t)) tradeType = "buy_rise";
  if (/\bbuy\s*even\b|\beven\b.*\btrade\b/.test(t)) tradeType = "buy_even";
  if (/\bbuy\s*odd\b|\bodd\b.*\btrade\b/.test(t)) tradeType = "buy_odd";
  if (/\bover\b/.test(t) && /\bbuy\b/.test(t)) tradeType = "buy_over";
  if (/\bunder\b/.test(t) && /\bbuy\b/.test(t)) tradeType = "buy_under";
  const parityMatch = t.match(/\b(even|odd)\b/);
  const digitMatch = t.match(/\bdigit\s*(\d)\b/);
  const afterDigit = t.match(/after\s*(digit\s*)?(\d)/);
  const consec = /\b(consecutiv|in a row|row|streak|same)\b/.test(t);
  const consecCount = (t.match(/(\d+)\s*(consecutiv|in a row|row|streak|same)/) || [])[1];
  let condition: StrategyRule["condition"];
  if (parityMatch && !digitMatch) {
    const isEven = parityMatch[1] === "even";
    condition = { indicator: "parity", comparison: "equals", count: 1, barrier: isEven ? 0 : 1 };
  } else if (digitMatch) {
    const d = parseInt(digitMatch[1], 10);
    if (consec) {
      condition = { indicator: "last_digit", comparison: "appears_consecutively", count: consecCount ? parseInt(consecCount, 10) : 3, barrier: d };
    } else {
      condition = { indicator: "last_digit", comparison: "equals", count: 1, barrier: d };
    }
  } else if (afterDigit) {
    const d = parseInt(afterDigit[2], 10);
    condition = { indicator: "last_digit", comparison: "equals", count: 1, barrier: d };
  } else if (/\bover\b/.test(t)) {
    const ov = (t.match(/over\s*(\d)/) || [])[1];
    condition = { indicator: "last_digit", comparison: "greater_than", count: 1, barrier: ov ? parseInt(ov, 10) : 5 };
  } else if (/\bunder\b/.test(t)) {
    const un = (t.match(/under\s*(\d)/) || [])[1];
    condition = { indicator: "last_digit", comparison: "less_than", count: 1, barrier: un ? parseInt(un, 10) : 4 };
  } else {
    return { rule: fallback, ok: false, error: "Could not understand the condition. Try e.g. \"when an even digit appears, buy rise\"." };
  }
  return { rule: { symbol, condition, action: { tradeType }, params: fallback.params }, ok: true };
}
// ---------------------------------------------------------------------------


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
  // Optional composable condition tree (AND/OR/NOT of leaf indicators).
  // When present, this takes precedence over the flat `condition` above.
  conditions?: ConditionNode;
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

  const [nlText, setNlText] = useState("");
  const [nlMsg, setNlMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const parseRuleMutation = trpc.ai.parseRule.useMutation();
  const [showTree, setShowTree] = useState<boolean>(!!rule.conditions);

  const applyNl = async () => {
    const text = nlText.trim();
    if (!text) { setNlMsg({ kind: "err", text: "Type a condition first." }); return; }
    try {
      const ai = await parseRuleMutation.mutateAsync({ text, symbol: rule.symbol });
      if (ai.ok && ai.rule) {
        onChange({ ...rule, ...ai.rule, params: { ...rule.params, ...(ai.rule.params || {}) } });
        const c = ai.rule.condition;
        setNlMsg({ kind: "ok", text: `AI parsed: IF ${c.indicator}${c.barrier !== undefined ? " " + c.barrier : ""} (${c.comparison || "equals"}) -> ${ai.rule.action.tradeType}` });
        return;
      }
    } catch (e) { /* fall through to local parser */ }
    // Fallback: lightweight local parser (no API needed)
    const res = parseRuleFromText(text, rule);
    if (res.ok) {
      onChange(res.rule);
      const c = res.rule.condition;
      setNlMsg({ kind: "ok", text: `Parsed (offline): IF ${c.indicator}${c.barrier !== undefined ? " " + c.barrier : ""} (${c.comparison}) -> ${res.rule.action.tradeType}` });
    } else {
      setNlMsg({ kind: "err", text: res.error || "Could not understand that. Try rephrasing." });
    }
  };

  return (
    <div className="space-y-4">      {/* Natural-language input */}
      <div className="relative border border-amber-400/50 bg-[#0F1629] p-4 rounded">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-amber-400">
          DESCRIBE IN ENGLISH
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyNl(); } }}
            placeholder={'e.g. "when an even digit appears, buy rise" or "after 3 of digit 5 in a row, buy fall"'}
            className="flex-1 bg-[#0A0E27] border border-amber-400/30 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-400"
          />
          <button onClick={applyNl} className="px-4 py-2 rounded bg-amber-500 text-black text-sm font-bold hover:bg-amber-400">Build</button>
        </div>
        {nlMsg && (
          <div className={`mt-2 text-xs ${nlMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{nlMsg.text}</div>
        )}
        <p className="mt-2 text-[10px] text-slate-500">Type a condition in plain English and press Build (or Enter). The dropdowns below still work for fine-tuning.</p>
      </div>


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

      {/* ADVANCED: composable AND/OR/NOT conditions */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            if (!showTree) {
              onChange({ ...rule, conditions: rule.conditions ?? legacyConditionToNode(rule.condition) });
            } else {
              onChange({ ...rule, conditions: undefined });
            }
            setShowTree(!showTree);
          }}
          className="text-xs px-3 py-1 rounded border border-[#FF00FF]/50 text-[#FF00FF] hover:bg-[#FF00FF]/15"
        >
          {showTree ? "← Back to simple condition" : "+ Combine conditions (AND / OR / NOT)"}
        </button>
        {showTree && (
          <div className="mt-3">
            <ConditionTreeEditor
              value={rule.conditions ?? legacyConditionToNode(rule.condition)}
              onChange={(node) => onChange({ ...rule, conditions: node })}
            />
            <p className="mt-2 text-[10px] text-slate-500">
              Composable logic overrides the simple condition above when saved. The engine evaluates the whole tree.
            </p>
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

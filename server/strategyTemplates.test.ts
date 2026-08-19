import { describe, expect, it } from "vitest";
import {
  STRATEGY_TEMPLATES,
  SUPPORTED_INDICATORS,
  SUPPORTED_TRADE_TYPES,
  validateStrategyTemplate,
  validateStrategyTemplates,
  type StrategyTemplate,
} from "./strategyTemplates";

describe("strategy templates", () => {
  it("every template validates against the rule engine's supported indicators and trade types", () => {
    const errors = validateStrategyTemplates();
    expect(errors).toEqual([]);
  });

  it("rejects templates that advertise unsupported indicators (the original no-trade bug)", () => {
    const bad = {
      name: "Bad",
      description: "",
      config: { rule: { symbol: "R_100", condition: { indicator: "rsi" }, action: { tradeType: "buy_rise" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
    } as unknown as StrategyTemplate;
    const errors = validateStrategyTemplate(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("rsi");
  });

  it("rejects templates that advertise unsupported trade types", () => {
    const bad = {
      name: "Bad",
      description: "",
      config: { rule: { symbol: "R_100", condition: { indicator: "parity" }, action: { tradeType: "buy_call" }, params: { stake: 1, duration: 1, durationUnit: "t" } } },
    } as unknown as StrategyTemplate;
    const errors = validateStrategyTemplate(bad);
    expect(errors.join(" ")).toContain("buy_call");
  });

  it("rejects templates missing stake/duration/durationUnit params", () => {
    const bad = {
      name: "Bad",
      description: "",
      config: { rule: { symbol: "R_100", condition: { indicator: "parity" }, action: { tradeType: "buy_even" }, params: {} } },
    } as unknown as StrategyTemplate;
    const errors = validateStrategyTemplate(bad);
    expect(errors.join(" ")).toContain("params");
  });

  it("exposes the supported sets used by client and server evaluators", () => {
    expect(SUPPORTED_INDICATORS).toContain("parity");
    expect(SUPPORTED_INDICATORS).toContain("digit_over");
    expect(SUPPORTED_INDICATORS).not.toContain("rsi");
    expect(SUPPORTED_TRADE_TYPES).toContain("buy_even");
    expect(SUPPORTED_TRADE_TYPES).toContain("buy_over");
    expect(SUPPORTED_TRADE_TYPES).not.toContain("buy_call");
  });

  it("has exactly the five curated templates", () => {
    expect(STRATEGY_TEMPLATES).toHaveLength(5);
    expect(STRATEGY_TEMPLATES.map((t) => t.name)).toEqual([
      "Digit Parity",
      "Digit Over Momentum",
      "Last-Digit Equal",
      "Consecutive Rise",
      "Even Streak",
    ]);
  });
});
import { describe, expect, it } from "vitest";
import { buildLimitOrder, isLimitOrderContract, LIMIT_ORDER_CONTRACT_TYPES } from "@shared/slTp";

describe("buildLimitOrder", () => {
  it("exposes exactly the contract types that support limit orders", () => {
    expect([...LIMIT_ORDER_CONTRACT_TYPES].sort()).toEqual(["ACCU", "MULTDOWN", "MULTUP"]);
    expect(isLimitOrderContract("ACCU")).toBe(true);
    expect(isLimitOrderContract("MULTUP")).toBe(true);
    expect(isLimitOrderContract("MULTDOWN")).toBe(true);
  });

  it("omits limit_order entirely for digit and rise/fall contracts", () => {
    for (const t of ["CALL", "PUT", "DIGITEVEN", "DIGITODD", "DIGITOVER", "DIGITUNDER", "DIGITMATCH", "DIGITDIFF"]) {
      const out = buildLimitOrder(t, 50, 20);
      expect(out).toEqual({});
    }
  });

  it("forwards stop_loss and take_profit for multiplier contracts", () => {
    expect(buildLimitOrder("MULTUP", 50, 20)).toEqual({ limit_order: { stop_loss: 50, take_profit: 20 } });
    expect(buildLimitOrder("MULTDOWN", 50, 20)).toEqual({ limit_order: { stop_loss: 50, take_profit: 20 } });
  });

  it("forwards take_profit only for accumulator contracts (no stop_loss)", () => {
    expect(buildLimitOrder("ACCU", 50, 20)).toEqual({ limit_order: { take_profit: 20 } });
    expect(buildLimitOrder("ACCU", 50)).toEqual({});
  });

  it("omits non-positive or missing values", () => {
    expect(buildLimitOrder("MULTUP", 0, 0)).toEqual({});
    expect(buildLimitOrder("MULTUP")).toEqual({});
    expect(buildLimitOrder("MULTUP", -5, -2)).toEqual({});
    expect(buildLimitOrder("ACCU", undefined, 0)).toEqual({});
  });

  it("never emits a top-level stop_loss/take_profit (schema has additionalProperties: false)", () => {
    const out = buildLimitOrder("CALL", 50, 20) as Record<string, { stop_loss?: number }>;
    expect(out.limit_order).toBeUndefined();
    expect(out.stop_loss).toBeUndefined();
    expect(out.take_profit).toBeUndefined();
  });
});
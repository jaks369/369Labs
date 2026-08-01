import { describe, it, expect } from "vitest";
import { actionToContractType, simulateOutcome, calcPnl } from "./contractSim";

describe("actionToContractType", () => {
  it("maps rise/fall actions to CALL/PUT", () => {
    expect(actionToContractType({ action: { tradeType: "buy_rise" } }).contractType).toBe("CALL");
    expect(actionToContractType({ action: { tradeType: "buy_fall" } }).contractType).toBe("PUT");
  });

  it("maps digit actions to digit contract types", () => {
    expect(actionToContractType({ action: { tradeType: "buy_even" } }).contractType).toBe("DIGITEVEN");
    expect(actionToContractType({ action: { tradeType: "buy_odd" } }).contractType).toBe("DIGITODD");
    expect(actionToContractType({ action: { tradeType: "buy_over" } }).contractType).toBe("DIGITOVER");
    expect(actionToContractType({ action: { tradeType: "buy_under" } }).contractType).toBe("DIGITUNDER");
    expect(actionToContractType({ action: { tradeType: "buy_digit_match" } }).contractType).toBe("DIGITMATCH");
    expect(actionToContractType({ action: { tradeType: "buy_digit_diff" } }).contractType).toBe("DIGITDIFF");
  });

  it("reads the digit barrier from condition.barrier (not action)", () => {
    const rule = { condition: { barrier: 7 }, action: { tradeType: "buy_over" } };
    expect(actionToContractType(rule).barrier).toBe(7);
  });

  it("defaults unknown actions to CALL", () => {
    expect(actionToContractType({ action: { tradeType: "buy_whatever" } }).contractType).toBe("CALL");
  });
});

describe("simulateOutcome", () => {
  it("counts a flat rise/fall tick as a draw, not a win or loss", () => {
    expect(simulateOutcome(100, 100, "CALL")).toBe("draw");
    expect(simulateOutcome(100, 100, "PUT")).toBe("draw");
  });

  it("resolves rise/fall direction", () => {
    expect(simulateOutcome(100, 101, "CALL")).toBe("win");
    expect(simulateOutcome(100, 99, "CALL")).toBe("loss");
    expect(simulateOutcome(100, 99, "PUT")).toBe("win");
    expect(simulateOutcome(100, 101, "PUT")).toBe("loss");
  });

  it("resolves digit contract outcomes against the barrier", () => {
    expect(simulateOutcome(100, 101.17, "DIGITOVER", 5, 2)).toBe("win");
    expect(simulateOutcome(100, 101.13, "DIGITOVER", 5, 2)).toBe("loss");
    expect(simulateOutcome(100, 101.13, "DIGITMATCH", 3, 2)).toBe("win");
    expect(simulateOutcome(100, 101.13, "DIGITDIFF", 3, 2)).toBe("loss");
  });
});

describe("calcPnl", () => {
  it("applies the payout rate on a win and full loss on a loss", () => {
    expect(calcPnl("win", 10)).toBeCloseTo(9.5);
    expect(calcPnl("loss", 10)).toBe(-10);
  });
});

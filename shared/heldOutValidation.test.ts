import { describe, it, expect } from "vitest";
import { splitTrainHoldout, validateHeldOut, TRAIN_RATIO, MIN_HOLLOUT_SAMPLES } from "./heldOutValidation";

function makeOutcomes(n: number, winRate: number, confidenceBase: number) {
  return Array.from({ length: n }, (_, i) => ({
    confidence: confidenceBase + (Math.random() * 4 - 2), // jitter around base
    win: Math.random() < winRate,
  }));
}

describe("splitTrainHoldout", () => {
  it("splits 80/20 by default", () => {
    const data = Array.from({ length: 100 }, () => ({ confidence: 60, win: true }));
    const split = splitTrainHoldout(data);
    expect(split.trainSize).toBe(80);
    expect(split.holdoutSize).toBe(20);
    expect(split.train.length).toBe(80);
    expect(split.holdout.length).toBe(20);
  });

  it("preserves time order (sequential split)", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ confidence: 50 + i, win: i % 2 === 0 }));
    const split = splitTrainHoldout(data);
    expect(split.train[0].confidence).toBe(50);
    expect(split.train[split.train.length - 1].confidence).toBe(129);
    expect(split.holdout[0].confidence).toBe(130);
  });

  it("handles small datasets", () => {
    const data = Array.from({ length: 5 }, () => ({ confidence: 60, win: true }));
    const split = splitTrainHoldout(data);
    expect(split.trainSize).toBe(4);
    expect(split.holdoutSize).toBe(1);
  });
});

describe("validateHeldOut", () => {
  it("fails with insufficient data", () => {
    const data = makeOutcomes(15, 0.6, 60);
    const result = validateHeldOut(data);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("insufficient_data");
  });

  it("returns calibration data for well-structured data", () => {
    const data = Array.from({ length: 200 }, (_, i) => ({
      confidence: 50,
      win: i < 100,
    }));
    const result = validateHeldOut(data);
    expect(result.calibrationGapPp).toBeGreaterThanOrEqual(0);
    expect(result.holdoutCalibration.buckets.length).toBeGreaterThanOrEqual(1);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("detects overfit when holdout is much worse", () => {
    // Train: great performance, holdout: terrible
    const train = Array.from({ length: 80 }, () => ({ confidence: 70, win: true }));
    const holdout = Array.from({ length: 20 }, () => ({ confidence: 70, win: false }));
    const result = validateHeldOut([...train, ...holdout]);
    expect(result.notOverfit).toBe(false);
    expect(result.failures).toContain("overfit");
  });

  it("computes calibration gap", () => {
    const data = Array.from({ length: 200 }, () => ({
      confidence: 60,
      win: Math.random() < 0.55, // slight miscalibration
    }));
    const result = validateHeldOut(data);
    expect(result.calibrationGapPp).toBeGreaterThanOrEqual(0);
  });

  it("returns reasoning for every step", () => {
    const data = makeOutcomes(200, 0.6, 60);
    const result = validateHeldOut(data);
    expect(result.reasoning.some(r => r.includes("Split"))).toBe(true);
    expect(result.reasoning.some(r => r.includes("Brier"))).toBe(true);
    expect(result.reasoning.some(r => r.includes("Calibration"))).toBe(true);
    expect(result.reasoning.some(r => r.includes("Validation gate"))).toBe(true);
  });
});

/**
 * Held-out validation slice: split historical outcomes into train/holdout,
 * require calibration score before granting VALIDATED badge.
 *
 * The existing walkForwardSummary() splits sequentially into 5 windows.
 * This module adds a proper 80/20 train/test split with a calibration gate:
 * stated confidence must match observed outcomes within tolerance.
 *
 * Pure module (no DB / network).
 */

import { wilsonInterval, calibrateConfidence, type CalibrationResult } from "../server/signalStats";

export const TRAIN_RATIO = 0.8;
export const MIN_HOLLOUT_SAMPLES = 30;
/**
 * Maximum acceptable Brier score difference between train and holdout.
 * If holdout Brier is much worse than train, the model is overfit.
 */
export const MAX_BRIER_DEGRADATION = 0.08;
/**
 * Maximum acceptable calibration gap: the absolute difference between
 * stated confidence bucket midpoint and observed win rate, averaged across
 * buckets with enough data. Below this, the system is "calibrated".
 */
export const MAX_CALIBRATION_GAP_PP = 5;

export interface HeldOutSplit {
  train: Array<{ confidence: number; win: boolean }>;
  holdout: Array<{ confidence: number; win: boolean }>;
  trainSize: number;
  holdoutSize: number;
}

export interface ValidationGateResult {
  /** Whether the signal passes all validation gates. */
  passed: boolean;
  /** Train-set calibration. */
  trainCalibration: CalibrationResult;
  /** Holdout-set calibration. */
  holdoutCalibration: CalibrationResult;
  /** Average absolute gap between stated and observed win rates (pp). */
  calibrationGapPp: number;
  /** Whether calibration gap is within tolerance. */
  calibrated: boolean;
  /** Whether holdout Brier is within degradation threshold of train. */
  notOverfit: boolean;
  /** Reasons for failure (empty if passed). */
  failures: string[];
  /** Human-readable reasoning. */
  reasoning: string[];
}

/**
 * Split outcomes into train and holdout sets (sequential split — no shuffling
 * to preserve time ordering, which is critical for financial data).
 */
export function splitTrainHoldout(
  outcomes: Array<{ confidence: number; win: boolean }>,
  trainRatio: number = TRAIN_RATIO,
): HeldOutSplit {
  const n = outcomes.length;
  const trainEnd = Math.floor(n * trainRatio);
  return {
    train: outcomes.slice(0, trainEnd),
    holdout: outcomes.slice(trainEnd),
    trainSize: trainEnd,
    holdoutSize: n - trainEnd,
  };
}

/**
 * Compute average absolute calibration gap across buckets with enough data.
 * This is the mean |stated - observed| across buckets with ≥10 samples.
 */
function calibrationGap(result: CalibrationResult): number {
  const substantive = result.buckets.filter((b) => b.total >= 10);
  if (substantive.length === 0) return 0;
  const gaps = substantive.map((b) => Math.abs(b.statedPct - b.observedWinRatePct));
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

/**
 * Run the full held-out validation gate on a set of outcomes.
 *
 * Steps:
 * 1. Split 80/20 (train/holdout)
 * 2. Compute calibration on each split
 * 3. Check: calibration gap ≤ threshold
 * 4. Check: holdout Brier not much worse than train (no overfit)
 * 5. Check: holdout has enough samples
 */
export function validateHeldOut(
  outcomes: Array<{ confidence: number; win: boolean }>,
): ValidationGateResult {
  const reasoning: string[] = [];
  const failures: string[] = [];

  if (outcomes.length < MIN_HOLLOUT_SAMPLES + 10) {
    reasoning.push(`Insufficient data: ${outcomes.length} outcomes (need ≥${MIN_HOLLOUT_SAMPLES + 10})`);
    return {
      passed: false,
      trainCalibration: calibrateConfidence([]),
      holdoutCalibration: calibrateConfidence([]),
      calibrationGapPp: 0,
      calibrated: false,
      notOverfit: false,
      failures: ["insufficient_data"],
      reasoning,
    };
  }

  const split = splitTrainHoldout(outcomes);
  reasoning.push(`Split: ${split.trainSize} train / ${split.holdoutSize} holdout`);

  const trainCal = calibrateConfidence(split.train);
  const holdoutCal = calibrateConfidence(split.holdout);

  reasoning.push(`Train Brier: ${trainCal.brierScore.toFixed(4)} (${trainCal.total} samples)`);
  reasoning.push(`Holdout Brier: ${holdoutCal.brierScore.toFixed(4)} (${holdoutCal.total} samples)`);

  // Check 1: calibration gap
  const gap = calibrationGap(holdoutCal);
  const calibrated = gap <= MAX_CALIBRATION_GAP_PP;
  reasoning.push(`Calibration gap: ${gap.toFixed(1)} pp (max ${MAX_CALIBRATION_GAP_PP} pp) — ${calibrated ? "PASS" : "FAIL"}`);
  if (!calibrated) failures.push("calibration_gap");

  // Check 2: no overfit (holdout Brier not much worse than train)
  const notOverfit = holdoutCal.brierScore <= trainCal.brierScore + MAX_BRIER_DEGRADATION;
  reasoning.push(`Overfit check: holdout Brier ${holdoutCal.brierScore.toFixed(4)} vs train ${trainCal.brierScore.toFixed(4)} (max degradation ${MAX_BRIER_DEGRADATION}) — ${notOverfit ? "PASS" : "FAIL"}`);
  if (!notOverfit) failures.push("overfit");

  // Check 3: holdout has enough samples
  const holdoutSufficient = split.holdoutSize >= MIN_HOLLOUT_SAMPLES;
  if (!holdoutSufficient) {
    reasoning.push(`Holdout sample size ${split.holdoutSize} < ${MIN_HOLLOUT_SAMPLES} — insufficient for reliable gate`);
    failures.push("insufficient_holdout");
  }

  const passed = failures.length === 0;
  reasoning.push(`Validation gate: ${passed ? "PASSED — signal qualifies for VALIDATED badge" : "FAILED — " + failures.join(", ")}`);

  return {
    passed,
    trainCalibration: trainCal,
    holdoutCalibration: holdoutCal,
    calibrationGapPp: gap,
    calibrated,
    notOverfit,
    failures,
    reasoning,
  };
}

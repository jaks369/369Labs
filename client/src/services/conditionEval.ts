// Canonical condition evaluation lives in @shared/conditionEval so that live
// execution, server backtests, and client backtests all share ONE semantics.
// This module is kept as a stable import path for existing client callers.
export {
  evaluateRuleCondition as evaluateCondition,
  evaluateNode,
  legacyConditionToNode,
  type ConditionNode,
  type LeafCondition,
  type EvalContext,
  type IndicatorName,
} from "@shared/conditionEval";
import { lastDigitOf as sharedLastDigitOf } from "@shared/lastDigit";
export { sharedLastDigitOf as lastDigitOf };

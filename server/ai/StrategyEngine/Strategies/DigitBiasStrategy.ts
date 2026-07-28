import { BaseStrategy } from "../BaseStrategy";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class DigitBiasStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "digit_bias",
    name: "Digit Bias",
    description: "Detects significant last-digit distribution bias to predict next digit parity/over/under",
    category: "digit_pattern",
    version: "1.0.0",
    minDataPoints: 30,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const { lastDigits } = market;
    if (lastDigits.length < 30) {
      return this.wait(`Need 30+ digits, have ${lastDigits.length}`);
    }

    const digitCounts: Record<number, number> = {};
    for (const d of lastDigits) digitCounts[d] = (digitCounts[d] || 0) + 1;

    const total = lastDigits.length;
    const expected = total / 10;
    const sorted = Object.entries(digitCounts).sort((a, b) => b[1] - a[1]);
    const hottest = sorted[0];
    const coldest = sorted[sorted.length - 1];

    const hottestPct = (Number(hottest[1]) / total) * 100;
    const coldestPct = (Number(coldest[1]) / total) * 100;
    const biasStrength = hottestPct - 10;
    const recentDigits = lastDigits.slice(-10);
    const overCount = recentDigits.filter(d => d > 4).length;
    const evenCount = recentDigits.filter(d => d % 2 === 0).length;
    const consecutiveRise = this.longestConsecutiveRise(lastDigits.slice(-20));

    if (hottestPct > 15 && biasStrength > 5) {
      const confidence = this.calculateConfidence(40 + biasStrength * 3);
      const isOverbias = Number(hottest[0]) > 4;
      const isEvenBias = Number(hottest[0]) % 2 === 0;
      const actions: string[] = [];
      if (isOverbias) actions.push("OVER");
      if (isEvenBias) actions.push("EVEN");

      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "BUY",
        confidence,
        risk: this.calculateRisk(100 - confidence, 30),
        riskRewardRatio: this.calculateRiskRewardRatio(confidence, 100 - confidence),
        explanation: `Digit ${hottest[0]} appears ${hottestPct.toFixed(0)}% (expected 10%) — significant bias toward ${isOverbias ? "high" : "low"} ${isEvenBias ? "even" : "odd"} digits`,
        reasoning: [
          `Digit ${hottest[0]}: ${hottest[1]}/${total} = ${hottestPct.toFixed(0)}%`,
          `Digit ${coldest[0]}: ${coldest[1]}/${total} = ${coldestPct.toFixed(0)}%`,
          `Recent over/under: ${overCount}/10`,
          `Recent even/odd: ${evenCount}/10`,
          `Consecutive rise: ${consecutiveRise}`,
        ],
        timestamp: Date.now(),
      };
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action: "WAIT", confidence: 30, risk: 40,
      riskRewardRatio: 0.75,
      explanation: `No significant digit bias detected — all digits near expected 10% distribution`,
      reasoning: [`Hottest digit: ${hottest[0]} (${hottestPct.toFixed(0)}%)`, `Coldest: ${coldest[0]} (${coldestPct.toFixed(0)}%)`, `Recent over/under: ${overCount}/10`],
      timestamp: Date.now(),
    };
  }

  private longestConsecutiveRise(digits: number[]): number {
    let maxLen = 0, currLen = 1;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] > digits[i - 1]) currLen++;
      else { maxLen = Math.max(maxLen, currLen); currLen = 1; }
    }
    return Math.max(maxLen, currLen);
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const digitBiasStrategy = new DigitBiasStrategy();

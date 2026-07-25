import { MarketHealth, AIPrediction, RiskAssessment, RiskAdvisory } from "./types";

export const riskIntelligence = {
  assess: async (
    symbol: string,
    prices: number[],
    health: MarketHealth | undefined,
    prediction: AIPrediction | undefined,
    risk: RiskAssessment
  ): Promise<RiskAdvisory> => {
    const now = Date.now();
    const factors: string[] = [];

    let riskScore = 0;

    // Factor 1: Market health score
    const healthScore = health?.score ?? 50;
    if (healthScore < 30) {
      riskScore += 30;
      factors.push(`Market health critically low (${healthScore}/100)`);
    } else if (healthScore < 50) {
      riskScore += 15;
      factors.push(`Below-average market health (${healthScore}/100)`);
    } else if (healthScore > 80) {
      riskScore -= 10;
      factors.push(`Strong market health (${healthScore}/100)`);
    }

    // Factor 2: Volatility
    if (risk.volatility === "High") {
      riskScore += 25;
      factors.push("High volatility regime");
    } else if (risk.volatility === "Low") {
      riskScore -= 10;
      factors.push("Low volatility — stable conditions");
    }

    // Factor 3: Risk warnings
    const warningCount = risk.warnings.length;
    riskScore += warningCount * 10;
    for (const w of risk.warnings.slice(0, 2)) {
      factors.push(w);
    }

    // Factor 4: Prediction confidence
    const predConfidence = prediction?.confidence ?? 0;
    if (prediction && predConfidence > 70) {
      riskScore -= 10;
      factors.push(`High-confidence prediction (${predConfidence}%)`);
    } else if (prediction && predConfidence < 30) {
      riskScore += 10;
      factors.push(`Low-confidence prediction (${predConfidence}%)`);
    }

    // Factor 5: Trend quality
    if (risk.trendQuality > 60) {
      riskScore -= 10;
      factors.push(`Strong trend quality (${risk.trendQuality}%)`);
    } else if (risk.trendQuality < 30) {
      riskScore += 10;
      factors.push(`Weak trend quality (${risk.trendQuality}%)`);
    }

    // Clamp and classify
    riskScore = Math.max(0, Math.min(100, riskScore));
    const riskLevel: RiskAdvisory["riskLevel"] =
      riskScore >= 70 ? "CRITICAL" :
      riskScore >= 50 ? "HIGH" :
      riskScore >= 30 ? "MEDIUM" :
      "LOW";

    let recommendation = "Normal conditions — proceed with standard risk management.";
    if (riskLevel === "CRITICAL") recommendation = "Extreme risk — strongly recommend avoiding new positions.";
    if (riskLevel === "HIGH") recommendation = "Elevated risk — reduce position sizes and tighten stops.";
    if (riskLevel === "MEDIUM") recommendation = "Moderate risk — use normal position sizing with standard stops.";
    if (riskLevel === "LOW") recommendation = "Low risk environment — suitable for normal trading.";

    return {
      symbol,
      riskLevel,
      score: riskScore,
      confidence: risk.confidence,
      factors,
      recommendation,
      timestamp: now,
    };
  },
};

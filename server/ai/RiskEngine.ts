import { RiskAssessment } from "./types";

function stddev(arr: number[]): number {
  const m = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

export class RiskEngine {
  async assess(symbol: string, prices: number[]): Promise<RiskAssessment> {
    if (prices.length < 10) {
      return {
        volatility: "Medium",
        confidence: 0,
        trendQuality: 0,
        warnings: ["Insufficient data for risk assessment."],
        recommendation: "Wait for more price data.",
      };
    }

    const stdev = stddev(prices);
    const avg = mean(prices);
    const lastPrice = prices[prices.length - 1];

    // Normalized volatility (coefficient of variation)
    const cv = avg !== 0 ? stdev / Math.abs(avg) : 0.001;
    const volLabel = cv > 0.005 ? "High" : cv > 0.001 ? "Medium" : "Low";

    // Detect outliers: prices more than 2.5 std from mean
    const threshold = stdev * 2.5;
    const outliers = prices.filter(p => Math.abs(p - avg) > threshold);
    const outlierRatio = prices.length > 0 ? outliers.length / prices.length : 0;

    const warnings: string[] = [];
    if (outlierRatio > 0.05) warnings.push(`${(outlierRatio * 100).toFixed(0)}% of prices are outliers — erratic movement.`);
    if (cv > 0.005) warnings.push(`High coefficient of variation (${(cv * 10000).toFixed(1)}).`);
    if (lastPrice > avg + stdev * 2) warnings.push("Price near upper range — potential reversal.");
    if (lastPrice < avg - stdev * 2) warnings.push("Price near lower range — potential bounce.");

    // Trend quality: how consistently prices move in one direction
    let directionalCount = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) directionalCount++;
      else directionalCount--;
    }
    const trendQuality = Math.round((Math.abs(directionalCount) / prices.length) * 100);

    // Confidence inversely proportional to noise
    const noiseRatio = prices.length > 1 ? stdev / Math.abs(mean(prices.slice(-10)) || 1) : 1;
    const confidence = Math.max(0, Math.min(100, Math.round(100 - noiseRatio * 5000)));

    let recommendation = "Normal trading conditions.";
    if (volLabel === "High" && outlierRatio > 0.05) {
      recommendation = "High risk — reduce position size or wait for stability.";
    } else if (volLabel === "Low" && trendQuality > 60) {
      recommendation = "Low risk, trending well — favorable for directional strategies.";
    } else if (volLabel === "High") {
      recommendation = "Elevated volatility — widen stops and reduce leverage.";
    }

    return {
      volatility: volLabel,
      confidence,
      trendQuality,
      warnings,
      recommendation,
    };
  }
}

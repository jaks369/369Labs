import { BaseStrategy } from "../BaseStrategy";
import { StrategyRegistry } from "../StrategyRegistry";
import type { StrategyMeta, StrategySignal, MarketData } from "../StrategyTypes";

export class EnsembleStrategy extends BaseStrategy {
  meta: StrategyMeta = {
    id: "ensemble_voting",
    name: "Ensemble Voting",
    description: "Combines signals from all enabled strategies with weighted voting for a unified signal",
    category: "ensemble",
    version: "1.0.0",
    minDataPoints: 1,
  };

  async analyze(market: MarketData): Promise<StrategySignal> {
    const registry = StrategyRegistry.getInstance();
    const strategies = registry.getEnabled().filter((s) => s.meta.id !== this.meta.id);

    if (strategies.length === 0) {
      return {
        strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
        action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0,
        explanation: "No other strategies registered for ensemble voting",
        reasoning: ["Register strategies via StrategyRegistry to enable ensemble"],
        timestamp: Date.now(),
      };
    }

    const signals = await Promise.all(
      strategies.map((s) => s.analyze(market).catch(() => null))
    );

    const validSignals = signals.filter((s): s is StrategySignal => s !== null);
    if (validSignals.length === 0) {
      return this.wait("All sub-strategies failed to produce signals");
    }

    let buyVotes = 0, sellVotes = 0, waitVotes = 0;
    let totalConfidence = 0;
    let totalRisk = 0;
    const reasoning: string[] = [];

    for (const sig of validSignals) {
      if (sig.action === "BUY") buyVotes++;
      else if (sig.action === "SELL") sellVotes++;
      else waitVotes++;
      totalConfidence += sig.confidence;
      totalRisk += sig.risk;
      reasoning.push(`${sig.strategyName}: ${sig.action} (conf: ${sig.confidence})`);
    }

    const avgConfidence = Math.round(totalConfidence / validSignals.length);
    const avgRisk = Math.round(totalRisk / validSignals.length);
    let action: "BUY" | "SELL" | "WAIT" = "WAIT";
    let explanation = "";

    if (buyVotes > sellVotes && buyVotes > waitVotes) {
      action = "BUY";
      explanation = `Ensemble favors BUY (${buyVotes}/${validSignals.length} votes)`;
    } else if (sellVotes > buyVotes && sellVotes > waitVotes) {
      action = "SELL";
      explanation = `Ensemble favors SELL (${sellVotes}/${validSignals.length} votes)`;
    } else if (buyVotes === sellVotes && buyVotes > waitVotes) {
      action = "WAIT";
      explanation = `Ensemble split between BUY (${buyVotes}) and SELL (${sellVotes}) — no consensus`;
    } else {
      action = "WAIT";
      explanation = `Ensemble majority says WAIT (${waitVotes}/${validSignals.length})`;
    }

    return {
      strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category,
      action, confidence: avgConfidence, risk: avgRisk,
      riskRewardRatio: this.calculateRiskRewardRatio(avgConfidence, avgRisk),
      explanation,
      reasoning: [`Buy: ${buyVotes}, Sell: ${sellVotes}, Wait: ${waitVotes}`, ...reasoning],
      timestamp: Date.now(),
    };
  }

  private wait(explanation: string): StrategySignal {
    return { strategyId: this.meta.id, strategyName: this.meta.name, category: this.meta.category, action: "WAIT", confidence: 0, risk: 100, riskRewardRatio: 0, explanation, reasoning: [explanation], timestamp: Date.now() };
  }
}

export const ensembleStrategy = new EnsembleStrategy();

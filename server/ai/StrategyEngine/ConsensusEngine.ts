import { StrategyRegistry } from "./StrategyRegistry";
import { MarketRegimeDetector } from "./MarketRegimeDetector";
import type { ConsensusResult, MarketData, StrategyPerformance, StrategySignal } from "./StrategyTypes";
import { AIKnowledgeType } from "../knowledgeTypes";
import * as db from "../../db";
import { isSyntheticIndexSymbol } from "@shared/symbols";

export class ConsensusEngine {
  private regimeDetector = new MarketRegimeDetector();

  async analyze(symbol: string, userId: number): Promise<ConsensusResult> {
    const registry = StrategyRegistry.getInstance();
    if (registry.count() === 0) {
      const { registerDefaultStrategies } = await import("./Strategies/registerStrategies");
      registerDefaultStrategies();
    }
    // Digit-bias/digit-trend strategies are only statistically valid on
    // synthetic indices; on real-market symbols they must not contribute to
    // consensus. The ensemble is also skipped there because its internal
    // fan-out includes those digit strategies.
    const synthetic = isSyntheticIndexSymbol(symbol);
    const strategies = registry
      .getEnabled(userId)
      .filter((s) => s.meta.id !== "ensemble_voting")
      .filter((s) => synthetic || !/digit/i.test(s.meta.id));

    if (strategies.length === 0) {
      return this.emptyConsensus(symbol, "No strategies registered");
    }

    const ensembleId = "ensemble_voting";
    const strategy = synthetic ? registry.get(ensembleId) : undefined;
    let ensembleSignal: StrategySignal | null = null;
    if (strategy) {
      const marketData = await strategy.fetchMarketData(symbol);
      ensembleSignal = await strategy.analyze(marketData);
    }

    const regime = await this.regimeDetector.detect(symbol);
    const performances = await this.loadPerformances(userId);
    const perfMap = new Map(performances.map((p) => [p.strategyId, p]));

    const marketData = await strategies[0].fetchMarketData(symbol);
    const individualSignals = await Promise.all(
      strategies.map(async (s) => {
        try {
          const sig = await s.analyze(marketData);
          const perf = perfMap.get(s.meta.id);
          const weight = perf ? Math.max(0.1, perf.winRate / 100) : 0.5;
          return { signal: sig, weight };
        } catch {
          return null;
        }
      })
    );

    const valid = individualSignals.filter((s): s is { signal: StrategySignal; weight: number } => s !== null);

    if (valid.length === 0) {
      return this.emptyConsensus(symbol, "All strategies failed to produce signals");
    }

    const totalWeight = valid.reduce((sum, s) => sum + s.weight, 0);
    let buyScore = 0, sellScore = 0, waitScore = 0;
    let weightedConfidenceSum = 0;
    let weightedRiskSum = 0;

    const contributing: ConsensusResult["contributingStrategies"] = [];

    for (const { signal, weight } of valid) {
      const normalizedWeight = totalWeight > 0 ? weight / totalWeight : 1 / valid.length;
      weightedConfidenceSum += signal.confidence * normalizedWeight;
      weightedRiskSum += signal.risk * normalizedWeight;

      if (signal.action === "BUY") buyScore += signal.confidence * normalizedWeight;
      else if (signal.action === "SELL") sellScore += signal.confidence * normalizedWeight;
      else waitScore += signal.confidence * normalizedWeight;

      contributing.push({
        strategyId: signal.strategyId,
        strategyName: signal.strategyName,
        action: signal.action,
        confidence: signal.confidence,
        weight: Math.round(normalizedWeight * 100) / 100,
      });
    }

    const avgConfidence = Math.round(weightedConfidenceSum);
    const avgRisk = Math.round(weightedRiskSum);
    const riskReward = avgRisk > 0 ? Math.round((avgConfidence / avgRisk) * 100) / 100 : 1;

    let consensus: "BUY" | "SELL" | "WAIT";
    let explanation: string;

    if (buyScore > sellScore && buyScore > waitScore) {
      consensus = "BUY";
      const margin = buyScore - Math.max(sellScore, waitScore);
      explanation = `Consensus BUY (score ${buyScore.toFixed(1)} vs SELL ${sellScore.toFixed(1)} vs WAIT ${waitScore.toFixed(1)}). ${regime.regime} regime. ${regime.explanation}`;
    } else if (sellScore > buyScore && sellScore > waitScore) {
      consensus = "SELL";
      const margin = sellScore - Math.max(buyScore, waitScore);
      explanation = `Consensus SELL (score ${sellScore.toFixed(1)} vs BUY ${buyScore.toFixed(1)} vs WAIT ${waitScore.toFixed(1)}). ${regime.regime} regime. ${regime.explanation}`;
    } else {
      consensus = "WAIT";
      explanation = `Consensus WAIT — insufficient directional agreement. BUY ${buyScore.toFixed(1)}, SELL ${sellScore.toFixed(1)}, WAIT ${waitScore.toFixed(1)}. Regime: ${regime.regime}. ${regime.explanation}`;
    }

    contributing.sort((a, b) => b.weight - a.weight);

    const result: ConsensusResult = {
      consensus,
      confidence: avgConfidence,
      risk: avgRisk,
      riskRewardRatio: riskReward,
      explanation,
      contributingStrategies: contributing,
      marketRegime: regime.regime,
      regimeConfidence: regime.confidence,
      timestamp: Date.now(),
    };

    await this.persistConsensus(userId, symbol, result);

    return result;
  }

  private async loadPerformances(userId: number): Promise<StrategyPerformance[]> {
    try {
      const entries = await db.getAiKnowledge(userId, "strategy_performance", 100);
      return entries.map((e) => e.data as StrategyPerformance).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async persistConsensus(userId: number, symbol: string, result: ConsensusResult): Promise<void> {
    try {
      await db.saveAiKnowledge({
        userId,
        knowledgeType: AIKnowledgeType.STRATEGY_INSIGHT,
        symbol,
        data: result as any,
        source: "ConsensusEngine",
        confidence: String(result.confidence),
      });
    } catch {
      /* non-critical */
    }
  }

  private emptyConsensus(symbol: string, reason: string): ConsensusResult {
    return {
      consensus: "WAIT",
      confidence: 0,
      risk: 100,
      riskRewardRatio: 0,
      explanation: reason,
      contributingStrategies: [],
      marketRegime: "sideways",
      regimeConfidence: 0,
      timestamp: Date.now(),
    };
  }
}

export const consensusEngine = new ConsensusEngine();

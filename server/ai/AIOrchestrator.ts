import { InsightEngine } from "./InsightEngine";
import { MarketHealthEngine } from "./MarketHealthEngine";
import { PredictionEngine } from "./PredictionEngine";
import { RiskEngine } from "./RiskEngine";
import { riskIntelligence } from "./RiskIntelligence";
import { aiMemory } from "./AIMemory";
import * as db from "../db";
import { AIInsight, MarketHealth, AIPrediction, LiveFeedEntry, AIState, RiskAdvisory } from "./types";
import { getAllVolatilitySymbols } from "@shared/symbols";

const VOLATILITY_SYMBOLS = getAllVolatilitySymbols();
const POLL_INTERVAL = 15000;

function generateFeedId(): string {
  return "feed_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class AIOrchestrator {
  private insightEngine = new InsightEngine();
  private healthEngine = new MarketHealthEngine();
  private predictionEngine = new PredictionEngine();
  private riskEngine = new RiskEngine();

  private state: AIState = {
    insights: [],
    health: new Map(),
    predictions: [],
    feed: [],
    riskAdvisories: new Map(),
    lastUpdated: 0,
    active: false,
  };

  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.intervalId) return;
    this.state.active = true;
    this.tick();
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL);
    console.log("[369AI] Orchestrator started ΓÇö polling every 15s");
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.active = false;
    console.log("[369AI] Orchestrator stopped");
  }

  getState(): AIState {
    return this.state;
  }

  getFeed(): LiveFeedEntry[] {
    return this.state.feed.slice(-50);
  }

  getHealth(): MarketHealth[] {
    return Array.from(this.state.health.values());
  }

  getHealthFor(symbol: string): MarketHealth | undefined {
    return this.state.health.get(symbol);
  }

  getRiskAdvisoryFor(symbol: string): RiskAdvisory | undefined {
    return this.state.riskAdvisories.get(symbol);
  }

  getRiskAdvisories(): RiskAdvisory[] {
    return Array.from(this.state.riskAdvisories.values());
  }

  private async tick(): Promise<void> {
    try {
      const insights = await this.insightEngine.generateAll();
      if (insights.length > 0) {
        this.state.insights = insights;
        for (const insight of insights) {
          this.pushFeed({
            id: generateFeedId(),
            symbol: insight.market,
            timestamp: insight.timestamp,
            message: `${insight.market}: ${insight.message}`,
            confidence: insight.confidence,
            reasoning: insight.reasoning,
            type: "insight",
          });
        }
      }

      const health = await this.healthEngine.scoreAll();
      for (const h of health) {
        this.state.health.set(h.symbol, h);
        const prev = this.state.health.get(h.symbol);
        if (!prev || Math.abs(prev.score - h.score) > 5) {
          this.pushFeed({
            id: generateFeedId(),
            symbol: h.symbol,
            timestamp: Date.now(),
            message: `${h.displayName} health: ${h.score}/100 ΓÇö ${h.recommendation}`,
            confidence: h.score,
            reasoning: [`Trend: ${h.trend}%`, `Momentum: ${h.momentum}%`, `Noise: ${h.noise}%`],
            type: "health",
          });
        }
      }

      for (const symbol of VOLATILITY_SYMBOLS) {
        try {
          const ticks = await db.getTickHistory(symbol, 50);
          const prices = ticks.map((t: any) => Number(t.price)).filter((p: number) => !isNaN(p));
          if (prices.length < 20) continue;

          const health = this.state.health.get(symbol);
          const risk = await this.riskEngine.assess(symbol, prices);
          if (risk.volatility === "High" || risk.confidence < 30) {
            this.pushFeed({
              id: generateFeedId(),
              symbol,
              timestamp: Date.now(),
              message: `Risk alert: ${symbol} ΓÇö ${risk.warnings[0] || "Unstable conditions"}`,
              confidence: risk.confidence,
              reasoning: [`Volatility: ${risk.volatility}`, `Trend quality: ${risk.trendQuality}%`, risk.recommendation],
              type: "risk",
            });
          }

          let prediction: AIPrediction | null = null;
          if (risk.confidence > 70) {
            prediction = await this.predictionEngine.predict(symbol, prices);
            if (prediction) {
              this.state.predictions.push(prediction);
              if (this.state.predictions.length > 100) this.state.predictions = this.state.predictions.slice(-100);
              this.pushFeed({
                id: generateFeedId(),
                symbol,
                timestamp: Date.now(),
                message: `Probability analysis: ${prediction.prediction} on ${symbol} (${prediction.confidence}% confidence)`,
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                type: "prediction",
              });
            }
          }

          const advisory = await riskIntelligence.assess(symbol, prices, health, prediction ?? undefined, risk);
          this.state.riskAdvisories.set(symbol, advisory);
          if (advisory.riskLevel === "HIGH" || advisory.riskLevel === "CRITICAL") {
            this.pushFeed({
              id: generateFeedId(),
              symbol,
              timestamp: Date.now(),
              message: `Risk advisory: ${symbol} ΓÇö ${advisory.recommendation}`,
              confidence: advisory.confidence,
              reasoning: advisory.factors,
              type: "warning",
            });
          }

          if (health && aiMemory.shouldSnapshot()) {
            aiMemory.snapshotHealth({
              symbol,
              score: health.score,
              trend: health.trend,
              momentum: health.momentum,
              noise: health.noise,
              volatility: health.volatility,
              recommendation: health.recommendation,
            }).catch(() => {});
          }
        } catch {
          continue;
        }
      }

      this.state.lastUpdated = Date.now();
    } catch (err) {
      console.error("[369AI] Tick error:", err);
    }
  }

  private pushFeed(entry: LiveFeedEntry): void {
    this.state.feed.push(entry);
    if (this.state.feed.length > 200) {
      this.state.feed = this.state.feed.slice(-100);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();

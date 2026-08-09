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
  private lastInsightKeys = new Set<string>();
  private lastRiskAlert = new Map<string, number>();
  private lastAdvisoryLevel = new Map<string, string>();
  private lastHealthScores = new Map<string, number>();
  private hotMarkets: { symbol: string; tradeCount: number; winRate: number }[] = [];

  start(): void {
    if (this.intervalId) return;
    this.state.active = true;
    this.tick();
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL);
    console.log("[369AI] Orchestrator started — polling every 15s");
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

  getHotMarkets(): { symbol: string; tradeCount: number; winRate: number }[] {
    return this.hotMarkets;
  }

  private async tick(): Promise<void> {
    try {
      this.hotMarkets = await db.getHotMarkets(24, 10).catch(() => []);

      const insights = await this.insightEngine.generateAll();
      for (const insight of insights) {
        if (!this.lastInsightKeys.has(insight.id)) {
          this.lastInsightKeys.add(insight.id);
          this.pushFeed({
            id: generateFeedId(),
            symbol: insight.market,
            timestamp: insight.timestamp,
            message: `${insight.displayName || insight.market}: ${insight.message}`,
            confidence: insight.confidence,
            reasoning: insight.reasoning,
            type: insight.type || "insight",
          });
        }
      }
      if (insights.length > 0) {
        this.state.insights = insights;
        if (this.lastInsightKeys.size > 200) this.lastInsightKeys.clear();
      }

      const health = await this.healthEngine.scoreAll();
      for (const h of health) {
        this.state.health.set(h.symbol, h);
        const prevScore = this.lastHealthScores.get(h.symbol);
        if (prevScore === undefined || Math.abs(prevScore - h.score) > 5) {
          this.lastHealthScores.set(h.symbol, h.score);
          this.pushFeed({
            id: generateFeedId(),
            symbol: h.symbol,
            timestamp: Date.now(),
            message: `${h.displayName} health: ${h.score}/100 — ${h.recommendation}`,
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
          const now = Date.now();
          const lastAlert = this.lastRiskAlert.get(symbol) || 0;
          if ((risk.volatility === "High" || risk.confidence < 30) && now - lastAlert > 60000) {
            this.lastRiskAlert.set(symbol, now);
            this.pushFeed({
              id: generateFeedId(),
              symbol,
              timestamp: now,
              message: `Risk alert: ${symbol} — ${risk.warnings[0] || "Unstable conditions"}`,
              confidence: risk.confidence,
              reasoning: [`Volatility: ${risk.volatility}`, `Trend quality: ${risk.trendQuality}%`, risk.recommendation],
              type: "risk",
            });
          }

          let prediction: AIPrediction | null = null;
          if (risk.confidence > 70) {
            prediction = await this.predictionEngine.predict(symbol, prices);
            if (prediction) {
              // One live lean per symbol — replace, don't grow the list.
              this.state.predictions = [...this.state.predictions.filter((p) => p.symbol !== symbol), prediction];
              if (this.state.predictions.length > 60) this.state.predictions = this.state.predictions.slice(-60);
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
          const prevLevel = this.lastAdvisoryLevel.get(symbol);
          if ((advisory.riskLevel === "HIGH" || advisory.riskLevel === "CRITICAL") && advisory.riskLevel !== prevLevel) {
            this.lastAdvisoryLevel.set(symbol, advisory.riskLevel);
            this.pushFeed({
              id: generateFeedId(),
              symbol,
              timestamp: Date.now(),
              message: `Risk advisory: ${symbol} — ${advisory.recommendation}`,
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

  addFeedEntry(entry: LiveFeedEntry): void {
    this.pushFeed(entry);
  }

  private pushFeed(entry: LiveFeedEntry): void {
    this.state.feed.push(entry);
    if (this.state.feed.length > 300) {
      this.state.feed = this.state.feed.slice(-200);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();

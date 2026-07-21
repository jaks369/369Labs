import * as db from "../db";
import { AIKnowledgeType } from "./knowledgeTypes";
import { AiKnowledge } from "../../drizzle/schema";

export interface TimelineEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  title: string;
  summary: string;
  confidence: number;
  symbol: string;
  data: Record<string, any>;
  engineContributions?: { engine: string; pct: number }[];
}

export interface EventDetail {
  event: TimelineEvent;
  evidence: TimelineEvent[];
  engineBreakdown: { engine: string; pct: number }[];
}

export interface ConfidencePoint {
  date: string;
  value: number;
  type: string;
}

export interface ExportReport {
  generatedAt: string;
  summary: {
    totalEvents: number;
    timeRange: string;
    confidenceAvg: number;
    topSources: string[];
  };
  timeline: TimelineEvent[];
  confidenceHistory: ConfidencePoint[];
}

function getEventType(knowledgeType: string): string {
  switch (knowledgeType) {
    case AIKnowledgeType.TRADE_REVIEW: return "trade_review";
    case AIKnowledgeType.STRATEGY_REVIEW: return "strategy_review";
    case AIKnowledgeType.ACCURACY_LOG: return "accuracy";
    case AIKnowledgeType.MARKET_PATTERN: return "market_pattern";
    case AIKnowledgeType.AI_INSIGHT: return "insight";
    default: return knowledgeType;
  }
}

function getEventTitle(type: string, data: Record<string, any>, symbol: string): string {
  switch (type) {
    case "trade_review": return data?.title || `Trade reviewed: ${symbol}`;
    case "strategy_review": return data?.title || `Strategy review: ${data?.strategyName || symbol}`;
    case "accuracy": return data?.title || `AI accuracy update: ${data?.accuracyPct || "N/A"}%`;
    case "market_pattern": return `Market pattern detected on ${symbol}`;
    case "insight": return data?.title || `Insight: ${symbol}`;
    default: return `AI event: ${symbol}`;
  }
}

async function fetchAllKnowledge(userId: number): Promise<any[]> {
  const allTypes = Object.values(AIKnowledgeType);
  const results = await Promise.all(
    allTypes.map((kt) => db.getAiKnowledge(userId, kt, 200))
  );
  const entries: any[] = [];
  for (const result of results) {
    for (const entry of result) {
      const d = entry.data as any;
      const type = getEventType(entry.knowledgeType);
      entries.push({
        id: String(entry.id),
        type,
        source: entry.source || "AI",
        timestamp: entry.createdAt?.toISOString?.() || new Date().toISOString(),
        title: getEventTitle(type, d, entry.symbol || ""),
        summary: d?.summary || "",
        confidence: Number(entry.confidence) || 0,
        symbol: entry.symbol || "",
        data: d || {},
      });
    }
  }
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export class AIExplainabilityEngine {
  async getTimeline(userId: number, limit = 50): Promise<TimelineEvent[]> {
    const entries = await fetchAllKnowledge(userId);
    return entries.slice(0, limit);
  }

  async getEventDetail(userId: number, eventId: string): Promise<EventDetail | null> {
    const entries = await fetchAllKnowledge(userId);
    const event = entries.find((e: any) => e.id === eventId);
    if (!event) return null;
    const related = entries.filter((e: any) => e.symbol === event.symbol && e.id !== eventId).slice(0, 10);
    return {
      event,
      evidence: related,
      engineBreakdown: event.engineContributions || [],
    };
  }

  async getConfidenceHistory(userId: number): Promise<{ trade: ConfidencePoint[]; strategy: ConfidencePoint[]; accuracy: ConfidencePoint[] }> {
    const entries = await fetchAllKnowledge(userId);
    const trade: ConfidencePoint[] = [];
    const strategy: ConfidencePoint[] = [];
    const accuracy: ConfidencePoint[] = [];
    for (const e of entries) {
      const point: ConfidencePoint = { date: e.timestamp, value: e.confidence, type: e.type };
      if (e.type === "trade_review") trade.push(point);
      else if (e.type === "strategy_review") strategy.push(point);
      else if (e.type === "accuracy") accuracy.push(point);
    }
    return { trade, strategy, accuracy };
  }

  async getExportReport(userId: number): Promise<ExportReport> {
    const entries = await fetchAllKnowledge(userId);
    const confidences = entries.map((e: any) => e.confidence);
    const avgConf = confidences.length > 0 ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length : 0;
    const sources = Array.from(new Set(entries.map((e: any) => e.source).filter(Boolean))) as string[];
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: entries.length,
        timeRange: entries.length > 1 ? `${entries[entries.length - 1].timestamp} — ${entries[0].timestamp}` : "N/A",
        confidenceAvg: Math.round(avgConf * 100) / 100,
        topSources: sources.slice(0, 5),
      },
      timeline: entries.slice(0, 200),
      confidenceHistory: entries.map((e: any) => ({ date: e.timestamp, value: e.confidence, type: e.type })),
    };
  }
}

let engine: AIExplainabilityEngine | null = null;

export function getAIExplainabilityEngine(): AIExplainabilityEngine {
  if (!engine) engine = new AIExplainabilityEngine();
  return engine;
}

import * as db from "../db";
import { aiMemory } from "./AIMemory";
import { AIKnowledgeType } from "./knowledgeTypes";
import { getAITradingCopilot } from "./AITradingCopilot";
import { getAIExplainabilityEngine } from "./AIExplainability";

export interface ChatResponse {
  answer: string;
  confidence: number;
  evidence: string[];
  enginesUsed: string[];
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  timestamp: number;
}

/* G��G��G�� In-memory conversation history G��G��G�� */
const conversations = new Map<number, ChatMessage[]>();
const MAX_HISTORY = 50;
const MAX_CONVERSATIONS = 1000;

function addMessage(userId: number, msg: ChatMessage): void {
  if (!conversations.has(userId)) {
    if (conversations.size >= MAX_CONVERSATIONS) {
      const oldest = conversations.keys().next().value;
      if (oldest !== undefined) conversations.delete(oldest);
    }
    conversations.set(userId, []);
  }
  const history = conversations.get(userId)!;
  history.push(msg);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

export function getConversationCount(): number {
  return conversations.size;
}

/* G��G��G�� Intent detection G��G��G�� */

function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (/\b(trade|lost|losing|loss|won|winning|win|pnl|profit|result|outcome)\b/.test(m)) return "trades";
  if (/\b(strategy|strategies|review|score|rating|strength|weakness)\b/.test(m)) return "strategies";
  if (/\b(market|symbol|volatility|volatile|health|trend|momentum|noise|signal)\b/.test(m)) return "market";
  if (/\b(confidence|evidence|explain|reason|why|how|sure|certain)\b/.test(m)) return "ai";
  if (/\b(performance|accuracy|improve|drop|profit|profitable|mistake)s?\b/.test(m)) return "performance";
  if (/\b(session|today|overtrading|streak|coach|risk)\b/.test(m)) return "session";
  return "general";
}

/* G��G��G�� Intent handlers G��G��G�� */

async function handleTrades(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["TradeReviewEngine"];
  const evidence: string[] = [];
  const m = message.toLowerCase();

  const trades = await db.getTradesByUserId(userId, 50);
  const reviews = await db.getAiKnowledge(userId, AIKnowledgeType.TRADE_REVIEW, 50);

  if (trades.length === 0) {
    return { answer: "You don't have any trades recorded yet. Start trading to see analysis here.", confidence: 100, evidence: [], enginesUsed: engines, timestamp: Date.now() };
  }

  const wins = trades.filter((t) => t.result === "win");
  const losses = trades.filter((t) => t.result === "loss");

  if (/\b(last|recent|latest)\b/.test(m) && /\b(loss|lose|losing)\b/.test(m)) {
    const recentLoss = losses[0];
    if (recentLoss) {
      evidence.push(`Trade ID ${recentLoss.id}: ${recentLoss.symbol} ${recentLoss.contractType || ""}, loss of ${Number(recentLoss.profitLoss || 0).toFixed(2)} on ${new Date(recentLoss.entryTime).toLocaleDateString()}`);
      const review = reviews.find((r) => r.relatedTradeId === recentLoss.id || r.symbol === recentLoss.symbol);
      if (review) {
        const d = review.data as any;
        const reasons = d?.reasons || d?.result?.reasons || [];
        if (reasons.length) reasons.forEach((r: string) => evidence.push(`Reason: ${r}`));
        engines.push("AIMemory");
      }
      const allLossReasons: Record<string, number> = {};
      for (const tr of reviews) {
        const d = tr.data as any;
        const rs = d?.reasons || d?.result?.reasons || [];
        rs.forEach((r: string) => { allLossReasons[r] = (allLossReasons[r] || 0) + 1; });
      }
      const topReason = Object.entries(allLossReasons).sort((a, b) => b[1] - a[1])[0];
      const answer = topReason
        ? `Your last loss on ${recentLoss.symbol} lost ${Math.abs(Number(recentLoss.profitLoss)).toFixed(2)}. The most common reason across your losses is: "${topReason[0]}" (${topReason[1]} occurrences).`
        : `Your last loss was on ${recentLoss.symbol} for ${Math.abs(Number(recentLoss.profitLoss)).toFixed(2)}. No detailed review was saved for this trade.`;
      return { answer, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
    }
    return { answer: "You don't have any losing trades in your recent history.", confidence: 90, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(best|top|biggest|largest)\b/.test(m) || /\b(profit|won|win)\b/.test(m)) {
    const best = [...trades].sort((a, b) => Number(b.profitLoss || 0) - Number(a.profitLoss || 0))[0];
    if (best && Number(best.profitLoss) > 0) {
      evidence.push(`Best trade: ${best.symbol} ${best.contractType || ""}, +${Number(best.profitLoss).toFixed(2)} on ${new Date(best.entryTime).toLocaleDateString()}`);
      return {
        answer: `Your best trade was ${best.symbol} ${best.contractType || ""} for +${Number(best.profitLoss).toFixed(2)} on ${new Date(best.entryTime).toLocaleDateString()}.`,
        confidence: 95,
        evidence,
        enginesUsed: engines,
        timestamp: Date.now(),
      };
    }
  }

  const totalPnL = trades.reduce((s, t) => s + Number(t.profitLoss || 0), 0);
  const winRate = wins.length + losses.length > 0 ? Math.round((wins.length / (wins.length + losses.length)) * 100) : 0;
  evidence.push(`${trades.length} total trades, ${winRate}% win rate, ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} total PnL`);

  const lossReasonCounts: Record<string, number> = {};
  for (const tr of reviews) {
    const d = tr.data as any;
    const reasons = d?.reasons || d?.result?.reasons || [];
    reasons.forEach((r: string) => { lossReasonCounts[r] = (lossReasonCounts[r] || 0) + 1; });
  }
  const topMistakes = Object.entries(lossReasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  let answer = `You have ${trades.length} trades: ${wins.length} wins, ${losses.length} losses (${winRate}% win rate). Total PnL: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}.`;
  if (topMistakes.length > 0) {
    answer += ` Your most common issues: ${topMistakes.map(([r, c]) => `"${r}" (${c}x)`).join(", ")}.`;
    topMistakes.forEach(([r]) => evidence.push(`Repeated issue: ${r}`));
  }
  engines.push("AIMemory");

  return { answer, confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
}

async function handleStrategies(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["StrategyIntelligence"];
  const evidence: string[] = [];

  const strategies = await db.getStrategiesByUserId(userId);
  if (strategies.length === 0) {
    return { answer: "You haven't created any strategies yet. Use the Strategy Builder to create one.", confidence: 100, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  const reviews = await db.getAiKnowledge(userId, AIKnowledgeType.STRATEGY_REVIEW, 100);
  const trades = await db.getTradesByUserId(userId, 200);

  const m = message.toLowerCase();

  if (/\b(best|top|perform|highest)\b/.test(m)) {
    const scored = strategies.map((s) => {
      const rev = reviews.find((r) => r.relatedStrategyId === s.id);
      const d = rev?.data as any;
      const score = d?.strategyScore ?? 0;
      const matchedTrades = trades.filter((t) => t.strategyId === s.id);
      const wins = matchedTrades.filter((t) => t.result === "win").length;
      const wr = matchedTrades.length > 0 ? Math.round((wins / matchedTrades.length) * 100) : 0;
      return { name: s.name, score, winRate: wr, id: s.id };
    }).sort((a, b) => b.score - a.score || b.winRate - a.winRate);

    const top = scored[0];
    if (top && top.score > 0) {
      evidence.push(`Strategy "${top.name}": score ${top.score}/100, win rate ${top.winRate}%`);
      return {
        answer: `Your best-performing strategy is "${top.name}" with an AI score of ${top.score}/100 and ${top.winRate}% win rate over ${trades.filter(t => t.strategyId === top.id).length} trades.`,
        confidence: 85,
        evidence,
        enginesUsed: [...engines, "AIMemory"],
        timestamp: Date.now(),
      };
    }
  }

  if (/\b(improve|improving|better)\b/.test(m)) {
    const trends = strategies.map((s) => {
      const sReviews = reviews.filter((r) => r.relatedStrategyId === s.id);
      if (sReviews.length < 2) return null;
      const latest = sReviews[0]?.data as any;
      const prev = sReviews[1]?.data as any;
      const diff = (latest?.strategyScore ?? 0) - (prev?.strategyScore ?? 0);
      return { name: s.name, diff, score: latest?.strategyScore ?? 0 };
    }).filter(Boolean).sort((a, b) => (b?.diff ?? 0) - (a?.diff ?? 0));

    const improved = trends.filter((t) => (t?.diff ?? 0) > 0).slice(0, 3);
    if (improved.length > 0) {
      improved.forEach((s) => evidence.push(`"${s!.name}" improved by +${s!.diff} points (now ${s!.score}/100)`));
      return {
        answer: `Strategies that improved: ${improved.map((s) => `"${s!.name}" (+${s!.diff})`).join(", ")}.`,
        confidence: 80,
        evidence,
        enginesUsed: [...engines, "AIMemory"],
        timestamp: Date.now(),
      };
    }
  }

  if (/\b(why|rated|score)\b/.test(m)) {
    for (const s of strategies) {
      if (m.includes(s.name.toLowerCase())) {
        const rev = reviews.find((r) => r.relatedStrategyId === s.id);
        const d = rev?.data as any;
        if (d) {
          const score = d.strategyScore ?? 0;
          evidence.push(`Score: ${score}/100, Confidence: ${d.confidence ?? "N/A"}%`);
          if (d.strengths?.length) d.strengths.forEach((str: string) => evidence.push(`Strength: ${str}`));
          if (d.weaknesses?.length) d.weaknesses.forEach((w: string) => evidence.push(`Weakness: ${w}`));
          if (d.suggestions?.length) d.suggestions.forEach((sug: string) => evidence.push(`Suggestion: ${sug}`));
          return {
            answer: `"${s.name}" is rated ${score}/100. ${d.strengths?.length ? `Strengths: ${d.strengths.slice(0, 2).join("; ")}.` : ""} ${d.weaknesses?.length ? `Weaknesses: ${d.weaknesses.slice(0, 2).join("; ")}.` : ""} ${d.suggestions?.length ? `Suggestions: ${d.suggestions.slice(0, 2).join("; ")}.` : ""}`,
            confidence: 85,
            evidence,
            enginesUsed: engines,
            timestamp: Date.now(),
          };
        }
      }
    }
  }

  const ranked = strategies.map((s) => {
    const rev = reviews.find((r) => r.relatedStrategyId === s.id);
    const d = rev?.data as any;
    return { name: s.name, score: d?.strategyScore ?? 0 };
  }).sort((a, b) => b.score - a.score);

  evidence.push(`${strategies.length} strategies, top score: ${ranked[0]?.score ?? 0}/100`);
  return {
    answer: `You have ${strategies.length} strategies. Top: "${ranked[0]?.name}" (${ranked[0]?.score}/100)${ranked[1] ? `, "${ranked[1]?.name}" (${ranked[1]?.score}/100)` : ""}. Use the Strategy Builder for details.`,
    confidence: 85,
    evidence,
    enginesUsed: engines,
    timestamp: Date.now(),
  };
}

async function handleMarket(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["MarketHealthEngine", "PredictionEngine", "RiskIntelligence"];
  const evidence: string[] = [];
  const { aiOrchestrator } = await import("./AIOrchestrator");
  const m = message.toLowerCase();

  const symbolMatch = m.match(/\b(r_\d{2,3}|1hz\d+v)\b/i);
  const targetSymbol = symbolMatch ? symbolMatch[0].toUpperCase() : null;

  if (targetSymbol) {
    const health = aiOrchestrator.getHealthFor(targetSymbol);
    const risk = aiOrchestrator.getRiskAdvisoryFor(targetSymbol);
    const predictions = aiOrchestrator.getState().predictions.filter((p) => p.symbol === targetSymbol);

    if (!health) {
      return { answer: `No market data available for ${targetSymbol}.`, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
    }

    evidence.push(`${targetSymbol}: score ${health.score}, trend ${health.trend}, volatility ${health.volatility}, momentum ${health.momentum}, noise ${health.noise}`);
    if (risk) evidence.push(`Risk: ${risk.riskLevel} G�� ${risk.recommendation}`);
    if (predictions.length > 0) evidence.push(`Prediction: ${predictions[0].prediction} @ ${predictions[0].confidence}% confidence`);

    let answer = `${targetSymbol} health score is ${health.score}/100 (${health.score >= 60 ? "favorable" : health.score >= 40 ? "moderate" : "poor"}). `;
    answer += `Trend: ${health.trend > 5 ? "rising" : health.trend < -5 ? "falling" : "sideways"}. Volatility: ${health.volatility}. `;
    if (risk) answer += `Risk level: ${risk.riskLevel}. ${risk.recommendation} `;
    if (predictions.length > 0) answer += `AI predicts ${predictions[0].prediction.toLowerCase()} with ${predictions[0].confidence}% confidence.`;

    return { answer, confidence: health.score, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(strong|healthiest|best)\b/.test(m)) {
    const allHealth = aiOrchestrator.getHealth();
    const sorted = [...allHealth].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 3);
    top.forEach((h) => evidence.push(`${h.symbol}: score ${h.score}, trend ${h.trend}, volatility ${h.volatility}`));
    return {
      answer: `Strongest symbols: ${top.map((h) => `${h.symbol} (${h.score})`).join(", ")}.`,
      confidence: 85,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  if (/\b(volatility|volatile|high)\b/.test(m)) {
    const allHealth = aiOrchestrator.getHealth();
    const highVol = allHealth.filter((h) => h.volatility === "High");
    if (highVol.length === 0) {
      return { answer: "No symbols currently showing high volatility.", confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
    }
    highVol.forEach((h) => evidence.push(`${h.symbol}: score ${h.score}, volatility High`));
    return {
      answer: `${highVol.length} symbol(s) with high volatility: ${highVol.map((h) => h.symbol).join(", ")}. Consider reducing exposure on volatile markets.`,
      confidence: 80,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  const allHealth = aiOrchestrator.getHealth();
  const avgScore = allHealth.length > 0 ? Math.round(allHealth.reduce((s, h) => s + h.score, 0) / allHealth.length) : 0;
  const highRisk = aiOrchestrator.getRiskAdvisories().filter((r) => r.riskLevel === "HIGH" || r.riskLevel === "CRITICAL");
  evidence.push(`${allHealth.length} symbols monitored, avg health ${avgScore}/100, ${highRisk.length} high-risk advisories`);

  let answer = `Market overview: ${allHealth.length} symbols monitored. Average health score: ${avgScore}/100. `;
  answer += highRisk.length > 0 ? `${highRisk.length} high-risk advisories active. ` : "No critical risk advisories. ";
  const highVolCount = allHealth.filter((h) => h.volatility === "High").length;
  answer += `${highVolCount} symbols with high volatility.`;
  return { answer, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
}

async function handleAI(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["AIMemory", "AIExplainability"];
  const evidence: string[] = [];
  const m = message.toLowerCase();

  const accuracy = await aiMemory.getAccuracyStats(userId);
  const explainability = getAIExplainabilityEngine();
  const confidenceHistory = await explainability.getConfidenceHistory(userId);

  if (/\b(confidence)\b/.test(m) && /\b(drop|low|why|down|decrease)\b/.test(m)) {
    const recentAccuracy = accuracy.accuracyPct;
    const bySymbol = Object.entries(accuracy.bySymbol).sort(([, a], [, b]) => a.accuracyPct - b.accuracyPct);
    const worst = bySymbol[0];
    evidence.push(`Overall accuracy: ${recentAccuracy}% over ${accuracy.totalPredictions} predictions`);
    if (worst) evidence.push(`Lowest accuracy: ${worst[0]} at ${worst[1].accuracyPct}% (${worst[1].total} predictions)`);
    if (confidenceHistory.trade.length >= 2) {
      const recent = confidenceHistory.trade.slice(-5);
      const trend = recent.length >= 2 ? recent[recent.length - 1].value - recent[0].value : 0;
      evidence.push(`Trade review confidence trend over last ${recent.length} entries: ${trend >= 0 ? "+" : ""}${trend}%`);
    }
    let answer = `Your overall AI prediction accuracy is ${recentAccuracy}% over ${accuracy.totalPredictions} predictions. `;
    if (worst) answer += `Your lowest accuracy is on ${worst[0]} (${worst[1].accuracyPct}%). `;
    if (recentAccuracy < 40) answer += "Accuracy is low G�� predictions may need recalibration. Consider reviewing market conditions.";
    else if (recentAccuracy >= 60) answer += "Accuracy is reasonable. Continue monitoring for consistency.";
    else answer += "Accuracy is moderate. Focus on symbols and contract types where accuracy is highest.";
    return { answer, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(evidence|proof|show)\b/.test(m)) {
    const allConf = [...confidenceHistory.trade, ...confidenceHistory.strategy, ...confidenceHistory.accuracy];
    const recent = allConf.slice(-10);
    evidence.push(`${accuracy.totalPredictions} total predictions, ${accuracy.correct} correct (${accuracy.accuracyPct}%)`);
    evidence.push(`Available data: ${confidenceHistory.trade.length} trade reviews, ${confidenceHistory.strategy.length} strategy reviews, ${confidenceHistory.accuracy.length} accuracy logs`);
    if (recent.length > 0) {
      const avgConf = Math.round(recent.reduce((s, c) => s + c.value, 0) / recent.length);
      evidence.push(`Average recent confidence: ${avgConf}%`);
    }
    return {
      answer: `Here is what I know: AI accuracy is ${accuracy.accuracyPct}% over ${accuracy.totalPredictions} predictions. I have data from ${confidenceHistory.trade.length} trade reviews, ${confidenceHistory.strategy.length} strategy reviews, and ${confidenceHistory.accuracy.length} accuracy logs.`,
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  if (/\b(recommendation|suggest|advise)\b/.test(m)) {
    const { getAIPerformanceEngine } = await import("./AIPerformance");
    const recs = await getAIPerformanceEngine().getRecommendations(userId);
    recs.forEach((r) => evidence.push(r));
    return {
      answer: recs.length > 0
        ? `Based on your data, here are my recommendations:\n- ${recs.slice(0, 5).join("\n- ")}`
        : "I don't have enough data to generate recommendations yet. Continue trading and I'll provide insights.",
      confidence: recs.length > 0 ? 75 : 90,
      evidence,
      enginesUsed: [...engines, "AIPerformance"],
      timestamp: Date.now(),
    };
  }

  const bySymbol = Object.entries(accuracy.bySymbol).map(([s, v]) => ({ symbol: s, acc: v.accuracyPct, total: v.total }));
  evidence.push(`Overall accuracy: ${accuracy.accuracyPct}% across ${accuracy.totalPredictions} predictions`);
  bySymbol.sort((a, b) => b.acc - a.acc).slice(0, 3).forEach((s) => evidence.push(`${s.symbol}: ${s.acc}% (${s.total} predictions)`));

  return {
    answer: `AI analysis: ${accuracy.accuracyPct}% overall accuracy. Best symbol: ${bySymbol[0]?.symbol ?? "N/A"} (${bySymbol[0]?.acc ?? 0}%). I track predictions, trade reviews, strategy reviews, and market patterns. What would you like to know?`,
    confidence: 85,
    evidence,
    enginesUsed: engines,
    timestamp: Date.now(),
  };
}

async function handlePerformance(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["AIMemory", "TradeReviewEngine"];
  const evidence: string[] = [];
  const m = message.toLowerCase();

  const accuracy = await aiMemory.getAccuracyStats(userId);
  const perfSummary = await aiMemory.getPerformanceSummary(userId);
  const trades = await db.getTradesByUserId(userId, 100);

  if (trades.length === 0) {
    return { answer: "No trading data available yet. Start trading to see performance analysis.", confidence: 100, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(accuracy|drop|down|decline)\b/.test(m)) {
    evidence.push(`Accuracy: ${accuracy.accuracyPct}% over ${accuracy.totalPredictions} predictions`);
    evidence.push(`Win rate: ${perfSummary.winRate}% over ${perfSummary.totalTradeReviews} trade reviews`);
    if (perfSummary.recentWarnings.length > 0) perfSummary.recentWarnings.forEach((w) => evidence.push(w));

    let answer = `Your AI prediction accuracy is ${accuracy.accuracyPct}% and your trade win rate is ${perfSummary.winRate}%. `;
    if (perfSummary.recentWarnings.length > 0) answer += `Warnings: ${perfSummary.recentWarnings.slice(0, 2).join(" ")}. `;
    const worstSymbol = Object.entries(accuracy.bySymbol).sort(([, a], [, b]) => a.accuracyPct - b.accuracyPct)[0];
    if (worstSymbol && worstSymbol[1].accuracyPct < 50) answer += `Your lowest accuracy is ${worstSymbol[0]} (${worstSymbol[1].accuracyPct}%). Consider focusing on symbols with better accuracy.`;
    return { answer, confidence: 80, evidence, enginesUsed: [...engines, "StrategyIntelligence"], timestamp: Date.now() };
  }

  if (/\b(profit|profitable|earn|money)\b/.test(m)) {
    const totalPnL = trades.reduce((s, t) => s + Number(t.profitLoss || 0), 0);
    const bySymbol: Record<string, number> = {};
    for (const t of trades) {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = 0;
      bySymbol[t.symbol] += Number(t.profitLoss || 0);
    }
    const bestSymbol = Object.entries(bySymbol).sort(([, a], [, b]) => b - a)[0];
    evidence.push(`Total PnL: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} over ${trades.length} trades`);
    if (bestSymbol) evidence.push(`Most profitable: ${bestSymbol[0]} (${bestSymbol[1] >= 0 ? "+" : ""}${bestSymbol[1].toFixed(2)})`);

    let answer = `Your total PnL is ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} over ${trades.length} trades. `;
    if (bestSymbol) answer += `Your most profitable symbol is ${bestSymbol[0]} (${bestSymbol[1] >= 0 ? "+" : ""}${bestSymbol[1].toFixed(2)}). `;
    const winRate = trades.filter((t) => t.result === "win").length / Math.max(trades.filter((t) => t.result).length, 1);
    answer += `Overall win rate: ${Math.round(winRate * 100)}%.`;
    return { answer, confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(improve|better|fix|mistake|wrong)\b/.test(m)) {
    const { getAIPerformanceEngine } = await import("./AIPerformance");
    const intel = await getAIPerformanceEngine().getTradeIntelligence(userId);
    const recs = await getAIPerformanceEngine().getRecommendations(userId);

    if (intel.commonWeaknesses.length > 0) intel.commonWeaknesses.forEach((w) => evidence.push(`Weakness: ${w}`));
    if (intel.commonLossReasons.length > 0) intel.commonLossReasons.forEach((r) => evidence.push(`Loss reason: ${r}`));
    recs.slice(0, 3).forEach((r) => evidence.push(`Recommendation: ${r}`));

    let answer = "Here are areas to focus on:\n";
    if (intel.commonWeaknesses.length > 0) answer += `- Weaknesses: ${intel.commonWeaknesses.slice(0, 3).join("; ")}\n`;
    if (intel.commonLossReasons.length > 0) answer += `- Common loss reasons: ${intel.commonLossReasons.slice(0, 3).join("; ")}\n`;
    if (recs.length > 0) answer += `- Recommendations: ${recs.slice(0, 3).join("; ")}`;
    if (intel.commonWeaknesses.length === 0 && intel.commonLossReasons.length === 0) answer += "I don't have enough data to identify specific improvement areas yet. Continue trading to build more data.";
    return { answer, confidence: 75, evidence, enginesUsed: [...engines, "AIPerformance"], timestamp: Date.now() };
  }

  const wins = trades.filter((t) => t.result === "win").length;
  const totalPnL = trades.reduce((s, t) => s + Number(t.profitLoss || 0), 0);
  const winRate = trades.filter((t) => t.result).length > 0 ? Math.round((wins / trades.filter((t) => t.result).length) * 100) : 0;
  evidence.push(`${trades.length} trades, ${winRate}% win rate, ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} PnL`);
  evidence.push(`AI accuracy: ${accuracy.accuracyPct}%`);

  return {
    answer: `Performance overview: ${trades.length} trades, ${winRate}% win rate, ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} total PnL. AI prediction accuracy: ${accuracy.accuracyPct}%.`,
    confidence: 85,
    evidence,
    enginesUsed: engines,
    timestamp: Date.now(),
  };
}

async function handleSession(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["AITradingCopilot"];
  const evidence: string[] = [];
  const m = message.toLowerCase();

  const copilot = getAITradingCopilot();

  if (/\b(today|session)\b/.test(m) && !/\b(overtrading|risk|summary)\b/.test(m)) {
    const coach = await copilot.sessionCoach(userId);
    evidence.push(`${coach.wins}W / ${coach.losses}L, ${coach.sessionAccuracy}% accuracy, ${coach.sessionDuration} duration`);
    if (coach.coachingMessages.length > 0) coach.coachingMessages.forEach((msg) => evidence.push(msg));
    let answer = `Session stats: ${coach.wins} wins, ${coach.losses} losses (${coach.sessionAccuracy}% accuracy). Duration: ${coach.sessionDuration}. `;
    if (coach.currentStreak !== "none") answer += `Current streak: ${coach.streakCount} ${coach.currentStreak}s. `;
    answer += `Total exposure: $${coach.totalExposure.toFixed(2)}.`;
    if (coach.coachingMessages.length > 0) answer += ` ${coach.coachingMessages.slice(0, 2).join(" ")}`;
    return { answer, confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(overtrading)\b/.test(m)) {
    const risk = await copilot.sessionCoach(userId);
    const trades = await db.getTradesByUserId(userId, 50);
    const tradeCountByDay: Record<string, number> = {};
    for (const t of trades) {
      const day = new Date(t.entryTime).toISOString().slice(0, 10);
      tradeCountByDay[day] = (tradeCountByDay[day] || 0) + 1;
    }
    const avgPerDay = Object.values(tradeCountByDay).reduce((a, b) => a + b, 0) / Math.max(Object.keys(tradeCountByDay).length, 1);
    evidence.push(`Average trades per day: ${avgPerDay.toFixed(1)}`);
    evidence.push(`Current exposure: $${risk.totalExposure.toFixed(2)}`);

    let answer = `Your average is ${avgPerDay.toFixed(1)} trades per day. `;
    if (avgPerDay > 20) answer += "This is considered overtrading. Consider reducing frequency and focusing on quality setups.";
    else if (avgPerDay > 10) answer += "Trading frequency is moderate-high. Monitor for fatigue-related mistakes.";
    else answer += "Trading frequency appears reasonable.";
    return { answer, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
  }

  if (/\b(risk|risky|exposure)\b/.test(m)) {
    const coach = await copilot.sessionCoach(userId);
    const alerts = await copilot.smartAlerts(userId);
    const activeAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "warning");
    activeAlerts.forEach((a) => evidence.push(`Alert: ${a.message}`));
    evidence.push(`Session exposure: $${coach.totalExposure.toFixed(2)}, ${coach.wins}W/${coach.losses}L`);
    let answer = `Current session: ${coach.wins}W/${coach.losses}L, $${coach.totalExposure.toFixed(2)} exposure. `;
    if (coach.streakCount >= 3 && coach.currentStreak === "loss") answer += `Warning: ${coach.streakCount}-trade loss streak. Consider pausing. `;
    if (activeAlerts.length > 0) answer += `${activeAlerts.length} active alerts. ${activeAlerts[0]?.message}`;
    else answer += "No critical alerts.";
    return { answer, confidence: 80, evidence, enginesUsed: [...engines, "RiskIntelligence"], timestamp: Date.now() };
  }

  if (/\b(summary|review)\b/.test(m)) {
    const summary = await copilot.sessionSummary(userId);
    evidence.push(summary.tradingSummary);
    if (summary.strengths.length > 0) summary.strengths.forEach((s) => evidence.push(`Strength: ${s}`));
    if (summary.mistakes.length > 0) summary.mistakes.forEach((m) => evidence.push(`Mistake: ${m}`));
    if (summary.improvementOpportunities.length > 0) summary.improvementOpportunities.slice(0, 2).forEach((i) => evidence.push(`Improvement: ${i}`));
    return {
      answer: `Session summary: ${summary.tradingSummary}. Duration: ${summary.sessionDuration}.${summary.strengths.length > 0 ? ` Strengths: ${summary.strengths.slice(0, 2).join("; ")}.` : ""}${summary.mistakes.length > 0 ? ` Areas to review: ${summary.mistakes.slice(0, 2).join("; ")}.` : ""}`,
      confidence: 85,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  const coach = await copilot.sessionCoach(userId);
  evidence.push(`${coach.wins}W/${coach.losses}L, ${coach.sessionAccuracy}% accuracy, $${coach.totalExposure.toFixed(2)} exposure`);
  return {
    answer: `Your session: ${coach.wins}W/${coach.losses}L (${coach.sessionAccuracy}%), $${coach.totalExposure.toFixed(2)} exposure over ${coach.sessionDuration}. How can I help?`,
    confidence: 85,
    evidence,
    enginesUsed: engines,
    timestamp: Date.now(),
  };
}

async function handleGeneral(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = [];
  const evidence: string[] = [];

  const m = message.toLowerCase();
  if (/\b(hello|hi|hey)\b/.test(m)) {
    return {
      answer: "Hello! I'm 369AI G�� your trading assistant. I can help with questions about your trades, strategies, market conditions, AI performance, and more. Try asking: \"How is my trading going?\", \"Which strategy is best?\", or \"How healthy is R_100?\"",
      confidence: 100,
      evidence,
      enginesUsed: ["AIChatEngine"],
      timestamp: Date.now(),
    };
  }

  if (/\b(help|what can|abilities|options)\b/.test(m)) {
    evidence.push("Available topics: trades, strategies, market, AI analysis, performance, session");
    return {
      answer: "I can answer questions about:\n- **Trades**: why trades lost/won, best/worst trades, repeated mistakes\n- **Strategies**: which performs best, why strategies are rated, improvement trends\n- **Market**: symbol health, volatility, strongest/weakest markets\n- **AI Analysis**: confidence levels, evidence, recommendations\n- **Performance**: accuracy trends, profitability, improvement areas\n- **Session**: daily stats, overtrading detection, risk analysis\n\nJust ask in natural language!",
      confidence: 100,
      evidence,
      enginesUsed: ["AIChatEngine"],
      timestamp: Date.now(),
    };
  }

  const overview = await aiMemory.getPerformanceSummary(userId);
  const trades = await db.getTradesByUserId(userId, 10);
  evidence.push(`${overview.totalTradeReviews} trade reviews, ${overview.winRate}% win rate, ${overview.totalPnL >= 0 ? "+" : ""}${overview.totalPnL.toFixed(2)} PnL`);

  return {
    answer: trades.length > 0
      ? `You have ${trades.length} recent trades (${overview.winRate}% win rate). AI accuracy: ${overview.accuracyPct}%. What would you like to know more about?`
      : "Welcome! I don't see any trading data yet. Start trading and I'll help analyze your performance.",
    confidence: 85,
    evidence,
    enginesUsed: ["AIMemory", "TradeReviewEngine"],
    timestamp: Date.now(),
  };
}

/* G��G��G�� Main handler G��G��G�� */

function buildIntentResponse(intent: string, userId: number, message: string): Promise<ChatResponse> {
  switch (intent) {
    case "trades": return handleTrades(userId, message);
    case "strategies": return handleStrategies(userId, message);
    case "market": return handleMarket(userId, message);
    case "ai": return handleAI(userId, message);
    case "performance": return handlePerformance(userId, message);
    case "session": return handleSession(userId, message);
    default: return handleGeneral(userId, message);
  }
}

/* G��G��G�� Exported engine G��G��G�� */

let engineInstance: AIChatEngine | null = null;

export class AIChatEngine {
  async sendMessage(userId: number, message: string): Promise<ChatResponse> {
    const intent = detectIntent(message);
    const response = await buildIntentResponse(intent, userId, message);
    addMessage(userId, { role: "user", content: message, timestamp: Date.now() });
    addMessage(userId, { role: "assistant", content: response.answer, response, timestamp: Date.now() });
    return response;
  }

  getConversationHistory(userId: number): ChatMessage[] {
    return conversations.get(userId) || [];
  }

  clearConversation(userId: number): void {
    conversations.delete(userId);
  }

  getQuickQuestions(): string[] {
    return [
      "Why did my last trade lose?",
      "Which strategy performs best?",
      "How healthy is R_100?",
      "Why has my accuracy dropped?",
      "How am I doing today?",
      "What should I improve?",
      "Show me evidence",
      "Am I overtrading?",
    ];
  }
}

export function getAIChatEngine(): AIChatEngine {
  if (!engineInstance) engineInstance = new AIChatEngine();
  return engineInstance;
}


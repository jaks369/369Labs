import * as db from "../db";
import { aiMemory } from "./AIMemory";
import { AIKnowledgeType } from "./knowledgeTypes";
import { getAITradingCopilot } from "./AITradingCopilot";
import { getAIExplainabilityEngine } from "./AIExplainability";
import { lastDigitOf, getDecimalPlaces } from "@shared/lastDigit";
import { getAllSymbols, getSymbolDisplayName } from "@shared/symbols";

/* = App + Deriv knowledge base (injected into the LLM system prompt) = */
// Written in plain language so the model can answer "how do I..." and
// "what is..." questions about this app and Deriv without guessing.

export const APP_KNOWLEDGE = `369Labs is an automated trading copilot for Deriv volatility indices. Key features the user can ask about:
- Strategy Builder: design trading rules (last digit, even/odd, over/under, consecutive rise/fall) with barriers and win-rate targets.
- Strategy Engine: backtest and score strategies on historical tick data, walk-forward validation, strengths/weaknesses, improvement scores.
- Signals (Watch): an always-on scanner sweeps every market every ~3 minutes and surfaces digit patterns with a real statistical edge. A signal has a symbol, a condition, a win rate and an expiry; a fresh signal means the condition is currently live and tradeable.
- Market Intelligence: per-symbol market health (score, trend, momentum, noise, volatility), hot markets, risk advisories, digit distributions.
- AI 369 Chat: this assistant. It can reference trades, strategies, signals, market health and performance.
- Trading features: place real/props Deriv trades, paper trading, bots, telemetry, journals, AI performance analytics.
- Settings: API keys (user can bring their own OpenAI-compatible key), risk preferences, symbols, notifications (Telegram/email).
- The app trades Deriv volatility indices: R_10/R_25/R_50/R_75/R_100 (standard), 1HZ10V..1HZ100V (1-second), plus Boom/Crash indices (BOOM300/500/1000, CRASH300/500/1000). 1-second indices tick roughly every 1 second; standard indices tick roughly every 2 seconds. Digits are derived from the last decimal place of the tick price.`;

export const DERIV_KNOWLEDGE = `Deriv (deriv.com) is the broker behind these indices. A digit contract bets on a property of the NEXT tick's last digit:
- Matches / Differs: next digit equals a chosen digit (10%) or not (90%).
- Even / Odd: next digit is even (50%) or odd (50%).
- Over / Under: next digit is above a barrier (default 5 => digits 6-9, 40%) or below (digits 0-4, 40%), with 5 as the "equal" barrier.
- Digits are a fair random process: a past streak never changes the odds of the next tick. Regulators treat high-volatility products as high risk.`;

function buildSystemPrompt(context: string): string {
  return `You are 369AI, a friendly, plain-English trading copilot inside 369Labs. You help with the user's own trading data and with questions about 369Labs and Deriv.
Rules:
- Talk like a helpful human, in simple short sentences. Avoid jargon unless you explain it.
- Use the trader's real context below whenever it is relevant. Never invent numbers.
- If the question is about the app or Deriv, use the knowledge sections.
- If you genuinely don't have the answer or data, say so directly and suggest what the user can do (e.g. where in the app to find it).
- Under ~180 words.
- Never present predictions or patterns as certainties or guaranteed returns. Any trade decision is the trader's responsibility.

${APP_KNOWLEDGE}

${DERIV_KNOWLEDGE}

${context ? `\nTrader's current context (from the app):\n${context}` : ""}`;
}

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

/* = In-memory conversation history = */
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

/* = Symbol + pattern extraction = */

const KNOWN_SYMBOLS = getAllSymbols();

// Resolve a natural-language symbol mention ("V-15", "V15", "Volatility 15
// (1s)", "R100", "Boom 300", "1HZ100V", ...) to a known symbol, or null.
function extractSymbol(message: string): string | null {
  const raw = message.toUpperCase().replace(/-/g, " ");

  let direct: string | null = null;
  let bestLen = 0;
  for (const s of KNOWN_SYMBOLS) {
    if (new RegExp("\\b" + s + "\\b").test(raw) && s.length > bestLen) {
      direct = s;
      bestLen = s.length;
    }
  }
  if (direct) return direct;

  const rMatch = raw.match(/\bR\s*(\d{2,3})\b/);
  if (rMatch) {
    const cand = "R_" + rMatch[1];
    if (KNOWN_SYMBOLS.includes(cand)) return cand;
  }

  const volMatch = raw.match(/\bVOLATILITY\s*(\d{2,3})\b/);
  if (volMatch) {
    const is1s = /1\s*S\b|\(1S\)/.test(raw);
    const cand1s = "1HZ" + volMatch[1] + "V";
    const cand = "R_" + volMatch[1];
    if (is1s && KNOWN_SYMBOLS.includes(cand1s)) return cand1s;
    if (KNOWN_SYMBOLS.includes(cand)) return cand;
    if (KNOWN_SYMBOLS.includes(cand1s)) return cand1s;
  }

  const vMatch = raw.match(/\b(?:V|1HZ)\s*(\d{2,3})\b/);
  if (vMatch) {
    const cand = "1HZ" + vMatch[1] + "V";
    if (KNOWN_SYMBOLS.includes(cand)) return cand;
  }

  const vSuffix = raw.match(/\b(\d{2,3})\s*V\b/);
  if (vSuffix) {
    const cand = "1HZ" + vSuffix[1] + "V";
    if (KNOWN_SYMBOLS.includes(cand)) return cand;
  }

  const boomCrash = raw.match(/\b(BOOM|CRASH)\s*(\d+)\b/);
  if (boomCrash) {
    const cand = boomCrash[1] + boomCrash[2];
    if (KNOWN_SYMBOLS.includes(cand)) return cand;
  }

  return null;
}

// Is the message asking about an observed tick pattern (streaks, runs,
// repeats, over/under streaks) rather than a generic market query?
function isPatternObservation(m: string): boolean {
  return /\b(streak|streaks|consecutive|repeat|run|sequence|random|normal|expected|longest|pattern)\b/.test(m)
    || /\bover-?streak\w*\b/.test(m)
    || /\bunder-?streak\w*\b/.test(m);
}

/* = Intent detection = */

function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (extractSymbol(message) && isPatternObservation(m)) return "market";
  if (/\b(trade|lost|losing|loss|won|winning|win|pnl|profit|result|outcome)\b/.test(m)) return "trades";
  if (/\b(how do i|how to|what is|what does)\b/.test(m) && /\b(signal|scanner|strategy|backtest|bot|market intelligence|journal|paper trading|deriv|feature|app)\b/.test(m)) return "app";
  if (/\b(strategy|strategies|review|score|rating|strength|weakness)\b/.test(m)) return "strategies";
  if (/\b(signal|signals|scan|watch|alert)\b/.test(m)) return "signals";
  if (extractSymbol(message)) return "market";
  if (/\b(market|symbol|volatility|volatile|health|trend|momentum|noise)\b/.test(m)) return "market";
  if (/\b(confidence|evidence|explain|reason|why|how|sure|certain)\b/.test(m)) return "ai";
  if (/\b(performance|accuracy|improve|drop|profit|profitable|mistake)s?\b/.test(m)) return "performance";
  if (/\b(session|today|overtrading|streak|coach|risk)\b/.test(m)) return "session";
  return "general";
}

/* = Intent handlers = */

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

async function handlePattern(userId: number, symbol: string, message: string): Promise<ChatResponse> {
  const engines: string[] = ["TickPatternValidator"];
  const evidence: string[] = [];
  const m = message.toLowerCase();
  const display = getSymbolDisplayName(symbol) || symbol;

  let ticks: { price: string; epoch: number }[] = [];
  try {
    ticks = await db.getTickHistory(symbol, 500);
  } catch {
    /* fall through */
  }

  if (!ticks || ticks.length < 50) {
    return {
      answer: `I couldn't pull enough recent ticks for ${display} (${symbol}) to validate that pattern — I need at least ~50 ticks and only got ${ticks?.length ?? 0}. The always-on scanner is watching this market; ask again shortly.`,
      confidence: 75,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  const decimals = getDecimalPlaces(symbol);
  const digits = ticks.map((t) => lastDigitOf(Number(t.price), decimals)).filter((d) => !isNaN(d));
  const n = digits.length;

  const lastDigit = digits[n - 1];
  const prevDigit = digits[n - 2];

  // A "run"/"streak" helper: consecutive ticks where predicate holds.
  const longestRun = (pred: (d: number, i: number, arr: number[]) => boolean): number => {
    let best = 0;
    let cur = 0;
    for (let i = 0; i < digits.length; i++) {
      cur = pred(digits[i], i, digits) ? cur + 1 : 0;
      if (cur > best) best = cur;
    }
    return best;
  };
  const freq = (pred: (d: number) => boolean): number => Math.round((digits.filter(pred).length / n) * 100);

  const overStreak = longestRun((d) => d > 5);
  const underStreak = longestRun((d) => d < 5);
  const evenStreak = longestRun((d) => d % 2 === 0);
  const oddStreak = longestRun((d) => d % 2 !== 0);
  const repeatStreak = longestRun((_d, i, arr) => i > 0 && arr[i] === arr[i - 1]);
  const riseStreak = longestRun((_d, i, arr) => i > 0 && arr[i] > arr[i - 1]);
  const fallStreak = longestRun((_d, i, arr) => i > 0 && arr[i] < arr[i - 1]);

  const pct = {
    over: freq((d) => d > 5),
    under: freq((d) => d < 5),
    even: freq((d) => d % 2 === 0),
    odd: freq((d) => d % 2 !== 0),
    repeat: Math.round((digits.filter((d, i) => i > 0 && d === digits[i - 1]).length / n) * 100),
    rise: Math.round((digits.filter((d, i) => i > 0 && d > digits[i - 1]).length / n) * 100),
    fall: Math.round((digits.filter((d, i) => i > 0 && d < digits[i - 1]).length / n) * 100),
  };

  evidence.push(`Validated over the last ${n} ticks of ${symbol}`);
  evidence.push(`Last digit ${lastDigit} (previous ${prevDigit}). Longest streaks: Over=${overStreak}, Under=${underStreak}, Even=${evenStreak}, Odd=${oddStreak}, Repeat-same=${repeatStreak}, Rise=${riseStreak}, Fall=${fallStreak}`);
  evidence.push(`Frequencies: Over ${pct.over}%, Under ${pct.under}%, Even ${pct.even}%, Odd ${pct.odd}%, Repeat ${pct.repeat}%, Rise ${pct.rise}%, Fall ${pct.fall}%`);

  // Fair baseline for a fair uniform 0-9 digit stream:
  //   P(over) = P(digit>5) = 4/10 = 40%; P(under)=40%; P(even)=P(odd)=50%;
  //   P(repeat) = P(d==prev) = 10%; P(rise)=P(fall)=45% each (10% tie).
  const fair: Record<string, number> = { over: 40, under: 40, even: 50, odd: 50, repeat: 10, rise: 45, fall: 45 };
  const streaks: Record<string, number> = { over: overStreak, under: underStreak, even: evenStreak, odd: oddStreak, repeat: repeatStreak, rise: riseStreak, fall: fallStreak };

  // Expected longest run of k consecutive successes in n trials, p=success prob.
  // For p, E[max run] ≈ log_{1/p}(n * (1-p)) + ... A handy empirical bound:
  // a run of length L has probability p^L; it is "surprising" if p^L * n < ~0.01
  // (i.e. you'd need 100x the observed window to expect it once by chance).
  const surprising: string[] = [];
  for (const [key, L] of Object.entries(streaks)) {
    if (L < 4) continue;
    const p = fair[key] / 100;
    const expectedPerWindow = n * Math.pow(p, L);
    if (expectedPerWindow < 0.01) surprising.push(`${key} (run of ${L}, p^L·n = ${expectedPerWindow.toExponential(1)})`);
  }

  const wantStreak = /\bover-?streak\b|\bunder-?streak\b|\bstreak\b|\bconsecutive\b|\brun\b/.test(m);
  const wantVolatility = /\bvolatil/i.test(m);
  const wantEvenOdd = /\b(even|odd|parity)\b/.test(m);

  let answer = `${display} (${symbol}) over the last ${n} ticks: last digit was ${lastDigit}, previous ${prevDigit}. `;

  if (wantStreak && surprising.length > 0) {
    answer += `You're right to notice — these streaks are beyond what a fair random digit stream produces: ${surprising.join("; ")}. `;
  } else if (wantStreak) {
    answer += `I checked streak lengths and none are statistically surprising for a fair digit stream (longest: Over=${overStreak}, Under=${underStreak}, Even=${evenStreak}, Odd=${oddStreak}, Repeat-same=${repeatStreak}, Rise=${riseStreak}, Fall=${fallStreak}). `;
  }

  if (wantEvenOdd) {
    answer += `Even/Odd split is ${pct.even}%/${pct.odd}% (fair 50/50). `;
  }
  if (wantVolatility) {
    answer += `Over/Under split ${pct.over}%/${pct.under}% (fair 40/40), rise/fall ${pct.rise}%/${pct.fall}% (fair 45/45). `;
  }

  answer += `Note: a streak in the past does not change the odds of the next tick — Deriv's volatility indices are simulated from a fair random process, so an Over-streak doesn't make "Under" more or less likely next.`;

  return { answer, confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
}

async function handleMarket(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["MarketHealthEngine", "PredictionEngine", "RiskIntelligence"];
  const evidence: string[] = [];
  const { aiOrchestrator } = await import("./AIOrchestrator");
  const m = message.toLowerCase();

  const targetSymbol = extractSymbol(message);

  if (targetSymbol && isPatternObservation(m)) {
    return handlePattern(userId, targetSymbol, message);
  }

  if (targetSymbol && /\b(digit|hottest|probability|percent|even|odd|last)\b/.test(m)) {
    try {
      const decimals = getDecimalPlaces(targetSymbol);
      const ticks = await db.getTickHistory(targetSymbol, 100);
      const prices = ticks.map((t: any) => Number(t.price)).filter((p: number) => !isNaN(p));
      const digits = prices.map((p: number) => lastDigitOf(p, decimals));
      if (digits.length >= 20) {
        const digitCounts: Record<number, number> = {};
        for (const d of digits) digitCounts[d] = (digitCounts[d] || 0) + 1;
        const sorted = Object.entries(digitCounts).sort((a, b) => b[1] - a[1]);
        const hottest = sorted[0];
        const pct = (n: number) => ((n / digits.length) * 100).toFixed(1) + "%";
        evidence.push(`${targetSymbol} digit distribution (${digits.length} ticks): ${sorted.map(([d, c]) => `${d}=${pct(c)}`).join(", ")}`);
        const evenCount = digits.filter((d) => d % 2 === 0).length;
        const oddCount = digits.length - evenCount;
        const evenPct = Math.round((evenCount / digits.length) * 100);
        const last = digits[digits.length - 1];
        const answer = hottest
          ? `${targetSymbol} last digit was ${last}. Hottest digit: ${hottest[0]} (${pct(hottest[1])} of ${digits.length} ticks). Even/Odd split: ${evenPct}% / ${100 - evenPct}%.`
          : `${targetSymbol} last digit was ${last}. Even/Odd split: ${evenPct}% / ${100 - evenPct}%.`;
        return { answer, confidence: 85, evidence, enginesUsed: engines, timestamp: Date.now() };
      }
    } catch {
      /* fall through to health */
    }
  }

  if (targetSymbol) {
    const health = aiOrchestrator.getHealthFor(targetSymbol);
    const risk = aiOrchestrator.getRiskAdvisoryFor(targetSymbol);
    const predictions = aiOrchestrator.getState().predictions.filter((p) => p.symbol === targetSymbol);

    if (!health) {
      return { answer: `No market data available for ${targetSymbol}.`, confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
    }

    evidence.push(`${targetSymbol}: score ${health.score}, trend ${health.trend}, volatility ${health.volatility}, momentum ${health.momentum}, noise ${health.noise}`);
    if (risk) evidence.push(`Risk: ${risk.riskLevel} — ${risk.recommendation}`);
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

  if (/\b(hot|active|most traded|busiest|popular|traded)\b/.test(m)) {
    const hot = aiOrchestrator.getHotMarkets();
    if (hot.length === 0) {
      return { answer: "No recent trading activity recorded yet. Once trades settle, I'll rank the hottest markets.", confidence: 80, evidence, enginesUsed: engines, timestamp: Date.now() };
    }
    hot.forEach((h) => evidence.push(`${h.symbol}: ${h.tradeCount} trades in last 24h, ${h.winRate}% win rate`));
    const top = hot[0];
    return {
      answer: `Hottest markets right now: ${hot.map((h) => `${h.symbol} (${h.tradeCount} trades)`).join(", ")}. Most traded is ${top.symbol} with ${top.tradeCount} trades and a ${top.winRate}% win rate in the last 24h.`,
      confidence: 90,
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
    if (recentAccuracy < 40) answer += "Accuracy is low — predictions may need recalibration. Consider reviewing market conditions.";
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

async function handleSignals(userId: number): Promise<ChatResponse> {
  const engines: string[] = ["SignalScanner", "TickPatternValidator"];
  const evidence: string[] = [];

  let watchInfo = "";
  try {
    const { getWatchStatus } = await import("../signalScanner");
    const ws = getWatchStatus();
    if (ws?.enabled) {
      const mins = Math.round((ws.intervalMs || 0) / 60000);
      watchInfo = `Always-on scanner: watching ${ws.symbols?.length || 0} markets, sweeping every ~${mins} min.`;
    }
  } catch {}

  const signals = await db.getSignalsByUserId(userId, 10);
  if (signals.length === 0) {
    return {
      answer: `${watchInfo ? watchInfo + " " : ""}No live signals right now — the scanner is watching, but no pattern has cleared the statistical bar yet. That's the engine being honest, not a failure. Re-check after the next sweep.`,
      confidence: 85,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  signals.slice(0, 5).forEach((s: any) => {
    evidence.push(`${s.symbol}: ${s.title} (winRate ${s.winRate}%)`);
  });

  return {
    answer: `${watchInfo ? watchInfo + " " : ""}You have ${signals.length} live signal${signals.length > 1 ? "s" : ""}: ${signals.slice(0, 5).map((s: any) => `${getSymbolDisplayName(s.symbol) || s.symbol} — "${s.title}" (${s.winRate}% win rate)`).join("; ")}.`,
    confidence: 90,
    evidence,
    enginesUsed: engines,
    timestamp: Date.now(),
  };
}

async function handleApp(userId: number, message: string): Promise<ChatResponse> {
  const engines: string[] = ["AppKnowledge"];
  const evidence: string[] = [];
  const m = message.toLowerCase();

  if (/\b(signal|scan|watch)\b/.test(m)) {
    evidence.push("Signals = the always-on scanner's findings. A signal is a digit pattern with a real statistical edge that is live right now.");
    return {
      answer: "Signals are what the always-on scanner finds: a digit pattern (like 'last digit repeats 5' or 'even/odd runs') that has a win rate clearly above the fair baseline and is live right now. Open the Signals page (Marketplace) to see them; each has a symbol, a condition, and a win rate.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(strategy|builder)\b/.test(m)) {
    evidence.push("Strategy Builder lets you define trading rules with conditions, barriers and win-rate targets.");
    return {
      answer: "The Strategy Builder lets you create trading rules from digit conditions — for example 'buy Over 5 when the last digit has been Under for 3 straight ticks'. Set a win-rate target and the engine will score and backtest it for you.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(backtest|backtesting)\b/.test(m)) {
    evidence.push("Backtesting replays a strategy against historical tick data to estimate performance.");
    return {
      answer: "Backtesting replays a strategy against real historical tick data and reports win rate, sample size, and whether the edge holds out-of-sample. It's the best way to check a strategy before risking money.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(bot|bot)\b/.test(m)) {
    evidence.push("Bots run a strategy automatically on Deriv with real or paper money.");
    return {
      answer: "Bots run a strategy automatically on Deriv for you — real-money or paper. You pick a strategy, a stake, and risk settings, and the bot places the trades and tracks results.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(market intelligence)\b/.test(m)) {
    evidence.push("Market Intelligence shows per-symbol health, volatility, risk and digit distributions.");
    return {
      answer: "Market Intelligence is a dashboard showing each market's health score, trend, momentum, noise, volatility, risk advisories, and last-digit distributions — a quick read on which markets are behaving cleanly.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(journal)\b/.test(m)) {
    evidence.push("Journal logs your trades so the AI can review wins and losses.");
    return {
      answer: "The Journal logs every trade so the AI can review why you won or lost, spot repeated mistakes, and track your win rate and PnL over time.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(paper trading|paper)\b/.test(m)) {
    evidence.push("Paper trading lets you practice without real money.");
    return {
      answer: "Paper trading is a practice mode — the same strategies and markets, but no real money. Great for testing ideas and the bot's behavior before going live.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }
  if (/\b(deriv)\b/.test(m)) {
    evidence.push("Deriv is the broker behind the volatility indices the app trades.");
    return {
      answer: "Deriv (deriv.com) is the broker behind these indices. The app trades Deriv volatility indices: R_10 to R_100 (standard, ~2s ticks), 1HZ10V to 1HZ100V (1-second ticks), and Boom/Crash indices. You place digit contracts on each tick's last digit.",
      confidence: 90,
      evidence,
      enginesUsed: engines,
      timestamp: Date.now(),
    };
  }

  return {
    answer: "369Labs is your Deriv trading copilot. Ask me about Signals (the always-on scanner's findings), Strategy Builder, Backtesting, Bots, Market Intelligence, the Journal, Paper Trading, or about Deriv indices themselves.",
    confidence: 90,
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
      answer: "Hello! I'm 369AI — your trading assistant. I can help with questions about your trades, strategies, market conditions, AI performance, and more. Try asking: \"How is my trading going?\", \"Which strategy is best?\", or \"How healthy is R_100?\"",
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

/* = Main handler = */

function buildIntentResponse(intent: string, userId: number, message: string): Promise<ChatResponse> {
  switch (intent) {
    case "trades": return handleTrades(userId, message);
    case "strategies": return handleStrategies(userId, message);
    case "market": return handleMarket(userId, message);
    case "ai": return handleAI(userId, message);
    case "performance": return handlePerformance(userId, message);
    case "session": return handleSession(userId, message);
    case "signals": return handleSignals(userId);
    case "app": return handleApp(userId, message);
    default: return handleGeneral(userId, message);
  }
}

/* = LLM integration = */

// Cache one LLM client per API key. A single global client cached the first
// caller's key and served every later user, so per-user OpenAI keys were ignored
// and all calls billed/authenticated as the first user.
const _aiClients = new Map<string, any>();

// Resolve an API key: env first (AI_API_KEY / OPENAI_API_KEY), then the user's
// saved OpenAI key from Settings -> API Keys (stored in AI memory).
async function resolveAIKey(userId: number): Promise<string> {
  const envKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (envKey) return envKey;
  try {
    const mem = await db.getUserMemory(userId);
    return (mem as any)?.apiKeys?.openai || "";
  } catch {
    return "";
  }
}

async function getAIClient(apiKey: string, baseUrl?: string) {
  const url = baseUrl || process.env.AI_API_BASE_URL || "";
  const key = url ? `${url}|${apiKey}` : apiKey;
  const existing = _aiClients.get(key);
  if (existing) return existing;
  const mod = await import("groq-sdk");
  const client = new mod.default({
    apiKey,
    ...(url ? { baseURL: url } : {}),
  });
  _aiClients.set(key, client);
  return client;
}

async function llmChatCompletion(client: any, params: any): Promise<string> {
  const res = await client.chat.completions.create(params);
  return res?.choices?.[0]?.message?.content?.trim?.() || "";
}

// Build a compact trading-context summary for the system prompt.
async function buildContextSummary(userId: number): Promise<string> {
  const parts: string[] = [];
  try {
    const trades = await db.getTradesByUserId(userId, 20);
    if (trades.length > 0) {
      const settled = trades.filter((t: any) => t.result === "win" || t.result === "loss");
      const wins = settled.filter((t: any) => t.result === "win").length;
      const net = settled.reduce((a, t) => a + parseFloat((t as any).profitLoss || "0"), 0);
      parts.push(`Recent trades: ${trades.length} total, ${settled.length} settled, ${wins} wins, net P&L ${net.toFixed(2)}.`);
    }
  } catch {}
  try {
    const strategies = await db.getStrategiesByUserId(userId);
    if (strategies.length > 0) {
      parts.push(`Strategies: ${strategies.slice(0, 10).map((s: any) => s.name).join(", ")}.`);
    }
  } catch {}
  try {
    const mem = await db.getUserMemory(userId);
    const m = (mem as any) || {};
    if (m.symbols?.length) parts.push(`Preferred symbols: ${m.symbols.join(", ")}.`);
    if (m.riskPct != null) parts.push(`Risk per trade: ${m.riskPct}%.`);
    if (m.dailyLossLimit != null) parts.push(`Daily loss limit: $${m.dailyLossLimit}.`);
    if (m.noMartingale) parts.push("No martingale / no grid averaging.");
    if (m.style) parts.push(`Trading style: ${m.style}.`);
    if (m.notes) parts.push(`Trader notes: ${m.notes}.`);
  } catch {}
  // Live always-on scanner state (watching since / last / next scan).
  try {
    const { getWatchStatus } = await import("../signalScanner");
    const ws = getWatchStatus();
    if (ws?.enabled) {
      const mins = Math.round((ws.intervalMs || 0) / 60000);
      parts.push(`Scanner: always-on, sweeping ${ws.symbols?.length || 0} markets every ~${mins} min; last scan ${ws.lastScanAt ? new Date(ws.lastScanAt).toISOString() : "n/a"}, next ${ws.nextScanAt ? new Date(ws.nextScanAt).toISOString() : "n/a"}${ws.lastCycle ? ` (last cycle ${ws.lastCycle.scans} scans in ${(ws.lastCycle.durationMs / 1000).toFixed(0)}s)` : ""}.`);
    } else {
      parts.push("Scanner: currently off.");
    }
  } catch {}
  // Live signals the engine has persisted for this user.
  try {
    const signals = await db.getSignalsByUserId(userId, 5);
    if (signals.length > 0) {
      parts.push(`Live signals: ${signals.map((s: any) => `${s.symbol} "${s.title}" (winRate ${s.winRate}%)`).join("; ")}.`);
    }
  } catch {}
  // Live market health snapshot (top few by score).
  try {
    const { aiOrchestrator } = await import("./AIOrchestrator");
    const health = aiOrchestrator.getHealth();
    if (health.length > 0) {
      const top = [...health].sort((a, b) => b.score - a.score).slice(0, 5);
      parts.push(`Market health: ${top.map((h) => `${h.symbol} score ${h.score} (${h.volatility} vol)`).join(", ")}.`);
    }
  } catch {}
  return parts.join("\n");
}

async function tryLLMResponse(userId: number, message: string): Promise<ChatResponse | null> {
  const apiKey = await resolveAIKey(userId);
  if (!apiKey) return null;
  try {
    const client = await getAIClient(apiKey);
    let model = process.env.AI_MODEL || "gpt-4o-mini";
    let baseUrl = process.env.AI_API_BASE_URL || "";
    try {
      const mem = await db.getUserMemory(userId);
      const cfg = (mem as any)?.aiModelConfig || {};
      if (cfg.model) model = cfg.model;
      if (cfg.baseUrl) baseUrl = cfg.baseUrl;
    } catch {}
    const effectiveClient = baseUrl && baseUrl !== (process.env.AI_API_BASE_URL || "") ? await getAIClient(apiKey, baseUrl) : client;
    const history = conversations.get(userId) || [];
    const context = await buildContextSummary(userId);
    const messages: any[] = [
      { role: "system", content: buildSystemPrompt(context) },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];
    const answer = await llmChatCompletion(effectiveClient, { model, messages, max_tokens: 400, temperature: 0.4 });
    if (!answer) return null;
    return { answer, confidence: 88, evidence: [], enginesUsed: [`LLM (${model})`], timestamp: Date.now() };
  } catch (err: any) {
    console.warn("[AIChat] LLM call failed, falling back to template engine:", err?.message?.slice?.(0, 120) || err);
    return null;
  }
}

/* = Exported engine = */

let engineInstance: AIChatEngine | null = null;

export class AIChatEngine {
  async sendMessage(userId: number, message: string): Promise<ChatResponse> {
    const intent = detectIntent(message);
    const llmResponse = await tryLLMResponse(userId, message);
    const response = llmResponse || await buildIntentResponse(intent, userId, message);
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
      "What live signals do I have?",
      "Why did my last trade lose?",
      "Which strategy performs best?",
      "How healthy is R_100?",
      "V-15 (1s) keeps over-streaking, is that normal?",
      "How do I backtest a strategy?",
      "What is Market Intelligence?",
      "How am I doing today?",
    ];
  }
}

export function getAIChatEngine(): AIChatEngine {
  if (!engineInstance) engineInstance = new AIChatEngine();
  return engineInstance;
}


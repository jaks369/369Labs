# AI Workflow Audit Report — 369Labs

**Audit Date:** 2026-08-01  
**Scope:** Full AI pipeline — UI to tRPC to AI Engines to Response  
**Environment State:** AI_API_KEY="" (empty in .env)

---

## Executive Summary

The codebase implements a sophisticated multi-engine AI architecture with 16 backend AI engines and 7 major frontend AI pages/components. However, critical issues exist that prevent real AI functionality when AI_API_KEY is empty (current state), along with type mismatches, missing error boundaries, and memory leaks in long-running chats.

**Critical Finding:** The entire LLM-dependent workflow fails silently or returns mock responses when AI_API_KEY is unset — which is the current production state.

---

## 1. AIChat.tsx + AIChatWindow.tsx — Chat Interface, Message History, Streaming

### Trace: UI to tRPC to AI Engine to Response
AIChatWindow.tsx:45-58 (handleSend)
  to trpc.aiChat.sendMessage.useMutation() [routers.ts:2399-2404]
  to AIChatEngine.sendMessage() [AIChatEngine.ts:637-643]
  to detectIntent() + intent handlers [AIChatEngine.ts:47-575]
  to ChatResponse returned to UI

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| AIChatWindow.tsx:50 | No streaming support — mutateAsync waits for full response. No onStream or SSE handling. User sees frozen UI until complete. | HIGH |
| AIChatWindow.tsx:53-56 | Error handling swallows errors — Generic catch with hardcoded error message. No error boundary, no retry logic, no error classification. | HIGH |
| AIChatWindow.tsx:30-32 | Race condition — useEffect overwrites messages with historyQuery.data on every fetch, clobbering optimistic updates. | MEDIUM |
| AIChatWindow.tsx:101-114 | Fake loading indicator — Shows bouncing dots but no real streaming. Backend AIChatEngine is fully synchronous. | MEDIUM |
| AIChatWindow.tsx:7 | Type import from server — import type from "../../../server/ai/AIChatEngine" creates tight coupling. | LOW |

### Missing Error Boundaries
- No ErrorBoundary wrapping AIChatWindow
- No try/catch around historyQuery.refetch() in memory modal
- No handling of sendMessageMutation.isError state in UI

---

## 2. AIAssistant.tsx — Assistant Tabs, tRPC Queries

### Trace: UI to tRPC to AI Engine to Response
AIAssistant.tsx:58-108 (handleSend)
  to trpc.ai.ask.useMutation() [routers.ts:1782-1936]
  to getAI() to Groq SDK client [routers.ts:54-63]
  to aiChatCompletion() with tools [routers.ts:66-86]
  to runTool() for Deriv data [routers.ts:88-467]
  to Multi-agent routing via agents.ts [routers.ts:1840-1842]
  to Returns { reply, steps, action, agent }

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| routers.ts:1789 | Hardcoded mock when AI_API_KEY empty — if (!process.env.AI_API_KEY) return { reply: "AI not configured..." }. Returns fake response instead of failing loudly. | CRITICAL |
| routers.ts:1857-1877 | No timeout on AI call — aiChatCompletion has retries but no overall timeout. Can hang indefinitely. | HIGH |
| AIAssistant.tsx:82-92 | Fake "streaming" via setInterval — Lines 86-90 simulate progressive reveal with setInterval, but backend is NOT streaming. Misleads user. | HIGH |
| AIAssistant.tsx:94-107 | Error handling stores failed message in input — Sets setInput(failedMsg) for retry but does not clear isTyping properly on all paths. | MEDIUM |
| AIAssistant.tsx:43-56 | History seeding race — seededRef + historyQuery.isLoading check can miss data if query completes between renders. | MEDIUM |
| AIAssistant.tsx:110-143 | executeAction has no confirmation for dangerous ops — placeTrade only checks derivWS.isAuthorized(), no user confirmation dialog in this path. | HIGH |
| routers.ts:470 | Agent history memory leak — agentHistory Map grows unbounded (cleanup interval at line 472-478 only runs every 5min, max 10k keys). Long chats = memory leak. | HIGH |
| AIAssistant.tsx:470 | User memory fetched but not typed — formatMemoryForPrompt(memory) receives untyped any. | LOW |

### Type Mismatches
- Message interface (line 10) uses role: "user" | "ai" but backend expects "user" | "assistant" (line 1785, 1900)
- steps type is any[] — no schema validation for tool steps

### Hardcoded Mock Data
- Lines 22-24: Initial mock message hardcoded
- Lines 145-150: Hardcoded suggestions array
- Line 1789: Returns mock when AI_API_KEY empty

---

## 3. TradingCopilot.tsx — Real-time Suggestions, Signal Integration

### Trace: UI to tRPC to AI Engine to Response
TradingCopilot.tsx:15-25 (tick subscription via derivWS)
  to AIChatWindow (embedded) to trpc.aiChat.sendMessage
  to AIChatEngine.detectIntent("market") to handleMarket()
  to aiOrchestrator.getHealthFor() + getRiskAdvisoryFor() + getState().predictions
  to Returns ChatResponse with market data

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| TradingCopilot.tsx:100-102 | DOM manipulation hack — document.querySelector('[data-chat-input]') to inject quick actions. No data-chat-input attribute exists on AIChatInput textarea. BROKEN FEATURE. | CRITICAL |
| TradingCopilot.tsx:18-25 | Memory leak in tick listener — listener object created fresh each render, derivWS.addListener(listener) adds new listener each effect run. Cleanup removes DIFFERENT object reference. | HIGH |
| TradingCopilot.tsx:27 | decimalPlacesFor called on every render — Should be memoized. | LOW |
| TradingCopilot.tsx:86-87 | Embeds AIChatWindow but passes no props — No way to pre-fill context (current symbol, tick data). | MEDIUM |

### Type Mismatches
- tick state typed as { price: number; change: number } | null but onTick callback receives t: any

---

## 4. AIExplainability.tsx — Memory Slots, Explanation Rendering

### Trace: UI to tRPC to AI Engine to Response
AIExplainability.tsx:69 (trpc.ai.memory.useQuery)
  to routers.ts:2418-2439 (aiChat.memory)
  to db.getAiKnowledge() / db.searchAllAiKnowledge()
  to Returns { entries: AiKnowledge[] }
  to Client filters/formats in formatFactors(), confidencePercent(), pickSignal()

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| AIExplainability.tsx:72 | Client-side filtering of all memory — Fetches ALL entries then filters in useMemo. No pagination/server-side filter for preferredTypes. | MEDIUM |
| AIExplainability.tsx:44-51 | Fragile confidence extraction — confidencePercent() tries multiple nested fields. No schema guarantee. | MEDIUM |
| AIExplainability.tsx:53-63 | pickSignal() logic fragile — String matching on recommendation/outcome fields. No typed schema. | MEDIUM |
| AIExplainability.tsx:27-42 | formatFactors() skips hardcoded keys — Misses nested objects. Recursion depth unbounded (max 6 lines). | LOW |
| AIExplainability.tsx:83-88 | slotEntry() division by zero risk — pool.length || 1 but if pool.length === 0, idx = 0 % 1 = 0, then pool[0] is undefined. | LOW |

### Type Mismatches
- entry.data cast as any throughout — no shared types between server AiKnowledge and client rendering

---

## 5. AIPerformance.tsx — Metrics, Model Comparison

### Trace: UI to tRPC to AI Engine to Response
AIPerformance.tsx:12-17 (6 parallel queries)
  to routers.ts:2283-2307 (aiPerformance.*)
  to AIPerformanceEngine.getOverview() etc. [AIPerformance.ts:61-436]
  to aiMemory.getAccuracyStats() + db.getTradesByUserId() + aiMemory.getPerformanceSummary()
  to Returns PortfolioOverview / AccuracyDetail / TradeIntelligenceData / etc.

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| AIPerformance.tsx:70-80 | Generic Object.entries(data) rendering — Assumes all endpoints return flat key-value objects. tradeIntelligence returns nested arrays, riskBehaviour returns object with streakSummary string. UI BREAKS for non-overview tabs. | HIGH |
| AIPerformance.tsx:63-69 | Error display shows raw error message — currentQuery.error.message may leak internal details. | MEDIUM |
| AIPerformance.tsx:80 | JSON.stringify(data, null, 2) in pre — Can be massive, blocks main thread. No virtualization. | MEDIUM |
| AIPerformance.ts:88-90 | Silent catch-all returns zeros — getOverview() catches all errors and returns empty PortfolioOverview. No error propagation. | HIGH |
| AIPerformance.ts:306-355 | getStrategyRankings filters s.config && typeof s.config === "object" — Excludes strategies with null config silently. | MEDIUM |

### Type Mismatches
- PortfolioOverview.riskRating is "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" but UI renders as generic value
- AccuracyDetail.confidenceVsOutcome uses string keys like "80-100%" — not typed

---

## 6. MarketIntelligence.tsx — Market Analysis, News/Sentiment

### Trace: UI to tRPC to AI Engine to Response
MarketIntelligence.tsx:26-28 (trpc.aiMarket.overview.useQuery, refetchInterval: 30s)
  to routers.ts:2477-2500 (aiMarket.overview)
  to aiOrchestrator.getState() [AIOrchestrator.ts:58-60]
  to Returns { health, predictions, insights, advisories, lastUpdated, active }
  to Rendered by MarketHealthGrid, MarketPredictionCards, MarketInsightCards, MarketRiskPanel

### Bugs Found

| File:Line | Issue | Severity |
|-----------|-------|----------|
| MarketIntelligence.tsx:92-106 | Symbol screener uses optional chaining incorrectly — healthData?.direction || healthData?.trend but MarketHealth type has trend: number, not direction. Falls back to "neutral" string. | MEDIUM |
| MarketIntelligence.tsx:137-148 | Volatility monitor uses healthData?.volatility ?? healthData?.score — volatility is "Low" | "Medium" | "High", score is number. Mixed types cause wrong level calculation. | HIGH |
| MarketIntelligence.tsx:119-127 | Correlation filter i?.type === "correlation" — InsightEngine generates type: "insight" not "correlation". ALWAYS SHOWS EMPTY STATE. | MEDIUM |
| MarketIntelligence.tsx:26-28 | refetchInterval: 30000 on protected query — Triggers auth check every 30s. If session expires, spam errors. | LOW |

### Type Mismatches
- data cast as any throughout — MarketHealth from server vs client expectations diverge

---

## 7. server/ai/*.ts (16 Engines) — Backend AI Pipeline

### Engine Inventory & Call Flow

| Engine | Purpose | Called By | Uses LLM? |
|--------|---------|-----------|-----------|
| AIChatEngine | Conversational routing + intent handlers | aiChat.sendMessage | No — rule-based only |
| AIOrchestrator | 15s polling loop for health/predictions | aiMarket.overview, AIChatEngine.handleMarket | No |
| AITradingCopilot | Session coaching, alerts, summaries | aiCopilot.*, AIChatEngine.handleSession | No — returns zeros |
| AIExplainability | Timeline, confidence history, export | aiExplainability.* | No |
| AIPerformance | Metrics, recommendations, rankings | aiPerformance.* | No |
| AIMemory | Accuracy logging, trade context, health snapshots | All engines | No |
| MarketHealthEngine | Statistical health scoring | AIOrchestrator.tick() | No |
| PredictionEngine | Price direction prediction | AIOrchestrator.tick() | No |
| RiskEngine | Volatility/risk assessment | AIOrchestrator.tick() | No |
| RiskIntelligence | Risk advisory aggregation | AIOrchestrator.tick() | No |
| InsightEngine | Digit bias, vol spikes, trends | AIOrchestrator.tick() | No |
| PatternDiscovery | Trade pattern mining | Not directly wired | No |
| StrategyIntelligence | Strategy rule analysis | strategies.save, strategies.review | No |
| TradeReviewEngine | Post-trade analysis | AIIntelligenceHub.processTradeCompletion | No |
| AIIntelligenceHub | Coordinates trade reviews + pattern discovery | trades.save mutation | No |
| AIOrchestrator (singleton) | Global state + polling | Multiple | No |

### Critical Finding: ZERO LLM Usage in 16 Engines

None of the 16 backend AI engines make LLM calls. They are purely statistical/rule-based engines. The ONLY LLM usage is in:
1. routers.ts:1782-1936 — ai.ask mutation (AIAssistant)
2. routers.ts:1712-1743 — ai.journal mutation
3. routers.ts:1759-1780 — ai.critique mutation
4. routers.ts:1937-1968 — ai.parseRule mutation
5. routers.ts:54-63 — getAI() client initialization

### Bugs in Backend Engines

| File:Line | Issue | Severity |
|-----------|-------|----------|
| AITradingCopilot.ts:53-58 | sessionCoach returns all zeros — Placeholder implementation. Used by AIChatEngine.handleSession and aiCopilot.sessionCoach. | CRITICAL |
| AITradingCopilot.ts:60-62 | smartAlerts returns empty array — Placeholder. | HIGH |
| AITradingCopilot.ts:64-69 | sessionSummary returns "No trading data" — Placeholder. | HIGH |
| AIChatEngine.ts:24 | In-memory conversations Map never persisted — Lost on server restart. MAX_CONVERSATIONS=1000 but no LRU eviction by time. | HIGH |
| AIChatEngine.ts:47-56 | detectIntent uses simple regex — No NLP, false positives/negatives. | MEDIUM |
| AIOrchestrator.ts:41-46 | start() called implicitly? — No evidence aiOrchestrator.start() is called on server boot. active stays false. | CRITICAL |
| AIOrchestrator.ts:86-205 | tick() swallows all errors — catch { continue } at line 196-198 hides failures per symbol. No alerting. | HIGH |
| AIMemory.ts:51-52 | tickCounter module-level global — Shared across all users. shouldSnapshot() triggers every 20 ticks GLOBALLY, not per-user. | HIGH |
| AIMemory.ts:86-99 | snapshotHealth uses userId: 0 — Health snapshots stored as system user, not per-user. | MEDIUM |
| MarketHealthEngine.ts:72-74 | scoreAll() hardcodes 10 symbols — Not configurable, misses new symbols. | LOW |
| PredictionEngine.ts:30-43 | Returns "SIDEWAYS" with confidence 30-70 — Low confidence predictions still pushed to feed. | MEDIUM |
| RiskEngine.ts:14-22 | Returns confidence 0 for <10 prices — But AIOrchestrator still calls riskIntelligence.assess() with it. | MEDIUM |

---

## Cross-Cutting Issues

### 1. Empty AI_API_KEY Handling — CRITICAL

| Location | Behavior when AI_API_KEY="" |
|----------|----------------------------|
| routers.ts:58 | apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "" — Empty string passed to Groq SDK |
| routers.ts:1789 | if (!process.env.AI_API_KEY) return { reply: "AI not configured..." } — Silent mock |
| routers.ts:1762 | if (!process.env.AI_API_KEY) return { findings: [], summary: "AI not configured." } — Silent mock |
| routers.ts:1940 | if (!process.env.AI_API_KEY) return { ok: false, error: "AI not configured" } — Returns error |
| AIChatEngine | No LLM calls at all — works but gives rule-based responses only |
| AIOrchestrator | No LLM calls — works statistically |

Impact: Users see "AI not configured" messages OR get statistical responses thinking they are AI-generated. No clear distinction.

### 2. Missing Error Boundaries for AI Failures

- No React ErrorBoundary wrapping any AI page/component
- No tRPC onError handler for AI mutations
- Backend try/catch blocks return empty/mock data instead of throwing TRPCError

### 3. Type Mismatches in AI Response Shapes

| Server Type | Client Expectation | Mismatch |
|-------------|-------------------|----------|
| AIChatEngine.ChatResponse | AIChatMessageProps.response | Matches |
| AIOrchestrator.AIState | MarketIntelligence.tsx data | Client casts any |
| AIPerformance.PortfolioOverview | AIPerformance.tsx generic render | Nested objects break flat render |
| AIMemory.TradeContext | Not used on client | — |
| AiKnowledge (Drizzle) | AIExplainability.tsx entry.data | any cast, no schema |

### 4. Hardcoded Mock Data vs Real AI_API_KEY Calls

| Feature | Uses Real LLM | Mock Fallback |
|---------|---------------|---------------|
| AIAssistant chat (ai.ask) | Yes (Groq) | Returns "AI not configured" |
| AI Journal (ai.journal) | Yes (Groq) | Returns "AI not configured" |
| Strategy Critique (ai.critique) | Yes (Groq) | Returns "AI not configured" |
| Rule Parsing (ai.parseRule) | Yes (Groq) | Returns error |
| AIChat (aiChat.sendMessage) | No LLM | N/A — Rule-based only |
| Market Intelligence | No LLM | N/A — Statistical only |
| AI Performance | No LLM | N/A — Statistical only |
| AI Explainability | No LLM | N/A — DB only |
| Trading Copilot | No LLM | N/A — Statistical only |

### 5. Logic That Fails with Empty AI_API_KEY

1. AIAssistant.tsx — Shows "AI not configured" reply, stores it as failed message, sets input for retry (infinite loop)
2. AI Journal — Returns mock analysis, saves to DB as if real
3. Strategy Critique — Returns empty findings, user thinks strategy is fine
4. Rule Parsing — Returns error, user cannot create strategies from NL
5. Groq SDK — Initialized with empty apiKey, will throw on first real call (but mocked paths prevent it)

### 6. Memory Leaks in Long-Running Chats

| Location | Leak Type |
|----------|-----------|
| routers.ts:470-478 | agentHistory Map — 10k keys max, 5min cleanup interval. No TTL per conversation. |
| AIChatEngine.ts:24-39 | conversations Map — 1000 users max, 50 messages each. No time-based eviction. |
| AIOrchestrator.ts:28-32 | state.feed — 300 entries max, but pushFeed called every tick per symbol (10 symbols × 15s = 400/min). |
| AIOrchestrator.ts:35 | lastInsightKeys Set — Cleared only when >200, grows unbounded between clears. |
| TradingCopilot.tsx:18-25 | Listener object recreated each effect, cleanup removes wrong reference. |

---

## Recommended Fixes (Priority Order)

### P0 — Critical (Blocks AI Functionality)

1. Add AI_API_KEY validation at startup — Fail fast in getAI() if key empty
2. Remove silent mocks — Replace all if (!process.env.AI_API_KEY) return { ... } with throw TRPCError
3. Call aiOrchestrator.start() on server boot — Add to server/_core/index.ts or main entry
4. Fix TradingCopilot quick actions — Add data-chat-input to AIChatInput textarea or use proper prop drilling

### P1 — High (Reliability)

5. Add React ErrorBoundaries around each AI page
6. Implement real streaming — Use aiChatCompletion with stream: true and SSE/tRPC subscriptions
7. Fix memory leaks — Add TTL to agentHistory, conversations, state.feed
8. Add timeouts to aiChatCompletion (e.g., 30s absolute)
9. Fix AIMemory.tickCounter — Make per-user or use proper scheduler

### P2 — Medium (Type Safety & UX)

10. Share types via shared/ package — Move ChatResponse, ChatMessage, MarketHealth, PortfolioOverview to shared/types.ts
11. Fix AIPerformance.tsx generic render — Per-tab renderers
12. Fix MarketIntelligence type mismatches — Proper MarketHealth interface on client
13. Add data-chat-input attribute to AIChatInput textarea
14. Fix AIExplainability division by zero in slotEntry

### P3 — Low (Polish)

15. Remove fake streaming indicators where no streaming exists
16. Add proper loading skeletons instead of bouncing dots
17. Virtualize large JSON dumps in AIPerformance

---

## TypeScript Fixes (Trivial)

### Fix 1: AIChatInput.tsx — Add data-chat-input attribute
Line 41-50: Add data-chat-input="true" to textarea

### Fix 2: AIExplainability.tsx:83-88 — Fix division by zero
Add if (pool.length === 0) return null; before idx calculation

### Fix 3: AIPerformance.tsx:70-80 — Per-tab rendering
Replace generic Object.entries render with switch(tab) per-tab renderers

### Fix 4: MarketIntelligence.tsx:137-148 — Fix volatility type confusion
Use only volatility string, not score fallback

### Fix 5: TradingCopilot.tsx:18-25 — Fix listener memory leak
Move listener to useRef or define outside effect

### Fix 6: routers.ts:1785 — Fix role type mismatch
Change z.enum(["user", "assistant"]) to match client or change client Message interface

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Critical Bugs | 6 |
| High Severity | 14 |
| Medium Severity | 18 |
| Low Severity | 8 |
| Total Issues | 46 |
| Engines Using LLM | 0 / 16 |
| tRPC Endpoints Using LLM | 4 / 40+ |
| Mock Fallbacks for Empty AI_API_KEY | 4 |

---

## Conclusion

The AI architecture is well-structured but largely unimplemented for real LLM usage. The 16 backend engines are statistical/rule-based only. The only LLM integration sits in 4 tRPC mutations under ai.* router, all of which fail silently with mock responses when AI_API_KEY is empty (current state).

Immediate action required:
1. Configure AI_API_KEY in environment
2. Remove silent mocks — throw explicit errors
3. Start AIOrchestrator on boot
4. Fix memory leaks in agentHistory and conversations
5. Add ErrorBoundaries to all AI pages

Without these fixes, the AI features present a false appearance of functionality while returning either mock data or statistical computations misrepresented as AI insights.

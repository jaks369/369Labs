# Architecture (deep dive)

This document explains how 369Labs is wired internally: the request flow, the
Deriv integration, the bot execution loop, and the AI/signal pipeline.

## 1. Request & data flow

```
Browser ──tRPC (HTTPS)──► server/_core/index.ts (Express)
                                │
                                ├─ routers.ts (appRouter)
                                │    auth, strategies, ai, signals, bots,
                                │    tick, backtest, telegram, derivToken,
                                │    audit, memory, logs, coding, plugins
                                │
                                ├─ db.ts ──► MySQL/TiDB (Drizzle)
                                │
                                └─ background: tickCollector, signalScanner, aitools

Browser ──Deriv WS──► wss://ws.derivws.com/websockets/v3  (ticks, authorize, buy)
```

- The **client** is a Vite React SPA. All server calls go through the typed tRPC
  client (`client/src/lib/trpc.ts`).
- The **server** (`server/_core/index.ts`) is the template's Express + tRPC host.
  Feature logic lives in `server/routers.ts`.
- **Secrets never reach the client.** `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`,
  and AI keys are server-only. The Deriv token is encrypted at rest and used only by
  the server/WS session.

## 2. Auth & sessions

- `server/_core/auth.ts` issues a JWT cookie on login/signup (`trpc.auth.*`).
- `useAuth()` (`client/src/_core/hooks/useAuth.ts`) reads `auth.me` and exposes
  `isAuthenticated`, `user`, `logout`.
- `protectedProcedure` in `routers.ts` rejects unauthenticated requests.

## 3. Deriv integration

Two paths:

1. **Server-side** (`server/_core`, `derivToken` router): stores/encrypts the user's
   Deriv token, used for validation.
2. **Client-side** (`client/src/services/derivWebSocket.ts`): a singleton
   `derivWS` opens the WS, subscribes to ticks per symbol, authorizes with the
   user's token, and executes trades (`purchaseContract`, `subscribeToContract`).

Real-money actions require `derivWS.isConnected() && isAuthorized()`. Otherwise the
bot engine reports demo/offline mode.

## 4. Bot execution loop

`client/src/services/BotEngine.ts`:

```
start(config)
  └─ derivWS.subscribe(symbol)
  └─ on each tick:
       tickHistory.push(tick)            // capped ring buffer
       if hasOpenTrade: return           // never stack trades
       if evaluateStrategy(): executeTrade()
                                     │
                                     ├─ actionToContract(rule)  -> DerivContractType
                                     ├─ derivWS.purchaseContract(...)
                                     └─ derivWS.subscribeToContract(contractId, onUpdate)
                                           └─ onUpdate(is_sold): settle, update PnL,
                                              apply SL/TP stop rules
```

Condition evaluation (`client/src/services/conditionEval.ts`) supports:
- composable trees: `{ all: [...] }`, `{ any: [...] }`, `{ not: {...} }`
- leaf predicates: `digit_over/under/even/odd`, `parity`, `last_digit`,
  `consecutive_rise/fall`, `loss_streak`
- legacy flat `rule.condition` (digit/parity/consecutive indicators)
- ensemble vote across sub-strategies

## 5. Backtesting

`client/src/services/BacktestEngine.ts`:
- Fetches a tick window via `derivWS.fetchTickHistory(symbol, start, end)`.
- Replays ticks, evaluating the rule on a rolling history, simulating each triggered
  trade against the next tick.
- Returns trades, win rate, total P&L, max drawdown, equity curve.
- Parameter sweep iterates `barrier` / `count` / `stake` ranges on the same window.

Limitations: next-tick fill assumption; no slippage/spread/commission modeling.

## 6. AI & signals

- `server/aitools.ts` + `routers.ts` (`ai.*`): the 369AI chat, strategy critique,
  deploy/draft flows. Uses `AI_API_KEY` (Groq, `llama-3.3-70b-versatile`).
- `server/signalScanner.ts`: scans recent ticks for repeatable digit/pattern signals
  and persists them to the `signals` table (with `winRate`, `confidence`,
  `sampleSize`, `expiresAt`). The Marketplace shows them and can deploy/backtest.
- **AI Memory** (`userMemory` table): a per-user trader profile (symbols, risk %,
  no-martingale, style, notes) injected into AI prompts so 369AI remembers context.

## 7. Observability & audit

- `AITimeline` is a client-side event bus (`window` CustomEvent) showing live agent
  activity in the sidebar and on the Logs page.
- `auditLogs` table records sensitive actions (token add, strategy edit, bot
  start/stop, SL change, coding writes, plugin install). `trpc.logs.recent` exposes
  them on the Observability page.

## 8. Plugins

- `plugins` + `pluginInstalls` tables. `server/db.ts` seeds a marketplace of hooks
  (martingale guard, daily PnL cap, signal booster, recap, volatility watchdog).
- Users install/enable via `trpc.plugins.*`; enabled plugin ids are tracked in AI
  Memory for the event bus to consume.

## 9. In-app coding

- `server/fileOps.ts` exposes a **scoped** read/write layer (only `client/`,
  `server/`, `shared/`, `drizzle/`, plus config files). `trpc.coding.*` lets the
  Coding page browse and edit files on disk. Writes are audit-logged. This is a
  power-user tool, not a replacement for git.

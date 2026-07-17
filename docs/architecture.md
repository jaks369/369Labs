# Architecture

This is the single source of truth for how 369Labs is built. Read this before
contributing. If a diagram contradicts the code, the code wins — please open an
issue.

## System overview

```
                         ┌─────────────────────────────┐
                         │        Browser (SPA)        │
                         │  React + Vite (client/src)  │
                         │  pages/ components/ services│
                         └──────────────┬──────────────┘
                    tRPC (HTTPS) │      │  Deriv WS (wss)
                                    ▼      ▼
                         ┌─────────────────────────────┐
                         │   Node server (Express)     │
                         │   server/_core/index.ts     │
                         │   ├─ routers.ts (appRouter) │
                         │   ├─ tickCollector / scanner │
                         │   └─ aitools / db            │
                         └───────┬───────────────┬──────┘
                                 │               │
                          ┌──────▼──────┐  ┌─────▼──────┐
                          │ MySQL/TiDB  │  │ Deriv API  │
                          │ (Drizzle)   │  │ (WS+REST)  │
                          └─────────────┘  └────────────┘
```

## Component diagrams

### Frontend
```
client/src/
├── pages/        one component per route
├── components/   DashboardLayout, CommandPalette, AITimeline, RuleBuilder, …
├── services/     derivWebSocket, BotEngine, BacktestEngine, conditionEval
├── _core/        template auth/session hooks (useAuth)
├── lib/trpc.ts   tRPC client
└── hooks/        shared client hooks
```

### tRPC layer
```
Client (trpc.react-query)
        │  typed procedures
        ▼
appRouter (server/routers.ts)
   auth · strategies · ai · signals · bots · tick · backtest
   telegram · derivToken · audit · memory · logs · coding · plugins
        │
        ▼
ctx.user (JWT) ──► protectedProcedure
        │
        ▼
db (Drizzle) · external APIs (Deriv, Groq)
```

### Trading engine (current)
```
derivWS (WS singleton)
   │ subscribe(symbol) ── ticks ──►
BotEngine.start(config)
   └─ onTick → tickHistory (ring buffer)
        └─ evaluateStrategy()
             ├─ conditionEval tree (all/any/not)
             ├─ legacy rule.condition
             └─ ensemble vote
        └─ executeTrade()
             └─ purchaseContract → subscribeToContract
                  └─ handleContractUpdate → settle, SL/TP
```
> See [trading-engine.md](trading-engine.md) and the planned `engine/` refactor.

### Database
```
users · derivTokens · strategies · trades · botRuns
telegramSettings · notificationSettings · tickHistory
signals · auditLogs · userMemory · plugins · pluginInstalls · jobs
```
Accessed only via `server/db.ts` (Drizzle). Schema: `drizzle/schema.ts`.

### Deriv API
```
Browser ──wss://ws.derivws.com/websockets/v3──► Deriv
  ticks (stream) · authorize (token) · proposal · buy
  proposal_open_contract (settle) · active_symbols · balance
```
Real-money requires `derivWS.isConnected() && isAuthorized()`; otherwise demo mode.

### Background jobs
```
tickCollector      – stream & persist ticks
signalScanner      – AI scan for repeatable patterns → signals table
aitools            – 369AI chat, critique, deploy/draft
(planned) jobs     – reconnects, balance sync, market refresh, AI analysis, notify
```

## Request lifecycle (auth)
```
login ─► JWT cookie ─► useAuth() ─► protectedProcedure(ctx.user) ─► router logic
```

## How a trade flows
1. User deploys a strategy → `bots.start` → `BotEngine` subscribes to symbol ticks.
2. Each tick is evaluated against the rule (tree / flat / ensemble).
3. On trigger, if authorized: `proposal` → `buy` → subscribe to contract.
4. On `proposal_open_contract` settle: update PnL, apply SL/TP stop rules.
5. If not authorized: demo/offline mode, no fabricated results.

## Principles
- **Secrets never reach the client.** DB/JWT/encryption/AI keys are server-only.
- **One executable strategy shape.** The bot engine runs `rule` only.
- **Fail safe.** No token → demo mode; bad external call → classified error.
- **Audit everything sensitive.** See `auditLogs` + Observability page.

Next: [trading-engine.md](trading-engine.md) · [api.md](api.md) ·
[deployment.md](deployment.md) · [security.md](security.md)

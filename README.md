# 369Labs — AI Operating System for Algorithmic Trading

369Labs is a full-stack web app for building, backtesting, and running automated
trading bots on the **Deriv** platform. It pairs a no-code strategy builder with a
multi-agent "369AI" assistant, live tick streaming, risk analytics, an observability
timeline, a plugin system, and an in-app coding mode.

> ⚠️ **Not financial advice.** Trading involves substantial risk. 369Labs is an
> analysis and automation tool. Never trade with money you cannot afford to lose,
> and validate every strategy on a demo account first.

---

## Table of Contents
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [How strategies execute](#how-strategies-execute)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Deriv API setup](#deriv-api-setup)
- [Deployment](#deployment)
- [RuFlo agent orchestration](#ruflo-agent-orchestration)
- [Troubleshooting](#troubleshooting)
- [Trading credibility & limitations](#trading-credibility--limitations)

---

## What it does
- **Command Center** — grouped navigation, ⌘K command palette, and a live AI timeline.
- **No-code Strategy Builder** — visual IF/THEN rules, composable AND/OR/NOT
  condition trees, block canvas, and ensemble (vote-based) strategies.
- **369AI Assistant** — chat agent that analyzes live Deriv ticks, suggests
  strategies, and can queue trade/backtest actions for confirmation.
- **Backtesting** — replay historical ticks, measure win rate, drawdown, equity
  curve, and run parameter sweeps.
- **Bots** — deploy strategies to a live WebSocket engine; demo/offline mode when no
  authorized Deriv token is present.
- **Analytics** — drawdown, exposure, risk:reward, win/loss breakdown.
- **Observability** — live agent timeline + server audit trail.
- **Journal** — AI-written post-trade reasoning (why a trade won/lost).
- **Replay** — scrub historical ticks and score manual decisions.
- **Marketplace** — publish/clone community strategies; confidence-scaled stake.
- **Workflows** — preset automation chains (scan → backtest → risk → notify).
- **AI Coding mode** — browse/edit project files in-app; ask 369AI to refactor.
- **Plugins** — installable hooks (risk guards, signal re-rankers, recaps).
- **Voice control** — Web Speech API commands ("backtest", "deploy", …).

---

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Browser (React + Vite)  │         │   Node server (Express + tRPC)│
│  client/src/             │  HTTPS  │   server/_core/index.ts        │
│  - pages/* (UI)          │ ◄──────► │   - TRPC routers (appRouter)  │
│  - components/*          │  tRPC   │   - Deriv WebSocket collector  │
│  - services/*            │         │   - signal scanner (AI)        │
│  - DerivWebSocket (WS)   │         │   - auth / session (JWT)       │
└──────────────────────────┘         └───────────────┬──────────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │  TiDB / MySQL (Drizzle)│
                                          │  users, strategies,    │
                                          │  trades, signals,      │
                                          │  auditLogs, plugins…   │
                                          └─────────────────────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │  Deriv WebSocket API  │
                                          │  (ticks, authorize,   │
                                          │   buy/proposal)       │
                                          └─────────────────────────┘
```

- **Client** renders the SPA, talks to the server via **tRPC** (typed), and opens a
  direct **Deriv WebSocket** for live ticks and trade execution.
- **Server** is an Express app (from the template's `_core`) exposing a tRPC router.
  Background workers stream ticks, scan for AI signals, and run the bot engine.
- **Database** is MySQL-compatible (TiDB) accessed through **Drizzle ORM**. Schema
  lives in `drizzle/schema.ts`; boot scripts auto-create missing tables/columns.

---

## How strategies execute

1. **Author** a strategy in the Strategy Builder. The engine only runs the
   `rule` shape (symbol + condition + action + stake/SL/TP). The visual
   "blocks" canvas and "ensemble" vote are stored but the executable path is the
   rule object.
2. **Deploy** → the client calls `trpc.bots.start` (or the AI queue), which
   instantiates a `BotEngine` (`client/src/services/BotEngine.ts`) subscribed to the
   symbol's tick stream via `derivWS`.
3. **Per tick**, the engine evaluates the condition:
   - composable `rule.conditions` tree (`conditionEval.ts`), or
   - the flat `rule.condition` (legacy digit/parity/consecutive indicators), or
   - an ensemble vote across sub-strategies.
4. **On a trigger**, if `derivWS.isConnected() && isAuthorized()`, it sends a
   Deriv `proposal` → `buy`, then subscribes to `proposal_open_contract` for the
   settled result. Stake/SL/TP are enforced.
5. **No token / not authorized** → the engine stays in **demo/offline mode**: it
   does *not* fabricate wins/losses; it reports that a live, authorized session is
   required. This is the built-in paper-trading guard.

---

## Project structure

```
client/src/
  pages/         # one file per route (Dashboard, Bots, Backtesting, …)
  components/    # UI + shared widgets (DashboardLayout, CommandPalette, AITimeline, …)
  services/      # derivWebSocket.ts, BotEngine.ts, BacktestEngine.ts, conditionEval.ts
  _core/         # template auth/session hooks
  lib/trpc.ts    # tRPC client

server/
  _core/         # template framework (auth, trpc, env, vite, …)
  routers.ts     # appRouter (all feature routers)
  db.ts          # Drizzle access + table bootstrap
  tickCollector.ts, signalScanner.ts, aitools.ts
  ruflo/         # agent orchestration CONFIG (see docs/ruflo.md)

drizzle/
  schema.ts      # all tables
  migrations/    # generated migrations

shared/          # shared types/const
```

**Client vs server responsibilities**
- *Client* owns UI, live tick rendering, the bot execution loop, and Deriv WS.
- *Server* owns auth/sessions, persistence, AI calls, signal scanning, and the
  tRPC API surface. Secrets (DB, JWT, encryption, AI keys) never reach the client.

---

## Local development

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, …
pnpm dev                    # tsx watch server/_core/index.ts (NODE_ENV=development)
```

The Vite dev server proxies `/api` to the Node backend. Open the printed URL.

Build / start (production-like):
```bash
pnpm build                  # vite build (client) + esbuild (server) -> dist/
pnpm start                  # node dist/index.js
```

Database schema:
```bash
pnpm db:push                # drizzle-kit generate + migrate
```
Boot also auto-creates newer tables (userMemory, plugins, …) if missing.

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string |
| `JWT_SECRET` | ✅ | Session-signing secret (long random) |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex key for encrypting Deriv tokens at rest |
| `OWNER_EMAIL` | – | Email auto-granted admin role on signup |
| `DERIV_API_APP_ID` | – | Server-side Deriv app id (validation/trading) |
| `VITE_DERIV_APP_ID` | – | Client-side Deriv WS app id (default `1089`, demo) |
| `AI_API_KEY` | – | Groq key used by the 369AI chat (model `llama-3.3-70b-versatile`) |
| `OPENAI_API_BASE_URL` | – | Override base URL for AI calls (Render) |
| `RUFLO_API_KEY` / `RUFLO_API_URL` / `RUFLO_MODEL` | – | RuFlo agent layer (falls back to OpenAI vars) |
| `NODE_ENV` | – | `development` / `production` |
| `PORT` | – | Server port (default 3000) |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # JWT_SECRET
```

---

## Deriv API setup

1. Create a Deriv app id at <https://app.deriv.com/account/api-token> (or use the
   default demo `1089`).
2. Generate a **token** with `Read`, `Trade`, and `Payments` scopes.
3. In 369Labs → **Settings**, paste the token and save. The client connects via
   `derivWS.setApiToken(...)` and authorizes the WS session.
4. Live trading only works once the token is valid and authorized. Until then the
   bot engine runs in demo/offline mode.

> The token is encrypted at rest (`ENCRYPTION_KEY`) and sent over the authorized
> WebSocket — it is never exposed to the browser unencrypted beyond the session.

---

## Deployment

The repo deploys on **Render** (`render.yaml`). The web service runs
`pnpm install && pnpm db:push && pnpm build` then `node dist/index.js`.

Notes:
- Set all **Required** env vars in the Render dashboard.
- The free Render tier **sleeps** when idle — bots will pause mid-trade. Use a paid
  always-on instance before unattended real-money trading.
- `package.json` build is `vite build && esbuild server/_core/index.ts …`; ensure
  `render.yaml` build command matches your deploy (the template's `pnpm build`).

A `Vercel` note exists in the legacy README, but the current deploy target is Render.

---

## RuFlo agent orchestration

RuFlo is a **server-side agent configuration** (`server/ruflo/config.ts`) defining
four agent roles — `strategy-architect`, `risk-reviewer`, `deriv-execution`,
`support-triage` — with system prompts and handoff graphs. It is wired through the
`RUFLO_*` env vars and is intended to back multi-agent strategy generation.

**Current status:** RuFlo is **config/definition only** in this repo — there is no
router that invokes it at runtime yet, so it does not affect the live app today.
The root `orchestrator.ts` is a **separate, dev-time CLI** (Gemini CLI + OpenCode
CLI) for AI-assisted code changes, not a user-facing runtime feature.

See [`docs/ruflo.md`](docs/ruflo.md) for the orchestrator CLI usage, and
`server/ruflo/config.ts` for the agent definitions.

---

## Troubleshooting

- **Build fails with "X is not exported by …"** — a component is imported as a named
  import but is a default export (or vice-versa). Fix the import style.
- **`The token is invalid` in bot logs** — regenerate the Deriv token with
  Read+Trade+Payments scopes and re-save in Settings.
- **Bots silent / no trades** — free Render tier sleeps; upgrade to paid, or run
  locally with `pnpm dev`.
- **DB connection errors** — verify `DATABASE_URL` and that TiDB allows the deploy
  IP / uses TLS as required.
- **AI chat not responding** — check `AI_API_KEY` (Groq) and `OPENAI_API_BASE_URL`.
- **`pnpm test` fails on `auth.logout.test.ts`** — that template test references the
  old `users.openId` auth and was removed; if you forked earlier, delete it.

---

## Trading credibility & limitations

- **Backtesting methodology** — `BacktestEngine` replays a fetched tick window and
  simulates each triggered trade against the *next* tick using the chosen contract
  type (Rise/Fall, Digit Even/Odd/Over/Under). It reports total trades, win rate,
  cumulative P&L, max drawdown, and an equity curve, plus a parameter sweep. It is a
  **point-in-time simulation**, not a tick-accurate exchange emulator: it assumes
  immediate fill at the next tick price and does **not** model slippage, spread,
  commission, or contract expiry dynamics beyond the next-tick outcome.
- **Paper / demo trading** — the bot engine enters demo/offline mode when no
  authorized Deriv token is present; it will not fabricate results. This is the
  safe default for evaluation.
- **Execution latency** — real orders go over the Deriv WebSocket
  (`proposal` → `buy` → `proposal_open_contract`). Latency depends on network,
  Deriv load, and contract type; no formal SLA is measured or claimed. Validate
  end-to-end on a demo account before risking capital.
- **No guaranteed returns** — win rates and backtests are historical and do not
  predict future performance.

---

## License
MIT (per template). See individual files.

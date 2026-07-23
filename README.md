# 369Labs

Automated Trading Bot Platform built for the Deriv API.

## Features
- Cyberpunk-themed trading dashboard
- No-code strategy builder (visual IF/THEN, blocks, ensemble modes)
- AI-powered strategy generation, analysis, and journaling
- Real-time tick streaming and visualization (TradingView Lightweight Charts)
- Automated bot deployment (paper + live via Deriv API)
- Backtesting engine with PnL, win rate, Sharpe, drawdown metrics
- Price alerts, push notifications, audit logging
- Google OAuth, email/password auth, 2FA
- Telegram and email notifications
- Plugin system for community extensions

## Tech Stack
- **Frontend:** React 19 + TypeScript, Tailwind CSS, tRPC React Query, Monaco Editor, TradingView Lightweight Charts
- **Backend:** tRPC v11, Node.js, PostgreSQL (via Drizzle ORM + postgres.js/mysql2)
- **AI:** OpenAI/Groq-compatible API, ReAct agent routing, strategy intelligence, market analysis
- **Infrastructure:** Redis (sessions/cache), Vercel-ready deployment

## Local Development
1. Clone the repository
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — PostgreSQL or MySQL connection string
   - `REDIS_URL` — Redis connection string (optional, falls back to in-memory)
   - `AI_API_KEY` — OpenAI/Groq-compatible API key for AI features
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for OAuth
   - `RESEND_API_KEY` — for email notifications
   - `SESSION_SECRET` — random string for session encryption
4. Run database migrations: `pnpm db:push`
5. Start dev server: `pnpm dev`
6. Open `http://localhost:5173`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Database connection string (mysql:// or postgres://) |
| `AI_API_KEY` | Yes | OpenAI/Groq API key for AI features |
| `SESSION_SECRET` | Yes | Encryption key for sessions |
| `REDIS_URL` | No | Redis for session storage (in-memory fallback) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `RESEND_API_KEY` | No | Resend API key for transactional emails |
| `AI_MODEL` | No | Override AI model (default: llama-3.3-70b-versatile) |
| `AI_API_BASE_URL` | No | Custom AI API endpoint |
| `OWNER_EMAIL` | No | Auto-assigns admin role on signup |

## Project Structure
```
369Labs/
├── client/          # React frontend (Vite + tRPC)
│   └── src/
│       ├── pages/   # Route pages (Dashboard, Bots, StrategyBuilder, etc.)
│       ├── components/  # Reusable UI components
│       ├── services/    # Deriv WS, BotEngine, BacktestEngine
│       └── hooks/       # Custom React hooks
├── server/          # tRPC server
│   ├── routers.ts   # All tRPC endpoints
│   ├── db.ts        # Database access layer
│   ├── _core/       # Auth, cookies, encryption, env, session
│   ├── ai/          # AI engine, agents, intelligence, memory
│   ├── aitools.ts   # AI tool definitions (tick history, stats, etc.)
│   ├── botRunner.ts # Server-side bot execution
│   └── signalScanner.ts  # Automatic pattern detection
├── drizzle/         # Database schema (Drizzle ORM)
│   └── schema.ts    # All table definitions
└── shared/          # Shared constants
```

## Scripts
- `pnpm dev` — Start dev server (client + server)
- `pnpm build` — Build for production
- `pnpm db:push` — Push schema changes to database
- `pnpm db:generate` — Generate Drizzle migrations
- `tsc --noEmit` — Type-check without emitting

## Deployment
This project is ready for deployment on Vercel. Set the environment variables in your Vercel project dashboard and deploy from the `master` branch.

## RuFlo Agent Orchestration
RuFlo is available as a server-side AI agent orchestration layer. See `docs/ruflo.md` for configuration, local usage, GitHub CI, and Vercel deployment notes.

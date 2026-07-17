# Deployment

## Target: Render (web service)

`render.yaml` defines a Node web service:

```
buildCommand: pnpm install --no-frozen-lockfile && pnpm db:push && pnpm build
startCommand: node dist/index.js
```

> The repo's `package.json` build is `vite build && esbuild server/_core/index.ts …`.
> Keep `render.yaml`'s build command consistent with what actually produces `dist/`.

## Environment variables (Render dashboard)

Required: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`.
Feature: `AI_API_KEY` (Groq), `OPENAI_API_BASE_URL`, `VITE_DERIV_APP_ID`,
`DERIV_API_APP_ID`, `OWNER_EMAIL`, `RUFLO_*`.

See [README.md → Environment variables](../README.md#environment-variables) for the
full table and how to generate secrets.

## Boot sequence
1. `ensureSignalExpiryColumn()`, `recomputeLastDigits()`, `pruneBadTicks()`.
2. `ensureUserMemoryTable()`, `ensurePluginsTable()` (auto-create new tables).
3. Start tick collector + signal scanner.
4. Listen on `PORT` (default 3000).

## Health checks

Expose `/health` (see [security.md](security.md) → production readiness). It reports
DB connectivity, Deriv WS status, AI provider status, uptime, and queue health.

## Scaling notes
- **Free tier sleeps** → bots pause mid-trade. Use a paid always-on instance before
  unattended real-money trading.
- WebSocket connections are per-instance; multiple instances need sticky sessions or
  a shared bot coordinator (future work).
- Use a connection pool / read replica for TiDB under load.

## Rollback
- Render keeps prior deploys; roll back via dashboard. Because DB migrations are
  additive (boot-created tables), down-migrations are rare.

## Local production-like run
```bash
pnpm build && pnpm start
```

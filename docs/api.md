# API

369Labs exposes a single **tRPC** router (`appRouter` in `server/routers.ts`).
All calls are typed end-to-end; the client imports `AppRouter` for inference
(`client/src/lib/trpc.ts`).

## Routers

| Router | Key procedures | Auth |
|---|---|---|
| `auth` | `me`, `login`, `signup`, `logout` | public/protected |
| `strategies` | `list`, `getById`, `save`, `publish`, `delete` | protected |
| `ai` | `ask`, `critique`, `journal`, `deployBot`, `memory` (via `memory`) | protected |
| `signals` | `list`, `getById` | protected |
| `bots` | `start`, `stop`, `list`, `getStatus` | protected |
| `tick` | `history`, `subscribe` | protected |
| `backtest` | `run` | protected |
| `telegram` | `getSettings`, `saveSettings` | protected |
| `derivToken` | `getToken`, `saveToken`, `deleteToken` | protected |
| `audit` | `list` | protected |
| `memory` | `get`, `set` | protected |
| `logs` | `recent` | protected |
| `coding` | `list`, `read`, `write` (scoped to client/server/shared) | protected |
| `plugins` | `marketplace`, `my`, `install` | protected |

## Example (client)
```ts
const { data } = trpc.strategies.list.useQuery();
await trpc.bots.start.mutateAsync({ strategyId: 12, stake: 10 });
```

## Deriv (external) API

Used client-side via `derivWS` (WebSocket) and server-side for validation:

- `ticks` (stream), `authorize`, `proposal`, `buy`, `proposal_open_contract`,
  `active_symbols`, `balance`.

## Classified external errors

Every external call maps to a typed error class so users and devs get actionable
messages (see `server/errors.ts`):

```
NetworkError        – WS/HTTP transport failure, retryable
AuthenticationError – invalid/expired Deriv token (re-auth needed)
RateLimitError      – 429 / Deriv rate limit (back off)
ValidationError     – Zod/reject at the API boundary
ExchangeError       – Deriv rejected the request (business reason)
```

Mapping helper:
```ts
function classifyDeriv(err: unknown): AppError {
  const msg = String(err);
  if (/token|authoriz|session/i.test(msg)) return new AuthenticationError(msg);
  if (/rate|too many|429/i.test(msg))       return new RateLimitError(msg);
  if (/invalid|required|param/i.test(msg))  return new ValidationError(msg);
  if (/network|timeout|econn/i.test(msg))   return new NetworkError(msg);
  return new ExchangeError(msg);
}
```

## Zod at every boundary

Input is validated with Zod at the router level (`protectedProcedure.input(...)`).
Never trust `req.body` / `ctx.input` without a schema. Infer types from the schema
instead of duplicating interfaces:

```ts
const StartBot = z.object({ strategyId: z.number(), stake: z.number().positive() });
// client type = z.infer<typeof StartBot>
```

## Pagination / limits
- `logs.recent` accepts `limit` (default 100).
- Tick history windows are bounded by Deriv; enforce a minimum (≥ 20 ticks).

# Security

Trading apps need stronger security than average. This is the current posture and
the planned hardening.

## Current
- **Auth:** JWT cookie (`JWT_SECRET`), issued by `auth.login/signup`.
- **Token encryption:** Deriv tokens encrypted at rest with `ENCRYPTION_KEY`
  (32-byte hex). Never returned in full to the client.
- **Audit logs:** `auditLogs` records token add, strategy edit, bot start/stop,
  SL change, coding writes, plugin install.
- **Scoped file access:** `coding` router only allows `client/`, `server/`,
  `shared/`, `drizzle/`, and config files (path-traversal guarded).

## Planned / recommended

### Encrypted API secrets
- Already done for Deriv tokens. Extend the same `encryption.ts` helper to any new
  secret stored in DB.

### CSRF protection
- Same-site cookie (`sameSite: none` + `secure`) is set on the session cookie.
  Add a double-submit CSRF token for state-changing tRPC mutations if the app is
  embedded in third-party contexts.

### Rate limiting
- Add per-IP and per-user limits on `auth.login`, `ai.ask`, and `bots.start`.
  Reject with `429 → RateLimitError`.

### Audit logs
- Keep. Add correlation IDs so a request's trail is reconstructable.

### Session expiration
- Set a max age on the JWT and rotate on privilege change. Invalidate on logout
  (already clears cookie + client cache).

### Secure environment validation
- Validate required env vars at boot; fail fast with a clear message instead of
  `undefined` DB connections:

```ts
const required = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY"];
for (const k of required) if (!process.env[k]) throw new Error(`Missing env: ${k}`);
```

### Content Security Policy
- Add a `Content-Security-Policy` header (no inline scripts, restrict
  `connect-src` to the API + Deriv WS + AI provider). The Vite dev server should be
  excluded in dev only.

### Production readiness (/health)
Expose a health endpoint reporting:

```json
{
  "status": "ok",
  "uptime": 12345,
  "db": "connected",
  "derivWs": "open",
  "aiProvider": "ok",
  "queue": "idle"
}
```

Used by Render health checks and monitoring.

## Secrets handling
- Never commit `.env`. Use the platform secret store.
- Rotate `JWT_SECRET` / `ENCRYPTION_KEY` on suspicion of exposure (note: rotating
  `ENCRYPTION_KEY` invalidates previously encrypted Deriv tokens — users re-save).

## Threat model (brief)
- **Token theft:** encrypted at rest; user re-auth required to trade.
- **Unauthorized trading:** requires authorized WS session; demo mode otherwise.
- **Abuse of AI/coding:** rate-limit AI; scope file writes; audit both.

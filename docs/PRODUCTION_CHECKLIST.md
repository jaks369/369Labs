# Production Readiness Checklist — Settlement + AI Pipeline

## 1. Automated Tests (gate)
- [ ] `npx vitest run` — all 97+ tests pass, 0 failures
- [ ] SettlementTracker tests: 38/38 pass (start/stop, tick, reconcile, duplicate protection, concurrency, recovery, edge cases, memory leaks)
- [ ] No intermittent failures across 3 consecutive runs

## 2. Every Trade Reaches a Terminal State
- [ ] No `result="pending"` trades older than 5 minutes in production DB
- [ ] SettlementTracker logs show every pending trade gets reconciled each tick
- [ ] Retry cap at 100 prevents infinite loops on truly stuck trades

## 3. No Trade Remains Permanently Pending
- [ ] Client-side: `restorePendingContractsFromLocalStorage()` runs on page load (Dashboard.tsx recovery useEffect)
- [ ] Server-side: `SettlementTracker.runOnce()` called on server boot (`_core/index.ts`)
- [ ] Server-side: every 30s interval re-checks all pending trades

## 4. Settlement Is Recoverable After Failures
- [ ] Page refresh: localStorage persists contractId → client resubscribes on reconnect
- [ ] Tab closed: server SettlementTracker reconciles via `getContractStatus()` one-shot API
- [ ] Server crash: on restart, `SettlementTracker.runOnce()` immediately catches up
- [ ] WS disconnect: `derivManager.ensureConnected()` auto-reconnects on next reconcile

## 5. No Duplicate Settlements
- [ ] `settleTrade()` uses UPDATE + SELECT — idempotent on re-run
- [ ] RetryCount map cleaned up on successful settlement (`retryCount.delete()`)
- [ ] Duplicate test (Scenario 6) confirms: running reconcile 3× produces 1 settlement

## 6. Database Consistency
- [ ] `profitLoss` stored as fixed-point string (e.g. `"8.50000000"`)
- [ ] `exitPrice` stored as string from `c.sell_price.toString()`
- [ ] `exitTime` is a valid Date object
- [ ] All fields non-null for settled trades
- [ ] `asc(entryTime)` ordering in `getPendingTrades()` — oldest trades first

## 7. AI Executes Exactly Once Per Completed Trade
- [ ] `AIIntelligenceHub.processTradeCompletion()` called once in `SettlementTracker.reconcile()` after `settleTrade()` succeeds
- [ ] TRPC `trades.save` mutation also calls AI hub for non-pending manual saves
- [ ] AI errors caught and logged (`.catch(() => {})` — non-critical, never blocks settlement)

## 8. Live Verification Scenarios (all must PASS)
- [ ] Scenario 1: Normal trade — place → pending → settled → AI review → memory → patterns → feed
- [ ] Scenario 2: Browser refresh before settlement — localStorage recovery
- [ ] Scenario 3: Browser closed before settlement — server fallback
- [ ] Scenario 4: Server restart during pending trade — startup catch-up
- [ ] Scenario 5: WebSocket disconnect/reconnect — auto-reconnect on reconcile
- [ ] Scenario 6: Duplicate settlement protection — idempotent reconcile
- [ ] Scenario 7: Multiple simultaneous trades — concurrency
- [ ] Scenario 8: Long-running reliability — 60 ticks, no leaks

## 9. Runbook
```bash
# Run all unit tests
npx vitest run

# Start dev server
npm run dev

# Run live verification (requires API_URL, ADMIN_TOKEN, DERIV_TOKEN)
npx tsx scripts/live-verify.ts

# Direct settlement check
curl -X POST http://localhost:3001/api/trpc/admin.triggerSettlement \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# View pending trades
curl http://localhost:3001/api/trpc/admin.pendingTrades \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 10. Sign-off
- [ ] All automated tests pass (✓ checked)
- [ ] All 8 live scenarios pass (requires deployment)
- [ ] No trades stuck in pending after 5 minutes
- [ ] AI pipeline verified with real data
- [ ] Database consistent after 24h of operation

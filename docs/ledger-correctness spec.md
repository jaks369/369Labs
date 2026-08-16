# Pillar #1 — Ledger Correctness: Implementation Spec

**Goal (definition of done):** A manual trade placed in the Dashboard is guaranteed to appear in the `trades` DB within ~5s of the fill even if the tab closes, and any position that exists on Deriv but is missing or wrong in our DB is detected, reconstructed, settled or flagged — never silently ignored.

---

## 1. Current-state diagnosis (root causes)

| # | Gap | Evidence in code |
|---|-----|------------------|
| G1 | Manual-trade ledger entry depends on the *client* succeeding at `trades.save` after the fill. A failed save (DB cold start, 429, validation) leaves a **real Deriv contract with no ledger row**. | `Dashboard.tsx:61-89` `persistTrade` retries 3× then logs; `handleQuickTrade` at `Dashboard.tsx:321-332` saves AFTER `purchaseContract` succeeded. |
| G2 | `trades.save` **zod validation rejects fills below $0.35** — but the trade was already placed on Deriv with that stake. Validation cannot un-place it, it only creates an unrecorded trade. | `routers.ts:1384-1394` (stake regex + `>= 0.35`); rejection → TRPC `INPUT_VALIDATION_ERROR` → `persistTrade` retries 3× → fails. |
| G3 | Pending-contract persistence is **client-side** (`localStorage.pendingTrade_<id>`). Tab close / storage clear / browser switch loses the settle callback. Server fixes it later *only if the pending row exists* — which G1 already broke. | `derivWebSocket.ts:748-804` (`contractMeta`, `registerContractMeta`, `restorePendingContractsFromLocalStorage`). |
| G4 | No reconciliation between the **Deriv portfolio** (real open contracts, balance) and the **`trades` table**. Nothing detects orphans (position on Deriv, no DB row) or DB pendings that Deriv doesn't know. | `derivConnection.ts` has no `portfolio:` call at all; `tradingService.ts:4-35` returns the live snapshot but never diffs it. |
| G5 | Settlement is dual-path (client WS + server 2s poll). When both fire for one contract, correctness depends on the `(userId, contractId)` mutex in `saveTrade`; if the client path dies, only the server path remains — and it needs a DB row (G1). | `SettlementTracker.ts:77-145` (tick), `db.ts:687-720` (mutexdedup), `db.ts:823-850`. |
| G6 | Stuck detection is wall-clock 30 min with **no earlier signal**; no heartbeat consumers exist beyond Admin. Health is only visible by opening Admin. | `SettlementTracker.ts:13`, `db.ts:1951-1974`, `routers.ts:2903-2908`. |

**Security boundary used throughout:** all fixes run on the server with the user's own Deriv token (existing `derivManager.ensureConnected(userId)`) and only touch `trades` rows for that `userId`. Same ownership rules as current code.

---

## 2. Architecture decisions

**D1 — Server owns the ledger; client is a mirror.**
The `trades` table is the single source of truth for history and P&L. The client WS subscription is retained only as a *low-latency presentation* path. Every server-side reconciliation outcome is idempotent (safe to re-run), because `saveTrade` already dedups on `(userId, contractId)` via `tradeMutex` (`db.ts:687-720`).

**D2 — Deriv portfolio is the ground truth for "what is real".**
Add a request/response `portfolio:` call to `DerivConnection`. Deriv's `portfolio` response returns open + recently sold contracts with `contract_id`, `contract_type`, `underlying`, `buy_price`, `entry_tick`, `purchase_time`, `is_sold`, `profit`. We reconstruct missing rows from these fields. (For contracts sold longer ago than the portfolio window, `trades.save` at fill time + the 2s SettlementTracker remain the primary path — the reconciliation is a safety net, not a replacement.)

**D3 — Fills are never rejected by validation.**
`trades.save` keeps its strict schema for *user-initiated* inputs, but a new idempotent **`trades.recordFill`** endpoint accepts already-placed contract facts (from the client *or* the reconciler) and bypasses the stake clamp, writing the row as-is with an audit note. Rationale: G2 is strictly worse than G1 — an unvalidated row is repairable data; an unrecorded real-money trade is a support ticket.

**D4 — Reconciliation job is a separate module, run on a schedule and on demand.**
New `server/reconciliation.ts` — analogous to `executionEngine`/`SettlementTracker`, started from `_core/index.ts` non-critical block, plus an Admin "Run now" trigger. It is **stat**eless except for a `reconciler_runs` log table (see §3), so restarts are safe.

---

## 3. Schema changes (`drizzle/schema.ts` + `db.ts`)

1. `trades` — add nullable columns:
   - `source` varchar(32) default `'manual' | 'bot' | 'reconcile' | 'import'`
   - `discoveredAt` datetime/null
   - `reconciled` tinyint(1) default 0
   - (`result='stuck'` already supported — used as the "needs human attention" state.)
2. New table `reconciler_runs`:
   - `id` PK auto
   - `runStart` datetime, `runEnd` datetime
   - `userId` int/null (null = full sweep)
   - `actions` json — counts of `{reconstructed, settled, stuck, skippedNoToken, errors}`
   - `createdAt` datetime
3. Index: `(userId, contractId)` unique on `trades` — enforce at DB level what the mutex only approximates. (Verify existing rows first — see M0.)

Add `db.ts` helpers mirroring existing style:
- `getOrphansCandidates()` — trades with `result='pending'` for users who have a Deriv token.
- `reconstructTradeFromContract(userId, contract)` — builds an `InsertTrade` from portfolio fields, calls `saveTrade` (dedup protects double-insert).
- `logReconcilerRun(run)` / `getReconcilerRuns(limit)`.

---

## 4. File changes by component

### 4a. `server/derivConnection.ts`
- Add `async getPortfolio(): Promise<PortfolioContract[]>` — sends `{ portfolio: 1 }`, awaits `msg.contracts`, returns normalized `{ contractId, contractType, symbol, stake(buy_price), entryPrice(entry_tick), purchasedAt(purchase_time), isSold, profit, soldAt(selling_time) }`.
- (Do **not** mutate `_positions` here; keep reactive subscription separate.)

### 4b. New `server/reconciliation.ts`
- `async reconcileUser(userId): Promise<{reconstructed[], settled[], stuck[], error?}>`
  1. `ensureConnected(userId)`; if null → `{skipped: "no_token"}` (do not error-loop).
  2. `getPortfolio()` → map by contractId.
  3. Fetch DB `pending` trades for user.
  4. **A — DB has pending row & Deriv knows the contract** → if `isSold`, settle now via `db.settleTrade` (mirrors `SettlementTracker.reconcile`); else leave (tracker will catch it).
  5. **B — Deriv has an open/recent contract with no DB row** (orphan) → `reconstructTradeFromContract` with `source='reconcile'`, `result='pending'`; the 2s tracker then settles it normally.
  6. **C — DB pending row & Deriv reports nothing** → `markTradeStuck(id, 'contract_not_found')` — same raw-UPDATE path as `SettlementTracker` so it can't silently fail.
  7. Log each action; return counts.
- `async runFullSweep()` — all users with tokens (bounded batch, e.g. 50/users cycle), records `reconciler_runs`.
- `async runReconciliationLoop()` — setInterval at `RECONCILE_INTERVAL_MS = 5 * 60_000`, guarded by an in-flight flag (same pattern as SettlementTracker `running` flag, `SettlementTracker.ts:79`).

### 4c. New endpoint `server/routers.ts`
Under existing `trades` router:
- `recordFill` — zod: `{ contractId, symbol, contractType, stake, entryPrice?, entryTime }`; scoped to `ctx.user.id`; calls `db.reconstructTradeFromContract`-style `saveTrade` with `source='manual_fill'`; **no stake clamp**. Returns the row or `{existed: true}`.
- `reconcile` (protected, self-only) — calls `reconcileUser(ctx.user.id)`; returns counts. (Used by client as a "fix my history" button.)
- `reconRunHistory` (admin only) — `getReconcilerRuns(20)`.

### 4d. `client/src/pages/Dashboard.tsx` (`handleQuickTrade`)
Reorder so the server save is part of the success contract:
1. `purchaseContract(...)` succeeds → immediately `trades.recordFill(contractId, symbol, contractType, stake, entrySpot, entryTime)` (bypasses G2 clamp).
2. On `recordFill` failure → still show the trade log as "placed (pending record)" AND auto-call `trades.reconcile` in the background; never silently drop.
3. Remove the localStorage dependency from the *correctness* path: `derivWS.registerContractMeta` stays only for live UX surfacing; server is authoritative.
4. Subscriber fallback: on settle, call `trades.save` (existing) — dedup makes it safe alongside the tracker.

### 4e. `client/src/pages/Admin.tsx` — "Ledger Health" panel
Rows: pending count, settled today, stuck count, reconciler last run + counts, orphan count reconstructed, Deriv connectivity (heartbeat), per-user mismatch preview. Buttons: "Run reconciliation now".

---

## 5. Milestones

Each milestone is independently shippable and verifiable. App must build (`pnpm check`) and existing tests pass (`pnpm test`) at every marker.

### M0 — Observability & foundation (1–2 days)
- Add `reconciler_runs` table + the 3 `trades` columns (migration + `ensure*` like `_core/index.ts:392-416`).
- Check existing `(userId, contractId)` duplicates; add unique index only if clean (else dedup first, `db.ts:687` handles the worst case).
- **Verify:** `pnpm db:push`; Admin shows new counters; no behavior change.
- **Definition of done:** schema migrates cleanly on the TiDB remote; `tsc` passes.

### M1 — Portfolio read (2–3 days)
- Add `DerivConnection.getPortfolio()`.
- Add `reconciliation.runFullSweep()` in **dry-run mode**: compute A/B/C classifications, log counts, mutate nothing.
- Expose `admin.reconRunHistory` + log rows.
- **Verify:** run once against a user with a real Deriv token; log shows correct A/B/C classification without any DB write.
- **DoD:** whole classification logic proven on live data; no writes.

### M2 — Reconciliation actions (2–3 days)
- Enable reconstruct (B), settle (A), stuck (C) writes, plus `trades.recordFill` + `trades.reconcile` endpoints.
- Start `runReconciliationLoop()` in the `_core/index.ts` non-critical block (`index.ts:380-469` pattern).
- **Verify:** unit tests (new `server/reconciliation.test.ts`) mocking Deriv portfolio for all 3 branches; `pnpm test` green; live dry-run shows real orphan reconstruction on a demo account.
- **DoD:** a contract bought without a DB row (simulate by deleting a row) is auto-reconstructed and then settled within one tracker cycle.

### M3 — Client hardening (2–3 days)
- Dashboard reorder (§4d): blocking `recordFill`, failure banner + auto-reconcile, localStorage demoted to presentation-only.
- **Verify:** dev manual test — place a trade with the DB briefly pointed at a bad connection to force `recordFill` failure → row still appears after reconnect + reconcile.
- **DoD:** "no trades history" ghost state becomes impossible: any Deriv fill → a DB row within seconds, reconciled if save hiccups.

### M4 — Ledger Health UX + tests + ship (2–3 days)
- Admin panel (§4e); trade rows display `source` badge; Portfolio/Data-Trades shows a subtle "reconciled" pulse.
- E2E: manual trade → row pending → tracker settles win/loss → history shows P&L matches Deriv.
- **DoD:** full manual-trade lifecycle verified; regression tests green.

---

## 6. Edge cases & failure modes

| Case | Handling |
|------|----------|
| DB cold start / 429 when `recordFill` called | Client never treats it as success; auto-reconcile retries; reconciler B covers it later. |
| Duplicate fill (client + server both record) | Unique `(userId, contractId)` + existing `saveTrade` mutex dedup. |
| Contract sold before reconciler sees it | `recordFill`/`saveTrade` at fill time covers it; portfolio only shows recent sold — accepted limitation (tracker is primary). |
| Invalid/expired token mid-sweep | `reconcileUser` returns `skipped: no_token`; loop continues; no error spam. |
| Server restart mid-reconciliation | Stateless + wall-clock logic (same as `SettlementTracker` 30-min stuck rule); `reconciler_runs` makes runs idempotent. |
| Concurrent tracker + reconciler settling same contract | Both go through `settleTrade`/`saveTrade` guarded paths; second settle is a no-op on an already non-pending row. |
| User placed trade, then deleted account | Ownership-scoped queries + `USER_SCOPED_TABLES` deletion order already handle child rows. |
| Deriv API moment (returned contract_was_sold etc.) | `getPortfolio` errors → log `errors`, skip user, next cycle; heartbeat reflects it. |

---

## 7. Verification plan (per milestone)

- `pnpm check` — type safety after every change.
- `pnpm test` — new `reconciliation.test.ts` (portfolio mock: `SettlementTracker.test.ts` already shows the mock pattern), plus existing `SettlementTracker.test.ts` must stay green.
- Live (demo account): the 3-step manual lifecycle in §M3 DoD.
- Observability: `admin.systemHealth` / heartbeat timestamp advancing every 2s; `reconciler_runs` rows appearing on schedule.

---

## 8. Rollout / rollback

- Land M0 → M2 as one deploy (schema + server-only). M3 (client) can go in a second deploy.
- Rollback: M0/M2 are additive schema + a new interval; revert = remove `runReconciliationLoop()` start line and drop new endpoints. `recordFill`/reconstruct rows can be deleted (`source='reconcile'`) without corrupting history.
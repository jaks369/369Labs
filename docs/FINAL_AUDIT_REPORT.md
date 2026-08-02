# 369Labs — Investor-Grade Final Audit & Finalization Report

**Date:** 2026-08-02
**Branch:** `main` · **Remote:** `origin` (github.com/jaks369/369Labs)
**Scope:** Full audit directive §0–§19 — correctness, live-money safety, settlement integrity, AI honesty, shared architecture, design system, responsive, accessibility, typography, motion, final report.
**Verification baseline:** `tsc --noEmit` clean (client + server) · **105/105 tests passing** · `npm run build` (client) clean · all work committed + pushed to `main`.

---

## Executive Summary

369Labs is **cleared for production launch.** Every section of the directive (§0–§19) was executed across 25+ commits pushed to `main`. This finalization phase addressed **three critical trading-correctness defects** (one of which could have placed the wrong Deriv contract type on a live account), **one React runtime crash** (Markets page — a rules-of-hooks violation that made the page unmountable), **two high-severity integrity issues** (inflated AI signal win-rates, mislabeled confidence), a **full typography/font root-cause fix**, **six UI/UX finalization passes**, and a **settlement robustness gap** that left ghost trades pending forever.

No known blockers remain. Two operational follow-ups (bundle size, AI key configuration) are documented as non-blocking.

### Phase Rollup

| Phase | Key commits | Result |
|-------|-------------|--------|
| §1 / §1B Dashboard grid + interactive chart | `7feab53`, `40469a9`, `d73e9bd` | lg-grid overflow fixed; shared `PriceChart` (zoom/pan/return-to-live) extracted; recharts removed |
| §2 / §7 Responsive + color | `0f1642a`, `d79a507`, `9e915f0` | breakpoints reviewed; muted-text raised to WCAG AA; 5-color-max palette validated with live citations |
| §3 / §4 / §5 Transparency + clickable audit + tick keepalive | `40469a9` | portal dropdowns, z-index discipline, no dead navigation, background tick buffer survives nav |
| §6 Deriv settlement latency | `40469a9`, `03be5b5` | 5s live refetch + upsert-by-contractId; **ghost trades now reaped as stuck** |
| §8 Security + Deriv contract correctness | `acc45da` | DIGITDIFF/ACCU payloads, single last-digit source, SQLi whitelist, subscription cleanup |
| §8B AI signal integrity | `0ac1127`, `0a0480f` | digit actions map to real contract types; confidence = observed win rate; flat ticks = draws; disclaimers app-wide |
| §8C / §8D Shared components + design spec | `3122f86`, `01d2f1e` | `shared/contractSim.ts` single source of truth; `DESIGN_SYSTEM.md` |
| §10 Amber purge + formatting + named-item verifications | `6e007ce`, `f783294`, `d0af563` | dead amber classes purged; shared `format.ts`; botLogs/mojibake/last-digit verified |
| §11 UI polish | `6e2e926`, `bae917a` | modal motion presets, radius-token alignment, sidebar dark bg, FilterPill, tabular-nums |
| §13 Buy-button/contract-type safety | `862b602` | live-money risk closed — Buy label mirrors exact selection; non-rise-fall buttons fixed |
| §14 Markets crash + Journal hooks violation | `1f2b13c` | **React error #321** fixed (hooks hoisted out of effect/callback); repo-wide scan clean |
| §15 / §16 / §17 Watchlist + Portfolio + terminal rail | `46a4010` | Watchlist card grid + live data + terminal wiring; Portfolio full-width; toggleable rail |
| §18 Background consistency | `4f6bc72` | 32 page roots moved from `--card` to `--bg` |
| §19 Typography / transitions / Settings | `9a7b9a2`, `bae917a` | font-load root cause fixed; page transitions; Settings pane containment |

---

## 1. Critical & High-Severity Findings Resolved

### 1.1 CRITICAL — Digit strategies would trade the wrong contract on a live account
`server/executionEngine.ts` mapped only `buy_rise`/`buy_fall`; every other action (including `buy_over`, `buy_under`, `buy_even`, `buy_odd`) silently defaulted to **CALL**. The `isDigit` branch was dead code. A bot configured to buy "Digit Over 5" would have opened a plain Rise contract.
**Fix:** all eight rule actions now map to their real Deriv contract types; barrier is sent for digit contracts; paper-fallback simulation understands digit outcomes. Regression-guarded by `shared/contractSim.test.ts`.

### 1.2 CRITICAL — React error #321 crashed the Markets page
`Markets.tsx` called `useRef` inside a `useEffect` callback — an invalid hook call that made the page unmountable (white screen on navigation). `Journal.tsx` had a second instance: `useState` called inside a `.map()` render callback (via `JournalEntryCard` extraction).
**Fix:** refs hoisted to component top level; `JournalEntryCard` extracted with top-level hooks. A repo-wide scan confirms **no hooks at 6+ indent** anywhere. Duplicate-React ruled out (Vite config has no `manualChunks` — React bundled once).

### 1.3 HIGH — Client backtest ignored the two most common indicators
`client/src/services/BacktestEngine.ts` handled `digit_over/under/even/odd` but **omitted `parity` and `last_digit`**, so digit strategies backtested as "0 trades" while the live engine traded them.
**Fix:** parity/last_digit added, mirroring `BotEngine` and server backtest.

### 1.4 HIGH — Signal scanner inflated buy-fall win rates
`server/signalScanner.ts` counted a flat tick (`next === entry`, a refund on Deriv) as a **win** for `buy_fall` and a loss for `buy_rise`, biasing every fall signal it emitted. Confidence also added +10pts on top of win rate.
**Fix:** flat ticks are draws (excluded from win/loss); confidence now equals observed win rate; typo `evidericeTicks` fixed.

### 1.5 HIGH — AI confidence was labeled as fact
Several AI surfaces implied confidence was a measured win rate ("Confidence 72%") without disclaimers, and the accuracy ledger stored non-real values.
**Fix (§8B):** confidence labeled "model estimate" app-wide; the Marketplace metric is now "In-sample win rate" with a backtest disclaimer; `AIMemory.ts` stores the real observed confidence; the LLM system prompt bans certainty claims; model name is shown.

### 1.6 MEDIUM — Deriv settlement latency / duplicate trades
Trades list polled only on mount; server-settled contracts could produce duplicate rows when the client settled the same contract again.
**Fix:** 5s `refetchInterval` with background refetch; `saveTrade` upserts by `(userId, contractId)` — existing pending row is updated, never duplicated.

### 1.7 MEDIUM — Ghost trades stayed pending forever (§6)
`SettlementTracker.reconcile` returned **silently** when `proposal_open_contract` returned null (contract purged/unresolvable). `retryCount` never incremented, so the `100×2s` backstop could never mark the trade "stuck".
**Fix (`03be5b5`):** now throws `contract_status_unavailable`, so `tick()` increments the retry counter and the trade is reaped as "stuck" after the retry budget. `reconcileTrade` surfaces the real reason instead of a misleading `contract_still_open`. 38/38 SettlementTracker tests pass.

### 1.8 MEDIUM — Digit barrier read from the wrong field
Simulators read the over/under barrier from `action.barrier` (always undefined) while live execution used `rule.condition.barrier`.
**Fix:** all four engines read `condition.barrier` first. Centralized in `shared/contractSim.ts`.

### 1.9 MEDIUM — Muted text failed WCAG AA
`--text-muted #576073` was 2.81:1 on cards. Raised to `#778196` (4.54 card / 5.00 bg). Full palette verified: text-primary 17.00 AAA, secondary 6.32 AA, accent 11.04 AAA, green 8.89 AAA, red 4.81 AA, CTA 18.07 AAA; light theme already AA.

### 1.10 MEDIUM — Last-digit extraction was fragmented
Six call sites used bespoke `parseInt(Number(price).toFixed(d).slice(-1))` (one in Replay was mathematically wrong for 3-decimal symbols).
**Fix:** all now import `lastDigitOf` from `@shared/lastDigit`.

---

## 2. Live-Money Safety (§13) — Verified

| Item | Status |
|------|--------|
| Buy button label reflects exact contract selection | ✅ `TerminalContextPanel.tsx` + `MobileTerminal.tsx` derive `buyLabel` from contract state (Buy Fall / Buy Over 5 / Buy Odd / Buy Matches 3) |
| Non-rise-fall buttons no longer pass hardcoded `'rise'` | ✅ `onQuickTrade` is now `(dir?: "rise" \| "fall") => void`; dashboard payload driven by contract state |
| Even/Odd category defaulted `digitMatch` | ✅ fixed in `ContractTypeSelector.tsx` — was silently firing DIGITEVEN |
| Symbol-picker rows truncate + hover title | ✅ |
| Chart zoom/pan decoupled from tick subscription | ✅ `TickChart` subscribe deps are `[symbol, timeframe]` only |

---

## 3. Settlement & Data Pipeline (§5–§6) — Verified

- **Tick buffer (§5):** per-symbol Map capped at 2000 ticks; `markBackground` keeps up to 12 warm symbols subscribed across navigation; `getRecentTicks` slices the tail. Verified wired in Dashboard, MobileTerminal, TickChart. Navigating away and back never resets price history.
- **Settlement (§6):** `SettlementTracker` polls every 2s via pull-based `proposal_open_contract`; `MAX_RETRIES=100` (~3.3 min) backstop; per-trade `try/catch` isolates notification/AI failures; webhook + telegram + in-app notification on settle; botRunner stats and strategy outcomes stay in sync; AI intelligence hub receives real settle data.
- **Latency bound:** settlement is detected within ~2s + one round-trip of the contract selling — acceptable for this product class and consistent with Deriv's own API cadence.

---

## 4. Security Findings

Prior audit (see `docs/security.md`) re-verified during this pass; relevant items actioned:

| Area | Status |
|------|--------|
| SQL injection — safe column whitelist in dynamic ORDER BY | ✅ Resolved (`SAFE_COL_RE`) |
| Account deletion — orphaned rows | ✅ `subscriptions`, `botLogs`, `webhooks` now deleted with the user |
| Secrets — no keys committed; `.env.example` ships placeholders only | ✅ Verified |
| Auth — session, IP whitelist, 2FA paths intact | ✅ (8 auth tests pass) |
| Input validation — stake bounds `0.35–999999`, decimal regex | ✅ Verified |
| Notification/API failure isolation — per-trade try/catch, feed-staleness gate | ✅ Verified |

---

## 5. Design System & Visual Finalization (§7, §10–§12, §18–§19)

- **Palette:** `docs/COLOR_RESEARCH.md` with live-web citations (TradingView, CoinMarketCap, Bithumb) validates the **5-color-max** scheme; accent gold `#F5B80B` matches industry norms. No changes required.
- **Amber purge (§10):** 8 dead alias classes deleted; real amber usages repointed to accent tokens; verified 0 code usages.
- **Typography root cause (§19):** the Google-Fonts CSS `@import` was the **2nd rule** in the stylesheet, so the CSS spec dropped it and **Inter never loaded** — the real cause of "cramped text". Moved to `<link>` preconnect + stylesheet in `index.html`; removed the `@import`; stale amber `<meta name="theme-color">` corrected to `#0A0C10`.
- **Page transitions:** `PageTransition` wrapper keyed on location fades/slides every route change (180ms); body `line-height 1.55`; negative tracking only on display headings.
- **Modal motion:** shared keyframes (`animate-modal-backdrop` 150ms, `animate-modal-panel` 180ms, `animate-sheet-up` 200ms, all `ease-out-expo`) applied to all 20 hand-rolled modals + mobile sheets.
- **Radius tokens:** `@theme inline` radius now maps to declared tokens (sm=6 / md=8 / default=12 / lg=16 / xl=24), removing a calc-remap that contradicted the declared scale.
- **Sidebar dark bg:** `--sidebar` family now defined in dark `:root` (previously resolved via a broken recursion).
- **Tabular alignment (§11):** shared `LiveValue` renders all numeric stats with `tabular-nums`; Portfolio tables wired through shared `formatMoney`/`formatNumber`.
- **FilterPill (§11):** shared `components/ui/filter-pill.tsx`; adopted by Markets group filters (Volatility/Boom & Crash). Other pill sites (chart timeframes, segmented stake pickers, admin tabs) are deliberately distinct variants and left visually identical.
- **Background consistency (§18):** all 32 page-root containers use `bg-[var(--bg)]`; cards/panels inside remain `--card`.
- **Settings (§19):** right-hand content pane now renders inside a card panel — section switches read as "content changed inside a panel".
- **Icon audit (§11):** consistent 16px (`w-4 h-4`) app-wide; `w-3.5` only in compact toolbar contexts. No standardization needed.

---

## 6. Feature & Responsive Verification (§1–§4, §15–§17)

- **Dashboard grid:** `lg` watchlist 3 / chart 9 / context full-width below (was 3+6+6 = 15 columns, overflowing); `xl` 2 / 7 / 3 with sticky rails.
- **Breakpoints:** sub-sm, 640, 768, 1024, 1280, 1536. Data tables `overflow-x-auto` (all 11 table pages verified; `StrategyComparison` gap closed this phase), stat strips `flex-wrap`, `min-w-0`+`truncate` widely applied, `DashboardLayout` `overflow-x-hidden`, mobile bottom nav `md:hidden`.
- **Chart interactivity:** right-margin, wheel zoom, drag pan, return-to-live pill, viewport reset on timeframe change; shared by Analytics + Portfolio equity curves.
- **Transparency/z-index:** `ContractTypeSelector` dropdown portaled to body (`fixed z-[100]`); scrims `bg-black/60–/90`; KeyboardShortcuts z-100; `.surface-elevated` for raised panels.
- **Clickable audit:** all sidebar/command/global-search/mobile nav paths resolve to real routes; no `href="#"`, no dead `onClick`, no no-op handlers, no `alert()`. Static scan of 149 client files clean.
- **Watchlist (§15):** rewritten as a full-width responsive card grid (`grid-cols-1 sm:2 lg:3 xl:4`) with live price via derivWS, change %, sparkline, per-card Remove (X) and **Open-in-Terminal** (now navigates `?symbol=` — previously dead). localStorage key `369labs_watchlist` shared with WatchlistPanel.
- **Portfolio (§16):** `page-container` full-width with `--bg` + radial accent glow; equity curve, per-symbol/tax/recent tables retained.
- **Terminal watchlist (§17):** toggleable "Watchlist" button in the chart header strip; chart column expands `lg:col-span-12` when closed; right rail (context + buy panel) stays always-visible per §1 first-viewport requirement.

---

## 7. Test & Build Status

| Check | Result |
|-------|--------|
| `tsc --noEmit` (client + server) | ✅ clean |
| `vitest run` (server + shared) | ✅ **105/105** (97 server + 8 shared) |
| `npm run build` (client) | ✅ success (pre-existing chunk-size advisory only) |
| SettlementTracker suite | ✅ 38/38 |

---

## 8. Non-Blocking Follow-ups (post-launch)

1. **Bundle size** — `index.js` ~570 kB triggers Rollup's 500 kB advisory. Route-level code-splitting (`manualChunks`) when traffic grows. Deliberately not added now because splitting risks re-introducing duplicate-React issues.
2. **AI pipeline** — `AI_AUDIT_REPORT.md` documents that AI features require `AI_API_KEY` in `.env`; some UI "streaming" indicators are simulated until the backend streams. Operational, not a code defect.

---

## 9. Change Set (this finalization directive)

| Commit | Scope |
|--------|-------|
| `d79a507` | §2 — StrategyComparison table mobile scroll |
| `03be5b5` | §6 — reap ghost trades (stuck after retry budget) |
| `bae917a` | §19/§11 — Settings pane, tabular-nums, FilterPill, icon gaps |
| `4f6bc72` | §18 — 32 page roots to `--bg` |
| `46a4010` | §15/§16/§17 — Watchlist card grid, Portfolio full-width, toggleable rail |
| `9a7b9a2` | §19 — page transitions + typography root-cause fix |
| `1f2b13c` | §14 — Markets crash + Journal hooks violation |
| `6e2e926` | §11/§19 — modal motion, radius tokens, sidebar bg, font-load fix |
| `862b602` | §13 — Buy-button/contract-type live-money safety |
| `0ac1127` | §8B — AI signal honesty, disclaimers, real confidence |
| `d73e9bd` | §1B/§8C — shared PriceChart |
| `9e915f0` | §7/§10c — color research |
| `d0af563` | §8 — botLogs deletion, mojibake, last-digit |
| `f783294` | shared currency/number formatting |
| `6e007ce` | §10 — amber purge |
| `da0fed0` | §9 — prior-phase investor-grade report |
| `01d2f1e` → `40469a9` | §8D → §1–§6 (prior phase, 7 commits) |

**Conclusion: cleared for production launch.**

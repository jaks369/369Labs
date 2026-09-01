# 369Labs — Design System ("Signal")

**Status: source of truth for UI tokens, surfaces, typography, and behavior.**
Single implementation location: `client/src/index.css` (`:root` and `@layer base`).
This doc must be updated whenever tokens change; tokens must only change here, never hardcoded per-page.

---

## 1. Color Tokens

### Dark theme (default)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0A0C10` | Page background |
| `--surface-dim` | `#08080c` | Deepest recesses |
| `--surface` / `--surface-secondary` | `#10131A` | Canvas / secondary surface |
| `--surface-elevated` | `#1A2029` | Raised cards, popovers, dropdowns |
| `--card` | `#141821` | Default card background |
| `--surface-floating` | `#16161e` | Floating elements |
| `--border` | `#212936` | Default border |
| `--border-subtle` | `#1A212C` | Subtle separators |
| `--text-primary` | `#EDEFF3` | Headings, primary text |
| `--text-secondary` | `#8A93A3` | Secondary text |
| `--text-muted` | `#778196` | Muted/captions (WCAG AA on card + bg) |
| `--text-disabled` | `#3D4556` | Disabled |
| `--accent` | `#2FD9C4` | Single brand accent (cool teal) |
| `--accent-hover` | `#4CE8D5` | Accent hover |
| `--accent-soft` | `rgba(47,217,196,0.10)` | Accent-tinted fills |
| `--accent-border` | `rgba(47,217,196,0.24)` | Accent-tinted borders |
| `--accent-glow` | `rgba(47,217,196,0.18)` | Ambient glow |
| `--cta-fill` | `#F4F6F8` | Primary CTA fill (off-white) |
| `--cta-fill-hover` | `#FFFFFF` | CTA hover |
| `--cta-text` | `#0A0C10` | CTA text |
| `--green` | `#16C784` | Financial UP / win / buy ONLY |
| `--red` | `#EA3943` | Financial DOWN / loss / sell ONLY |

### Light theme
`--bg #F8F9FA`, `--card #FFFFFF`, `--text-primary #1A1D23`, `--text-secondary #495057`,
`--text-muted #6B7280` (AA), `--accent #1AA892`, `--cta-fill #0A0C10`, green/red unchanged.

### Rules
- **Polarity tokens** (`--green` / `--red`) must never be used for brand/decoration; they encode up/down, win/loss, buy/sell only.
- **One accent.** All legacy amber/yellow utilities and `-amber` alias classes have been removed repo-wide (verified grep = 0); nothing may reintroduce amber, orange, or yellow as brand/decorative color.
- Hardcoded hexes are banned in components; use `var(--...)`.

---

## 2. Typography

Modular scale (1.25 ratio), Inter for UI, JetBrains Mono for numbers/identifiers.

| Token | Size | Semantic alias |
|-------|------|----------------|
| `--text-xs` | 10px | `--text-micro` |
| `--text-sm` | 12px | `--text-caption` |
| `--text-base` | 14px | `--text-body` (default) |
| `--text-lg` | 16px | `--text-display` |
| `--text-xl` | 20px | `--text-hero-sm` |
| `--text-2xl` | 25px | `--text-hero` |
| `--text-3xl` | 31px | — |
| `--text-4xl` | 39px | — |

- Numbers, prices, P&L, timestamps: `font-mono tabular-nums`.
- Hierarchy: `Metric Value > Metric Label > Section Header > Status Badge > Caption`.

---

## 3. Spacing

8-point system: `--space-1` 8px → `--space-8` 64px.
Layout rhythm: `gap-fields` (8px), `gap-groups` (24px), `gap-sections` (32px), `card-padding` (16px).

---

## 4. Radius & Elevation

Radii: `--radius-sm` 6px, `--radius-md` 8px, `--radius` 12px (default), `--radius-lg` 16px, `--radius-xl` 24px.

Elevation (layered depth replaces border-only grouping):
- `--elevation-0` none (default panels/cards)
- `--elevation-1/2` subtle raisers
- `--elevation-3` dropdowns/menus
- `--elevation-4` modals, popovers, overlays

**Surfaces** from flat to raised: `bg` → `surface-dim` → `surface` → `card` → `surface-elevated` → `surface-floating`.

---

## 5. Layout & Responsive

- Shell: `DashboardLayout` — fixed sidebar (`w-[280px]`), content in `page-container` (`overflow-x-hidden`).
- Dashboard grid at `lg`: watchlist 3 / chart 9 / context full-width below; at `xl`: 2 / 7 / 3 with sticky rails.
- Mobile (<768px): `MobileTabBar` bottom nav (`md:hidden`), stacked single-column grids, `MobileTerminal`.
- **Mobile vs Desktop trade panel treatment**: Mobile uses `.aurora-glass` (translucent blur + `backdrop-filter`), desktop uses `.terminal-trade-panel` (flush transparent background). This is intentional — mobile trade panels sit as floating cards over chart content (standard mobile pattern), while desktop's are flush with the page layout. Do not reconcile these; the glass treatment is a deliberate mobile UX choice.
- Data tables: wrap in `overflow-x-auto`; stat strips: `flex flex-wrap` with `min-w-[...]` items; never fixed-width page layouts.
- Breakpoints verified: 640 / 768 / 1024 / 1280 / 1536 and sub-sm.

---

## 6. Overlays & Stacking

- Modals/dialogs: `z-[100]`.
- Popovers/dropdowns that can be clipped by scroll containers MUST be portaled to `document.body` with `fixed z-[100]` (see `ContractTypeSelector`).
- Backdrops: `bg-black/60`–`/90` (never transparent).
- Sheets: keep inside layout with `overflow-y-auto`.

---

## 7. Financial Semantics (Deriv)

Shared single source of truth: `shared/contractSim.ts` (+ tests in `shared/contractSim.test.ts`).

- Rule actions map to contract types: `buy_rise→CALL`, `buy_fall→PUT`, `buy_higher→CALL+barrier`, `buy_lower→PUT+barrier`, `buy_even→DIGITEVEN`, `buy_odd→DIGITODD`, `buy_over→DIGITOVER`, `buy_under→DIGITUNDER`, `buy_digit_match→DIGITMATCH`, `buy_digit_diff→DIGITDIFF`.
- **Higher/Lower** uses the same CALL/PUT contract types as Rise/Fall, but with a `barrier` (strike price). Higher wins if exit > barrier; Lower wins if exit < barrier. Flat at barrier = draw/refund.
- Digit barrier comes from `rule.condition.barrier` — never `action.barrier`.
- Rise/fall on a **flat tick** (`exit === entry`) is a **draw** (refund) — counted as neither win nor loss.
- Digit contracts are 1-tick; accumulator sends `growth_rate`.
- Last-digit extraction: `@shared/lastDigit` `lastDigitOf(price, decimals)` everywhere — never inline `parseInt(price.toFixed(...).slice(-1))`.
- Payout default: `PAYOUT_RATE = 0.95`.

---

## 8. States & Motion

- `shimmer` / `skeleton` for loading.
- Status colors: `--green` win/up, `--red` loss/down, `--accent` active/pending.
- Interactive elements: `min-h-[44px]` tap targets, focus rings `var(--accent)`.
- Micro-interactions encouraged via framer-motion; keep durations ≤ 250ms.

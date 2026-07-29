# 369Labs — Visual Audit Report

## Scope

- 46 pages (40 routed)
- 35 custom components + 46 shadcn/ui primitives
- 1 design system (index.css, 917 lines)
- 1 layout shell (DashboardLayout.tsx, 494 lines)
- 1 sidebar (40 exported sub-components)

---

## Critical Issues

### 1. No Depth — Everything Is One Layer

| Issue | Evidence | Severity |
|-------|----------|----------|
| `--shadow-sm`, `--shadow-md`, `--shadow-lg` defined but unused | 0 uses in index.css layer, 0 uses in pages | CRITICAL |
| All cards use `border: 1px solid var(--border)` with no elevation | .panel, .card, .kpi-card, .trade-studio all identical | CRITICAL |
| No background differentiation between nested content | Chart inside card inside panel all same `--card` bg | HIGH |

### 2. Amber Is the Default, Not the Accent

| Pattern | Count in Codebase | Problem |
|---------|-------------------|---------|
| Labels in amber | ~120+ occurrences | Every form label screams at the user |
| Input borders in amber | ~40 occurrences | Normal inputs should not glow amber |
| Section subtitles in amber | ~30 occurrences | Muted info should not compete |
| `text-[var(--amber)]` as primary text color | Settings.tsx, deriv pages | Eye fatigue — orange overload |

### 3. Dashboard Lacks Visual Center of Gravity

| Element | Visual Weight | Should Be |
|---------|--------------|-----------|
| Chart | Same as everything else | HERO — largest, most prominent |
| Trade Studio | Same as chart | Secondary — compact execution panel |
| Price Alerts | Same as chart | Tertiary — supporting |
| AI Insight | Same as chart | Contextual overlay |
| History tabs | Same as chart | Utility — collapsed when not needed |

### 4. Settings Page Is a Wall of Form Fields

- 890 lines, 16 sections
- Every section has identical visual weight
- No grouping by category (Profile, Security, Integrations all equal)
- Amber labels on every input create visual noise

---

## Minor Issues

### 5. Color Inconsistencies

| Location | Problem |
|----------|---------|
| DashboardLayout.tsx | Hardcodes `#E8ECF1`, `#8896A8`, `#1E2A38`, `#111820`, `#5A6878` instead of `var(--...)` |
| DerivTokenModal.tsx | Hardcodes `#181D26`, `#1E2838` |
| ErrorBoundary.tsx | Uses Tailwind semantic classes (`bg-background`) instead of `var(--...)` |

### 6. Layout Inconsistencies

| Pattern | Pages Using It | Pages Not Using It |
|---------|---------------|-------------------|
| PageContainer/PageSection | Dashboard, MarketIntelligence, Portfolio | ~37 other pages |
| Panel classes | ~10 pages | ~30 pages |

### 7. Two Toast Systems

- Custom `Toast.tsx` (imperative + context)
- `ui/sonner.tsx` (shadcn wrapper)
Both active.

### 8. Weak Typography Hierarchy

- Headers: all white `#E8ECF1`
- Labels: all `--text-secondary` or `--amber`
- Values: all white or amber
- Status: no distinct style
- Metadata: all `--text-muted`
- No visual rhythm between: `Metric Value > Metric Label > Section Header > Status Badge > Caption`

### 9. Motion Is Sparse

- 5 framer-motion components
- 0 micro-interactions (hover scale, button press, card entrance)
- Page transitions exist only on PageSection (used on 3 pages)
- No loading state animations beyond spinners

### 10. Border Overuse

- Every container uses `border: 1px solid var(--border)` (#1E2838)
- Cards, panels, inputs, tables, tabs — all same border
- No visual differentiation between container levels
- Better approach: elevation layers replace borders for grouping

---

## UX Impact Ranking (Highest to Lowest)

| Rank | Page | Why | Impact |
|------|------|-----|--------|
| 1 | **Dashboard** | Primary user destination, most time spent, currently flat | 🟥 CRITICAL |
| 2 | **Settings** | 890 lines of dense forms, amber overload | 🟥 CRITICAL |
| 3 | **DashboardLayout** | Wraps every page, hardcoded colors, no sidebar rhythm | 🟧 HIGH |
| 4 | **Trade Studio** (in Dashboard) | Execution panel feels like a form, not a terminal | 🟧 HIGH |
| 5 | **Chart** (TickChart) | Hero element, improved layout needs final polish | 🟧 HIGH |
| 6 | **StrategyBuilder** | Complex page, likely dense and unorganized | 🟧 HIGH |
| 7 | **Bots** | Monitoring page needs information density | 🟧 HIGH |
| 8 | **Backtesting** | Results page needs clear hierarchy | 🟧 HIGH |
| 9 | **Portfolio** | Recently updated, needs consistency pass | 🟨 MEDIUM |
| 10 | **MarketIntelligence** | Recently updated, needs consistency pass | 🟨 MEDIUM |
| 11-45 | Remaining pages | Need design system applied consistently | 🟩 LOWER |

---

## Redesign Roadmap

### Phase 1: Global Design System
- Define elevation layers (0-4) with shadows
- Reduce amber footprint in CSS variables
- Add motion primitives (consistent enter/exit classes)
- Create surface hierarchy (bg > canvas > panel > elevated > floating)
- Add typography rhythm utilities

### Phase 2: Application Shell
- DashboardLayout: replace hardcoded colors with CSS vars
- Sidebar: improve active states, icon rhythm, spacing
- Standardize PageContainer usage across all pages
- Mobile responsiveness pass

### Phase 3: Dashboard (Highest Impact)
- Chart as hero — expand visual footprint
- Trade Studio as compact floating panel
- Clear section hierarchy
- Add depth with shadows/elevation
- Animated section entrance

### Phase 4: Settings + Complex Pages
- Settings: grouped sections, visual hierarchy, compact layout
- StrategyBuilder, Bots, Backtesting: design system pass
- Remaining pages: consistent panel usage

### Phase 5: Polish
- Micro-interactions (hover, press, card entrance)
- Motion consistency
- Accessibility pass
- Final consistency scan

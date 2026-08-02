# 369Labs — Color System Research (§7 / §10c)

**Status: research-backed validation of the existing 5-color-max direction.**
Performed live web research (Aug 2026) on how established trading platforms
and financial dashboards use color. Findings below are cited; each color used
in the app must map to a stated purpose or be removed.

---

## 1. Findings — how the reference products use color

### TradingView (global charting standard)
- **Green = up / bullish close; red = down / bearish close.** Color encodes
  price direction *only*. Candles/bars are colored green/red by whether close
  is above/below open (or above/below prior close), and every other UI element
  is neutral.
  Source: TradingView Support — "Introduction to candlestick charts",
  "Understanding bar charts" (tradingview.com/support).
- Charts can also render **colorblind-friendly** variants using pattern/texture
  instead of color alone — reinforces that color is a *supplement* to form.
  Source: Investopedia — "Understand Candlestick Chart Colors".

### CoinMarketCap (crypto dashboard reference)
- Up = green `#12b76a`, down = red `#f04438`, neutral = gray `#667085`.
- A **single restrained accent** (blue `#0b5fff`) is used sparingly — eyebrow
  labels, symbol names, links. Backgrounds near-white, primary text near-black.
  Everything else is a neutral ramp.
  Source: CoinMarketCap API guide — live price tracker CSS tokens
  (coinmarketcap.com/api/resources).
- Brand blue `#3861fb` is the only brand color in the identity.
  Source: logotyp.us — CoinMarketCap brand colors.

### Bithumb (Korea #1 crypto exchange — professional terminal reference)
- **Near-black structural base** `#1C2028`; **one warm accent** (bronze `#543E35`)
  reserved for the single primary CTA; **trading colors used exclusively for
  price direction** (red = up, blue = down per Korea convention, never swapped);
  all hierarchy carried by grays (`#707882`, `#93989E`) and 1px borders.
- "The palette is restrained and structural, letting the trading colors do the
  emotional work." "Color is signal — reserve it."
  Source: oh-my-design / Bithumb DESIGN.md (github.com/kwakseongjae/oh-my-design).

### Cross-industry design-system conventions
- **Pattern A — "Bold accent, neutral everything else"**: one saturated brand
  color + near-black text + near-white surface + a 5-step gray ramp. Identified
  as the safest, most durable shape for information-dense products
  (Stripe/Linear shape).
- Semantic tokens (success/warning/danger/info) must be distinguishable under
  common color-blindness; one accent must survive both light and dark themes.
- Typical token count: a 6–8 step neutral ramp, 1–2 accents at ~3 lightnesses,
  4 semantic colors at 2 lightnesses, surface/border tokens — beyond that means
  two features invented their own palettes.
  Sources: dev.to/lizely — "Reverse-Engineering a Competitor's Palette";
  refero.design / Metamask design system.

---

## 2. Validation of 369Labs' existing direction

The current system already matches Pattern A and the TradingView/CMC/Bithumb
shape exactly:

| 369Labs token | Value | Maps to | Research basis |
|---------------|-------|---------|----------------|
| `--bg` / `--surface*` / `--card` | `#0A0C10` family | structural near-black base | Bithumb near-black base; Pattern A |
| `--accent` (single teal) | `#2FD9C4` | the ONE brand accent | CMC single blue accent; Bithumb single bronze accent; Pattern A |
| `--green` | `#16C784` | financial up/win/buy ONLY | TradingView green; CMC up green `#12b76a` (same family) |
| `--red` | `#EA3943` | financial down/loss/sell ONLY | TradingView red; CMC down red `#f04438` (same family) |
| `--cta-fill` off-white | `#F4F6F8` | primary action | Bithumb off-white CTA text; Pattern A near-white |
| neutral text ramp | `--text-primary/secondary/muted/disabled` | all hierarchy | Bithumb grays; CMC gray `#667085` |

**Conclusion: no palette change is required.** The research confirms:
1. Green/red must stay strictly directional/financial (already enforced — this
   audit removed the last non-directional uses: account-type badges were red/
   green, now demo=accent / real=neutral).
2. One accent is correct and matches the reference products.
3. The neutral ramp carries hierarchy — correct.

### Residual amber cleanup (complete)
All amber/yellow/orange brand & decorative colors were removed (commit
`6e007ce`): 3 real usages + 1 uncovered rgba form (`glass-card` hover) repointed
to accent tokens; 8 dead `-amber` alias classes deleted; `getDigitStats` last-
digit fix `d0af563`. Repo-wide grep = 0 real amber usages, 0 dead aliases.

---

## 3. Purpose statement (every color, one sentence)

- **`--accent` (teal):** the single brand/active/selected/pending color.
- **`--green`:** financial up / win / buy — nothing else.
- **`--red`:** financial down / loss / sell / error — nothing else.
- **Neutrals:** structure, hierarchy, and readability.
- **Off-white CTA:** the one high-emphasis action surface.

If a color's purpose can't be stated in one sentence, it should not be in the
app. This is now an enforced rule in `DESIGN_SYSTEM.md`.

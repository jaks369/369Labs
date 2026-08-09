import { getAllSymbols, getSymbolDisplayName } from "@shared/symbols";
import { PatternResult } from "../signalEngine";
import { scanTicks } from "../signalScanner";
import { aiOrchestrator } from "./AIOrchestrator";
import { MarketHealth } from "./types";

/**
 * IntelligenceDirector — the decision layer between raw engine output and the
 * user face. It does NOT invent analysis and never lowers validation bars.
 *
 * Pipeline (per directive): raw ticks -> engines -> pattern detection -> baseline
 * comparison -> CI/FDR/walk-forward validation -> ranking/prioritisation ->
 * market context -> interpretation -> ACTION -> user.
 *
 * The only facts promoted onto the page are:
 *   - validated conditions (strong/watch tiers from signalEngine, which already
 *     apply CI vs fair baseline, BH-FDR and walk-forward),
 *   - observed volatility state (described as OBSERVED, never as a forecast),
 *   - per-market stance decisions each carrying WHY / WHAT TO WATCH / WHAT CHANGES.
 * Everything else is exposed as expandable evidence.
 */

export type MarketStance = "TRADE" | "WATCH" | "WAIT" | "NO TRADE";

export interface ConditionView {
  symbol: string;
  displayName: string;
  supportsLabel: string;
  tier: string;
  tierLabel: string;
  observedPct: number;
  baselinePct: number;
  edgePp: number;
  ciLowPct: number;
  ciHighPct: number;
  pValue: number;
  fdrAdjusted: boolean;
  inSample: number;
  holds: number;
  walks: number;
  oosAvgPct: number;
  oosTotal: number;
  describe: string;
  triggerText: string;
  progress: string;
  discoveredAt: number;
  evidence: string[];
  interpretation: string;
}

export interface MarketDecision {
  symbol: string;
  displayName: string;
  submarket: string;
  stance: MarketStance;
  stanceRule: string;
  why: string;
  whatToWatch: string;
  wouldTrigger: string;
  topCondition: ConditionView | null;
  healthScore: number;
  volatility: string;
}

export interface Development {
  id: string;
  level: "major" | "watch" | "observed";
  title: string;
  detail: string;
  symbol: string;
  displayName: string;
  timestamp: number;
}

export interface EnvironmentView {
  level: "HIGH" | "MODERATE" | "LOW";
  headline: string;
  summary: string;
  standsOut: string[];
  totals: { critical: number; high: number; moderate: number; low: number; total: number };
}

export interface HealthView {
  symbol: string;
  displayName: string;
  score: number;
  volatility: string;
  whyStandout: string;
  detail: string[];
}

export interface StanceBanner {
  verdict: MarketStance;
  headline: string;
  summary: string;
  whatMatters: string[];
  whatToWatch: string[];
  whatWouldChange: string[];
}

export interface IntelligenceReport {
  generatedAt: number;
  active: boolean;
  stanceBanner: StanceBanner;
  developments: Development[];
  conditionList: ConditionView[];
  markets: MarketDecision[];
  environment: EnvironmentView;
  health: HealthView[];
  healthTotals: { critical: number; high: number; moderate: number; low: number; total: number };
}

// ---------------------------------------------------------------------------
// Scan cache — the validated engine runs per symbol; we memoize so a 30s client
// poll does not re-fetch 19 × 1000 ticks on every call.
// ---------------------------------------------------------------------------

const FIT_TTL_MS = 120_000;
const fitCache = new Map<string, { at: number; results: PatternResult[] }>();

async function scanFor(symbol: string): Promise<PatternResult[]> {
  const hit = fitCache.get(symbol);
  if (hit && Date.now() - hit.at < FIT_TTL_MS) return hit.results;
  let results: PatternResult[] = [];
  try {
    results = await scanTicks({ userId: 0, symbol, sampleSize: 1000 });
  } catch {
    results = [];
  }
  fitCache.set(symbol, { at: Date.now(), results });
  return results;
}

const TIER_LABEL: Record<string, string> = {
  strong: "Validated — holds forward",
  watch: "Promising — needs forward confirmation",
  insufficient: "Insufficient forward data",
  failed: "Failed forward check",
  no_edge: "No edge over fair baseline",
};

function pp(v: number): number {
  return Math.round((v + Number.EPSILON) * 10) / 10;
}

function conditionView(r: PatternResult, symbol: string): ConditionView {
  const edgePp = pp(r.edgePp);
  const ev: string[] = [
    `Baseline ${(r.baseline * 100).toFixed(1)}% vs observed ${(r.observed * 100).toFixed(1)}% (edge ${edgePp >= 0 ? "+" : ""}${edgePp}pp)`,
    `95% CI ${(r.ciLow * 100).toFixed(1)}–${(r.ciHigh * 100).toFixed(1)}%`,
    `p=${r.pValue.toFixed(3)}${r.fdrAdjusted ? " · FDR-adjusted" : " · not FDR-significant"}`,
    `Walk-forward: ${r.holds}/${r.walks.length} windows held (OOS avg ${(r.oosAvg * 100).toFixed(1)}%, n=${r.oosTotal})${r.oosInsufficient ? " — forward sample thin, treat tier honestly" : ""}`,
  ];

  const interpretationText =
    r.tier === "strong" || r.tier === "watch"
      ? `Over the last ${r.inSampleSize} ticks "${r.supportsLabel}" won ${(r.observed * 100).toFixed(1)}% vs its fair ${(r.baseline * 100).toFixed(1)}% baseline (edge ${edgePp >= 0 ? "+" : ""}${edgePp}pp). The CI now clears fair play and it has held ${r.holds}/${r.walks.length} forward windows.`
      : r.tier === "insufficient"
        ? `In-sample it printed ${(r.observed * 100).toFixed(1)}% vs the fair ${(r.baseline * 100).toFixed(1)}%, but there are only ${r.oosTotal} forward ticks. That is not a failure — waiting is correct.`
        : `No reliable edge: ${(r.observed * 100).toFixed(1)}% vs the fair ${(r.baseline * 100).toFixed(1)}% baseline over ${r.inSampleSize} in-sample ticks.`;

  return {
    symbol,
    displayName: getSymbolDisplayName(symbol),
    supportsLabel: r.supportsLabel,
    tier: r.tier,
    tierLabel: TIER_LABEL[r.tier] || r.tier,
    observedPct: +(r.observed * 100).toFixed(1),
    baselinePct: +(r.baseline * 100).toFixed(1),
    edgePp,
    ciLowPct: +(r.ciLow * 100).toFixed(1),
    ciHighPct: +(r.ciHigh * 100).toFixed(1),
    pValue: +r.pValue.toFixed(3),
    fdrAdjusted: r.fdrAdjusted,
    inSample: r.inSampleSize,
    holds: r.holds,
    walks: r.walks.length,
    oosAvgPct: +(r.oosAvg * 100).toFixed(1),
    oosTotal: r.oosTotal,
    describe: r.describe,
    triggerText: r.triggerText,
    progress: r.currentProgress?.current ?? "",
    discoveredAt: r.discoveredAt,
    evidence: ev,
    interpretation: interpretationText,
  };
}

function bestValidated(results: PatternResult[]): PatternResult | null {
  const strong = results.filter((r) => r.tier === "strong");
  if (strong.length) return strong.slice().sort((a, b) => b.edgePp - a.edgePp)[0];
  const watch = results.filter((r) => r.tier === "watch");
  return watch.length ? watch.slice().sort((a, b) => b.edgePp - a.edgePp)[0] : null;
}

function submarketOf(symbol: string): string {
  if (symbol.startsWith("1HZ")) return "1-second index";
  if (symbol.startsWith("R_")) return "Volatility index";
  if (symbol.startsWith("BOOM")) return "Boom index";
  if (symbol.startsWith("CRASH")) return "Crash index";
  return "Index";
}

// Per-market stance: WHY / WHAT TO WATCH / WHAT CHANGES — all derived from the
// validated engine output, never from invented heuristics.
function decide(results: PatternResult[], symbol: string, health: MarketHealth | undefined): MarketDecision {
  const displayName = getSymbolDisplayName(symbol);
  const healthScore = health?.score ?? 0;
  const volatility = health?.volatility ?? "—";

  const top = bestValidated(results);
  if (top && top.tier === "strong") {
    const cv = conditionView(top, symbol);
    return {
      symbol,
      displayName,
      submarket: submarketOf(symbol),
      stance: "TRADE",
      stanceRule: "Verified condition — small-size candidates only",
      why: `${top.supportsLabel} is validated here: ${cv.interpretation}`,
      whatToWatch: `Trade only while the condition stays inside its valid window; re-run the engine when the trigger stops printing.`,
      wouldTrigger: top.triggerText,
      topCondition: cv,
      healthScore,
      volatility,
    };
  }
  if (top && top.tier === "watch") {
    const cv = conditionView(top, symbol);
    return {
      symbol,
      displayName,
      submarket: submarketOf(symbol),
      stance: "WATCH",
      stanceRule: "Interesting but unconfirmed",
      why: `${top.supportsLabel}: ${cv.interpretation}  Do NOT size up.`,
      whatToWatch: `Next forward windows for ${top.supportsLabel} — if it keeps holding, this market rotates toward TRADE.`,
      wouldTrigger: `${top.supportsLabel} holds its forward windows and clears CI + FDR.`,
      topCondition: cv,
      healthScore,
      volatility,
    };
  }
  const ins = results.filter((r) => r.tier === "insufficient");
  if (ins.length > 0) {
    const top = ins[0];
    return {
      symbol,
      displayName,
      submarket: submarketOf(symbol),
      stance: "WAIT",
      stanceRule: "Too little forward data to judge",
      why: `${top.supportsLabel} showed an in-sample edge but only ${top.oosTotal} forward ticks exist. Waiting is correct — this is not a failure.`,
      whatToWatch: `More live prints so ${top.supportsLabel} can accumulate OOS data.`,
      wouldTrigger: "The edge survives enough forward ticks to hold.",
      topCondition: conditionView(top, symbol),
      healthScore,
      volatility,
    };
  }
  return {
    symbol,
    displayName,
    submarket: submarketOf(symbol),
    stance: "NO TRADE",
    stanceRule: "Nothing cleared the bar",
    why: `The engine compared the full fixed pattern library against each contract's fair baseline (CI, BH-FDR, walk-forward) and found no reliable edge. Doing nothing is correct.`,
    whatToWatch: `Any pattern family that beats its fair baseline with CI + FDR + walk-forward.`,
    wouldTrigger: "A pattern clears all three validation gates.",
    topCondition: null,
    healthScore,
    volatility,
  };
}

function buildDevelopments(markets: MarketDecision[]): Development[] {
  const out: Development[] = [];
  const now = Date.now();
  for (const m of markets) {
    const c = m.topCondition;
    if (!c || (c.tier !== "strong" && c.tier !== "watch")) continue;
    out.push({
      id: `dev_${m.symbol}_${c.supportsLabel}_${c.discoveredAt}`,
      level: c.tier === "strong" ? "major" : "watch",
      title: `${c.displayName} · ${c.supportsLabel}`,
      detail: c.interpretation,
      symbol: m.symbol,
      displayName: m.displayName,
      timestamp: now,
    });
  }
  return out.slice(0, 12);
}

function environmentView(): EnvironmentView {
  const advisories = aiOrchestrator.getRiskAdvisories();
  const total = advisories.length;
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const a of advisories) {
    if (a.riskLevel === "CRITICAL") counts.critical++;
    else if (a.riskLevel === "HIGH") counts.high++;
    else if (a.riskLevel === "MEDIUM") counts.moderate++;
    else counts.low++;
  }
  const level: EnvironmentView["level"] =
    counts.critical > 0 ? "HIGH" : counts.high > 0 ? "MODERATE" : "LOW";

  const standsOut = advisories
    .filter((a) => a.riskLevel === "CRITICAL" || a.riskLevel === "HIGH")
    .slice(0, 3)
    .map((a) => `${a.symbol} — ${a.recommendation}`);

  return {
    level,
    headline:
      level === "LOW"
        ? "Low-risk market environment"
        : level === "MODERATE"
          ? "Elevated risk pockets — context for sizing"
          : "High-risk environment — be selective",
    summary:
      level === "LOW"
        ? "Across the symbols we follow, recent price movement has been stable. LOW RISK does not mean good opportunity — calm markets are often just quiet coin flips, so rely on the stance above, not the calm."
        : level === "MODERATE"
          ? `Most markets are calm, but ${standsOut.length} show elevated movement. That is context for position size, not a directional signal.`
          : "A real share of our symbols are showing volatile, hard-to-trade behaviour right now. Positions must be small.",
    standsOut,
    totals: { ...counts, total },
  };
}

function stanceView(markets: MarketDecision[]): StanceBanner {
  const trade = markets.filter((m) => m.stance === "TRADE");
  const watch = markets.filter((m) => m.stance === "WATCH");
  const wait = markets.some((m) => m.stance === "WAIT");

  if (trade.length > 0) {
    const names = trade.slice(0, 3).map((m) => m.displayName).join(", ");
    return {
      verdict: "TRADE",
      headline: `Verified condition${trade.length > 1 ? "s" : ""} live: ${names}`,
      summary: "A statistically validated edge now exists. Only trade these candidates, small. The edge is real but momentary.",
      whatMatters: trade.slice(0, 4).map((m) => `${m.topCondition?.supportsLabel} on ${m.displayName} — ${m.why.split(".")[0]}.`),
      whatToWatch: trade.slice(0, 4).filter((m) => m.whatToWatch).map((m) => `${m.displayName}: ${m.whatToWatch}`),
      whatWouldChange: ["Forward windows start failing", "A pattern leaves its valid window", "FDR gate closes again"],
    };
  }
  if (watch.length > 0) {
    return {
      verdict: "WATCH",
      headline: "No confirmed edge yet — some patterns are maturing",
      summary: "A few in-sample tilts are developing. The correct posture is to watch, not to trade them at full size.",
      whatMatters: ["Conditions that hold their forward windows become candidates"],
      whatToWatch: watch.slice(0, 4).map((m) => `${m.displayName}: ${m.whatToWatch}`),
      whatWouldChange: ["A watch condition holds forward with CI + FDR and joins the TRADE set"],
    };
  }
  if (wait) {
    return {
      verdict: "WAIT",
      headline: "Insufficient forward data across markets",
      summary: "The engine needs more live prints before it can fairly call any pattern an edge. Waiting is correct.",
      whatMatters: ["More forward ticks for the in-sample candidates"],
      whatToWatch: ["The pipeline's walk-forward windows filling up"],
      whatWouldChange: ["Once a condition clears the three validation gates"],
    };
  }
  return {
    verdict: "NO TRADE",
    headline: "No tradeable condition right now",
    summary: "The fixed-pattern library was compared to fair baselines — no pattern cleared CI, FDR and walk-forward on any market. Sitting out is the data-driven result.",
    whatMatters: ["No market currently offers a validated edge"],
    whatToWatch: ["All pattern families across all markets"],
    whatWouldChange: ["A condition clearing confidence interval, FDR and forward windows"],
  };
}

function marketSorter(a: MarketDecision, b: MarketDecision): number {
  const rank: Record<MarketStance, number> = { TRADE: 0, WATCH: 1, WAIT: 2, "NO TRADE": 3 };
  if (rank[a.stance] !== rank[b.stance]) return rank[a.stance] - rank[b.stance];
  return b.healthScore - a.healthScore;
}

export async function buildIntelligenceReport(): Promise<IntelligenceReport> {
  const state = aiOrchestrator.getState();
  const symbols = getAllSymbols();
  const healthMap = state.health;

  const markets: MarketDecision[] = [];
  const conditions: ConditionView[] = [];

  for (const sym of symbols) {
    const results = await scanFor(sym);
    const decision = decide(results, sym, healthMap.get(sym));
    markets.push(decision);
    if (decision.topCondition) conditions.push(decision.topCondition);
  }

  const developments = buildDevelopments(markets);
  const environment = environmentView();
  const banner = stanceView(markets);

  const healthViews: HealthView[] = Array.from(healthMap.entries()).map(([symbol, h]) => {
    const md = markets.find((m) => m.symbol === symbol);
    const whyStandout =
      md?.stance === "TRADE"
        ? `${md.topCondition?.supportsLabel} is validated here — a healthy, small-size setup.`
        : md?.stance === "WATCH"
          ? `${md.topCondition?.supportsLabel} is maturing — could join the tradeable set.`
          : h.score >= 70
            ? "Calm and trending for the window — but nothing validated yet."
            : h.score < 50
              ? "Below-average health: choppy or erratic recently."
              : "Mediocre conditions — neither clean nor violent.";
    return {
      symbol,
      displayName: h.displayName,
      score: h.score,
      volatility: h.volatility,
      whyStandout,
      detail: [h.recommendation],
    };
  });

  const healthTotals = { critical: 0, high: 0, moderate: 0, low: 0, total: healthViews.length };
  for (const h of healthViews) {
    if (h.score < 35) healthTotals.critical++;
    else if (h.score < 50) healthTotals.high++;
    else if (h.score < 70) healthTotals.moderate++;
    else healthTotals.low++;
  }

  return {
    generatedAt: state.lastUpdated,
    active: state.active,
    stanceBanner: banner,
    developments,
    conditionList: conditions.sort((a, b) => b.edgePp - a.edgePp || b.holds - a.holds),
    markets: markets.sort(marketSorter),
    environment,
    health: healthViews.sort((a, b) => b.score - a.score),
    healthTotals,
  };
}

export const intelligenceDirector = { build: buildIntelligenceReport };
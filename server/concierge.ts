/**
 * AI Concierge — the ACTIVE, guiding layer.
 *
 * Sits on top of the existing (passive) intelligence: orchestrator health /
 * predictions / risk advisories, the digit-pattern engine, and a new
 * deterministic indicator-confluence scanner (indicatorSignal.ts). It turns
 * them into a live briefing ("your next move"), a session coach, smart
 * alerts, and an audited outcome ledger for every guiding signal it emits.
 *
 * Everything additive. Pure math (coach math, stake sizing, summary builders)
 * is exported for tests; the service layer reads the DB / orchestrator and
 * degrades gracefully when data is missing (never fabricates wins).
 */

import * as db from "./db";
import { notifyUser, notifyUserTelegram } from "./_core/notification";
import { getTickHistory, getTickHistoryDeep } from "./aitools";
import { getAllSymbols, getSymbolDisplayName } from "@shared/symbols";
import { PAYOUT_RATE } from "@shared/contractSim";
import { getPortfolioSnapshot } from "./tradingService";
import {
  scanSignalForSymbol,
  GuidingSignalCandidate,
  GuideStrength,
} from "./indicatorSignal";
import type { MarketHealth, RiskAdvisory } from "./ai/types";
import { derivManager } from "./derivConnection";
import { buildLimitOrder } from "@shared/slTp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoachMessage {
  level: "critical" | "warning" | "info" | "praise";
  message: string;
}

export interface SessionCoachResult {
  wins: number;
  losses: number;
  draws: number;
  sessionAccuracy: number;
  sessionDuration: string;
  coachingMessages: CoachMessage[];
  currentStreak: string;
  streakCount: number;
  totalExposure: number;
  totalPnl: number;
}

export interface SmartAlert {
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface SessionSummaryResult {
  tradingSummary: string;
  strengths: string[];
  mistakes: string[];
  improvementOpportunities: string[];
  sessionDuration: string;
  stats: { trades: number; wins: number; losses: number; winRatePct: number; pnl: number };
}

export interface PreTradeChecklist {
  symbol: string;
  displayName: string;
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  suggestedStake: number;
  maxStake: number;
  warnings: string[];
  context: string;
}

export interface MarketContext {
  symbol: string;
  displayName: string;
  headline: string;
  priceContext: string[];
  calendar: string[];
}

export interface ConciergeSettings {
  enabled: boolean;
  telegramBriefings: boolean;
  maxPerDay: number;
  stakePct: number;
  /** Absolute USD stake the user wants the concierge to recommend (0.35+). */
  stake: number;
  stopLoss: number;
  takeProfit: number;
  symbols?: string[];
  /** Auto-execute STRONG signals as real trades. */
  autoExec: boolean;
  /** Max daily loss in USD (0 = off). */
  maxDailyLoss: number;
  /** Position sizing method: 'fixed' | 'kelly' | 'vol_adjusted' */
  sizingMethod: 'fixed' | 'kelly' | 'vol_adjusted';
}

export const DEFAULT_SETTINGS: ConciergeSettings = {
  enabled: true,
  telegramBriefings: false,
  maxPerDay: 10,
  stakePct: 2,
  stake: 1,
  stopLoss: 0,
  takeProfit: 0,
  autoExec: false,
  maxDailyLoss: 0,
  sizingMethod: 'fixed',
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Suggested stake sized from RISK MANAGEMENT (a fixed % of account per trade),
 * never from signal confidence. Confidence says how many indicators agree; it
 * says nothing about the odds of the next tick, so it has no business sizing a
 * position.
 *   - default 2% of account balance per trade (the user's "Stake %" setting
 *     drives this; clamped to 0.1–2% so a typo can't blow the account),
 *   - the max-stake guard is 3× the recommended % (6% of the account at the
 *     default), the most one trade is ever allowed to put at risk,
 *   - with a $0.35 floor so the number stays tradeable on small balances.
 */
export interface StakeSuggestion {
  stake: number;
  maxStake: number;
  riskPct: number;
  note: string;
}

export function suggestStakeInput(balance: number, riskPct = 2): StakeSuggestion {
  const safe = Math.max(0, balance || 0);
  const pct = Math.max(0.1, Math.min(riskPct, 2));
  const raw = safe * (pct / 100);
  const maxStake = Math.max(1, safe * (pct / 100) * 3);
  const stake = Math.min(Math.max(raw, 0.35), maxStake);
  const rounded = Math.round(stake * 100) / 100;
  return {
    stake: rounded,
    maxStake: Math.round(maxStake * 100) / 100,
    riskPct: pct,
    note: `${pct}% of your account balance ($${rounded.toFixed(2)}) — sized from risk, not from signal confidence. Never risk more than the ${(pct * 3).toFixed(0).replace(/\.0$/, "")}% cap.`,
  };
}

/** Suggested stake from the user's concierge settings: an explicit absolute
 *  stake wins if set, otherwise it falls back to the risk-adjusted % of the
 *  account balance. Either way the risk guard (3× the % baseline) caps the
 *  number so a typo can't recommend a reckless size. */
export function suggestStakeForSettings(balance: number, settings: Pick<ConciergeSettings, "stakePct" | "stake">): StakeSuggestion {
  const base = suggestStakeInput(balance, settings.stakePct);
  const desired = Number(settings.stake) > 0 ? Number(settings.stake) : base.stake;
  const stake = Math.round(Math.min(Math.max(desired, 0.35), base.maxStake) * 100) / 100;
  return {
    ...base,
    stake,
    note: `${base.riskPct}% of account = $${base.stake.toFixed(2)}; your set stake $${desired.toFixed(2)}${desired > base.maxStake ? ` was capped to the risk guard $${base.maxStake.toFixed(2)}` : ""}`,
  };
}

export function durationLabel(startMs: number): string {
  if (!startMs) return "—";
  const mins = Math.floor((Date.now() - startMs) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function winRateOf(wins: number, losses: number): number {
  return wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
}

/**
 * Would-have P&L for a resolved guiding signal (a CALL/PUT recommendation at
 * the recorded stake, NOT an executed trade). Uses the same simulation model
 * as the rest of the repo: a win pays stake × PAYOUT_RATE, a loss loses the
 * stake, and a flat-tick "expired" is a refund of $0. Open signals have no P&L.
 */
export function guidingSignalPnl(status: string | null | undefined, stake: string | number | null | undefined): number | null {
  const s = Math.round((Number(stake) || 0) * 100) / 100;
  if (status === "win") return Math.round(s * PAYOUT_RATE * 100) / 100;
  if (status === "loss") return -s;
  if (status === "expired") return 0;
  return null;
}

export interface TradeLike {
  id?: number;
  result?: string | null;
  stake?: string | number | null;
  profitLoss?: string | number | null;
  symbol?: string | null;
  contractType?: string | null;
  entryTime?: Date | string | number | null;
  strategyId?: number | null;
}

export interface CoachInput {
  trades: TradeLike[];
  sessionStartMs: number;
  balance: number;
  volatilityBySymbol: Record<string, string>;
}

export function computeSessionCoach(inp: CoachInput): SessionCoachResult {
  const { trades, sessionStartMs, balance, volatilityBySymbol } = inp;
  const session = trades.filter((t) => {
    const tMs = t.entryTime ? new Date(t.entryTime as any).getTime() : 0;
    return sessionStartMs === 0 || tMs >= sessionStartMs;
  });
  const settled = session.filter((t) => t.result === "win" || t.result === "loss");
  const wins = settled.filter((t) => t.result === "win").length;
  const losses = settled.length - wins;
  const draws = session.filter((t) => t.result === "draw").length;
  const totalPnl = session.reduce((s, t) => s + (Number(t.profitLoss) || 0), 0);
  const totalExposure = session.reduce((s, t) => s + (Number(t.stake) || 0), 0);
  const accuracy = winRateOf(wins, losses);

  let currentStreak = "none";
  let streakCount = 0;
  const ordered = settled.slice().reverse();
  if (ordered.length > 0) {
    const first = ordered[0];
    currentStreak = first.result === "win" ? "Wins" : "Losses";
    for (const t of ordered) {
      if (t.result !== first.result) break;
      streakCount++;
    }
  }

  const messages: CoachMessage[] = [];
  // Whip-saw detector: losing streak on a High-volatility symbol.
  const lossBySymbol: Record<string, number> = {};
  for (const t of settled) {
    if (t.result === "loss" && t.symbol) lossBySymbol[t.symbol] = (lossBySymbol[t.symbol] || 0) + 1;
  }
  const whipsawSym = Object.entries(lossBySymbol).find(([sym, n]) => n >= 2 && volatilityBySymbol[sym] === "High");
  if (whipsawSym) {
    messages.push({
      level: "warning",
      message: `${getSymbolDisplayName(whipsawSym[0])} is High-volatility and just gave you ${whipsawSym[1]} losses in a row. That's chop, not trend — consider ${whipsawSym[0] === "R_100" ? "R_50 or demo" : "a lower-volatility index or demo"} until it settles.`,
    });
  }
  if (streakCount >= 3 && currentStreak === "Losses") {
    messages.push({ level: "critical", message: `${streakCount}-loss streak. The smartest move is to stop or halve size — a streak like this is how martingale blowups start.` });
  } else if (streakCount >= 3 && currentStreak === "Wins") {
    messages.push({ level: "praise", message: `${streakCount}-win stretch — good discipline. Lock in by keeping the same small size; winners don't justify doubling.` });
  }
  if (settled.length >= 3 && losses > wins && !(streakCount >= 3 && currentStreak === "Losses")) {
    messages.push({ level: "warning", message: `Your session is struggling (${wins}W / ${losses}L) — consider cutting your stake in half until it turns around.` });
  }
  const avgStake = settled.length ? totalExposure / settled.length : 0;
  if (balance > 0 && avgStake > balance * 0.05) {
    messages.push({ level: "warning", message: `Average stake $${avgStake.toFixed(2)} is over 5% of your $${Math.round(balance)} balance — high risk of a quick account hit.` });
  }
  if (draws > 0) {
    messages.push({ level: "info", message: `${draws} draw${draws > 1 ? "s" : ""} (refunded flat ticks) — excluded from accuracy.` });
  }
  if (messages.length === 0) {
    if (settled.length === 0) messages.push({ level: "info", message: "No settled trades this session yet. Use the scan to find a candidate, then consider a small demo test." });
    else messages.push({ level: "info", message: "Nothing alarming in this session. Keep stakes small and let the audit trail do the talking." });
  }
  messages.push({ level: "info", message: accuracy >= 55 && settled.length >= 5 ? `${accuracy}% session accuracy — above the 50% baseline, but never treat a stretch as a guarantee.` : "Accuracy is a coach marker, not a promise — volatility indices are near-random by design." });

  return {
    wins,
    losses,
    draws,
    sessionAccuracy: accuracy,
    sessionDuration: durationLabel(sessionStartMs),
    coachingMessages: messages,
    currentStreak,
    streakCount,
    totalExposure: Math.round(totalExposure * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
  };
}

export function computeSessionSummary(trades: TradeLike[]): SessionSummaryResult {
  const settled = trades.filter((t) => t.result === "win" || t.result === "loss");
  const wins = settled.filter((t) => t.result === "win");
  const losses = settled.filter((t) => t.result === "loss");
  const pnl = settled.reduce((s, t) => s + (Number(t.profitLoss) || 0), 0);
  const winRate = winRateOf(wins.length, losses.length);

  const bySymbol: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of settled) {
    const sym = t.symbol || "?";
    bySymbol[sym] = bySymbol[sym] || { wins: 0, losses: 0, pnl: 0 };
    if (t.result === "win") bySymbol[sym].wins++;
    else bySymbol[sym].losses++;
    bySymbol[sym].pnl += Number(t.profitLoss) || 0;
  }
  const best = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl)[0];
  const worst = Object.entries(bySymbol).sort((a, b) => a[1].pnl - b[1].pnl)[0];

  const strengths: string[] = [];
  if (best && best[1].wins > 0 && best[1].pnl > 0) strengths.push(`${getSymbolDisplayName(best[0])}: ${best[1].wins}W/${best[1].losses}L, +$${best[1].pnl.toFixed(2)} — your best market.`);
  if (winRate >= 50) strengths.push(`${winRate}% win-rate across ${settled.length} settled trades.`);
  if (strengths.length === 0) strengths.push("No clear strength yet — small sample sizes make every stat noisy.");

  const mistakes: string[] = [];
  if (worst && worst[1].losses > 0 && worst[1].pnl <= 0) mistakes.push(`${getSymbolDisplayName(worst[0])}: ${worst[1].wins}W/${worst[1].losses}L, ${worst[1].pnl.toFixed(2) < "0" ? "-$" + (-worst[1].pnl).toFixed(2) : "+$" + worst[1].pnl.toFixed(2)} — your money pit.`);
  if (losses.length > wins.length) mistakes.push("More losses than wins — consider smaller stakes while you figure out what's different.");
  if (mistakes.length === 0) mistakes.push("No systemic mistake detected; keep it small and consistent.");

  const improvementOpportunities: string[] = [];
  if (worst && worst[1].losses >= 2) improvementOpportunities.push(`Skip or shrink ${getSymbolDisplayName(worst[0])} until its recent chop resolves.`);
  if (settled.length < 10) improvementOpportunities.push("More settled trades = a less noisy read. Let the ledger grow before sizing up.");
  if (improvementOpportunities.length === 0) improvementOpportunities.push("Keep doing what the data supports; re-check after 10 more trades.");

  return {
    tradingSummary: `${settled.length} settled trade${settled.length === 1 ? "" : "s"}, ${wins.length}W/${losses.length}L (${winRate}%) · P&L ${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}.`,
    strengths,
    mistakes,
    improvementOpportunities,
    sessionDuration: durationLabel(0),
    stats: { trades: settled.length, wins: wins.length, losses: losses.length, winRatePct: winRate, pnl: Math.round(pnl * 100) / 100 },
  };
}

export function computeSmartAlerts(trades: TradeLike[], advisories: RiskAdvisory[]): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  for (const a of advisories) {
    if (a.riskLevel === "CRITICAL") alerts.push({ severity: "critical", message: `CRITICAL risk on ${getSymbolDisplayName(a.symbol)}: ${a.recommendation}` });
    else if (a.riskLevel === "HIGH") alerts.push({ severity: "warning", message: `High risk on ${getSymbolDisplayName(a.symbol)} — keep positions small. ${a.recommendation}` });
  }
  const lossStreakSym: Record<string, number> = {};
  const recent = trades.slice().reverse();
  for (const t of recent) {
    if (t.result === "loss" && t.symbol) lossStreakSym[t.symbol] = (lossStreakSym[t.symbol] || 0) + 1;
    if (t.result === "win") break;
  }
  for (const [sym, n] of Object.entries(lossStreakSym)) {
    if (n >= 3) alerts.push({ severity: "warning", message: `${n} straight losses on ${getSymbolDisplayName(sym)}. Stop or switch.` });
  }
  if (alerts.length === 0) alerts.push({ severity: "info", message: "No risk flags right now." });
  return alerts.slice(0, 8);
}

export function computePreTradeChecklist(input: {
  symbol: string;
  contractType?: string;
  stake?: number;
  balance: number;
  advisory?: RiskAdvisory | null;
}): PreTradeChecklist {
  const { symbol, contractType, stake, balance, advisory } = input;
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const sizing = suggestStakeInput(balance);
  const maxStake = sizing.maxStake; // 3× the recommended % (6% of balance at the 2% default)
  const suggestedStake = sizing.stake;

  const riskScore = advisory?.score ?? 50;
  const riskLevel: "low" | "medium" | "high" = riskScore >= 75 ? "high" : riskScore >= 55 ? "medium" : "low";
  if (advisory) recommendations.push(`Market advisory for ${getSymbolDisplayName(symbol)} (${riskLevel}): ${advisory.recommendation}`);
  if (contractType) recommendations.push(`Contract type ${contractType} — confirm the barrier/digit matches the recent digit distribution.`);
  if (stake && stake > maxStake) warnings.push(`Stake $${stake} exceeds the ${sizing.riskPct * 3}%-of-balance risk cap ($${maxStake}).`);
  if (stake && stake > balance) warnings.push("Stake exceeds current balance.");
  if (riskLevel === "high") warnings.push("High market risk right now — a demo test or sitting out is genuinely smarter.");
  if (recommendations.length === 0) recommendations.push("Check the digit distribution and recent trend before committing.");
  recommendations.push(`Never risk more than ${sizing.riskPct}% of your balance per trade (hard cap ${sizing.riskPct * 3}%). Suggested stake here: $${suggestedStake}.`);

  return {
    symbol,
    displayName: getSymbolDisplayName(symbol),
    riskLevel,
    recommendations,
    suggestedStake,
    maxStake,
    warnings,
    context: advisory?.factors?.join(" · ") ?? "No live advisory yet — treating this as a neutral market.",
  };
}

// Deterministic local economic calendar (recurring, honest "why might money move").
const CALENDAR_EVENTS: Array<{ name: string; monthDay?: number; weekday?: number; timeUtc: string; impact: "high" | "medium" }> = [
  { name: "US Non-Farm Payrolls", weekday: -1, timeUtc: "12:30", impact: "high" }, // first Friday
  { name: "US CPI", monthDay: -1, timeUtc: "12:30", impact: "high" }, // mid-month (approx)
  { name: "FOMC interest-rate decision", monthDay: 15, timeUtc: "18:00", impact: "high" },
  { name: "ECB interest-rate decision", monthDay: 23, timeUtc: "12:15", impact: "medium" },
];

export function upcomingCalendarEvents(daysAhead: number = 3): Array<{ name: string; date: string; impact: string }> {
  const out: Array<{ name: string; date: string; impact: string }> = [];
  const now = new Date();
  for (let d = 0; d <= daysAhead; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    for (const ev of CALENDAR_EVENTS) {
      if (ev.weekday === -1 && day.getDay() === 5) {
        out.push({ name: ev.name, date: day.toISOString().slice(0, 10), impact: ev.impact });
      } else if (ev.monthDay === -1 && day.getDate() >= 10 && day.getDate() <= 15) {
        out.push({ name: ev.name, date: day.toISOString().slice(0, 10), impact: ev.impact });
      } else if (ev.monthDay && day.getDate() === ev.monthDay) {
        out.push({ name: ev.name, date: day.toISOString().slice(0, 10), impact: ev.impact });
      }
    }
  }
  return out.slice(0, 6);
}

export function buildMarketContext(symbol: string, health: MarketHealth | null, recentPrices: number[]): MarketContext {
  const nowPrice = recentPrices.length ? recentPrices[recentPrices.length - 1] : 0;
  const prevPrice = recentPrices.length > 5 ? recentPrices[recentPrices.length - 6] : 0;
  const movePct = nowPrice && prevPrice ? ((nowPrice - prevPrice) / prevPrice) * 100 : 0;
  const parts: string[] = [];
  if (health) {
    parts.push(`Health ${health.score}/100 · volatility ${health.volatility} · recommendation: ${health.recommendation}`);
  } else {
    parts.push("Health model warming up — technical read only.");
  }
  if (prevPrice) {
    parts.push(`Last window ${movePct >= 0 ? "up " : "down "}${Math.abs(movePct).toFixed(2)}%${health?.trend !== undefined ? ` · overall trend ${health.trend > 10 ? "up" : health.trend < -10 ? "down" : "choppy/flat"}` : ""}`);
  }
  const cal = upcomingCalendarEvents(3);
  const calendarLines = cal.map((c) => `${c.name} (${c.date}) — ${c.impact} impact macro, relevant around indices/exotics`);

  return {
    symbol,
    displayName: getSymbolDisplayName(symbol),
    headline: movePct ? `${getSymbolDisplayName(symbol)} ${movePct >= 0 ? "up" : "down"} ~${Math.abs(movePct).toFixed(2)}% recently${health?.volatility === "High" ? " with high volatility" : ""} — see why below.` : `${getSymbolDisplayName(symbol)} — building context.`,
    priceContext: parts,
    calendar: calendarLines,
  };
}

// ---------------------------------------------------------------------------
// Outcome resolution (persisted ledger)
// ---------------------------------------------------------------------------

export async function settleOpenGuidingSignals(userId: number): Promise<{ settled: number; wins: number; losses: number }> {
  const open = await db.listOpenGuidingSignals(userId);
  let settled = 0;
  let wins = 0;
  let losses = 0;
  const bySymbol: Record<string, Array<{ id: number; entryEpoch: number; windowTicks: number; direction: string; entryPrice: number }>> = {};
  for (const s of open) {
    if (Number(s.entryPrice) <= 0) continue;
    if (!bySymbol[s.symbol]) bySymbol[s.symbol] = [];
    bySymbol[s.symbol].push({
      id: s.id,
      entryEpoch: s.entryEpoch,
      windowTicks: s.windowTicks,
      direction: s.direction,
      entryPrice: Number(s.entryPrice),
    });
  }
  for (const [symbol, list] of Object.entries(bySymbol)) {
    let ticks: Array<{ price: number; epoch: number }> = [];
    try {
      ticks = (await getTickHistory(symbol, 2000)).map((t) => ({ price: Number(t.price), epoch: Math.floor(Number(t.timestamp) / 1000) }));
    } catch {
      ticks = [];
    }
    if (ticks.length < 10) continue;
    for (const item of list) {
      const idx = ticks.findIndex((t) => Number(t.epoch) >= item.entryEpoch);
      if (idx < 0 || idx + item.windowTicks >= ticks.length) continue;
      const settleTick = ticks[idx + item.windowTicks];
      const price = Number(settleTick.price);
      let status: "win" | "loss" | "expired" | null = null;
      if (price > item.entryPrice) status = item.direction === "up" ? "win" : "loss";
      else if (price < item.entryPrice) status = item.direction === "up" ? "loss" : "win";
      else status = "expired";
      if (status) {
        await db.setGuidingSignalOutcome(item.id, status, Number(settleTick.epoch) || Math.floor(Date.now() / 1000));
        settled++;
        if (status === "win") wins++;
        else if (status === "loss") losses++;
      }
    }
  }
  return { settled, wins, losses };
}

// ---------------------------------------------------------------------------
// Scanner — global per-symbol cache + per-user persistence + notification
// ---------------------------------------------------------------------------

let scanCache = new Map<string, { at: number; signal: GuidingSignalCandidate | null }>();
const SCAN_TTL_MS = 90_000;

export function getScanCache(symbol: string): GuidingSignalCandidate | null {
  const hit = scanCache.get(symbol);
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return hit.signal;
  return null;
}

export async function scanSymbolAndCache(symbol: string): Promise<GuidingSignalCandidate | null> {
  try {
    const ticks = (await getTickHistoryDeep(symbol, 5000)).map((t) => ({ price: Number(t.price), epoch: Math.floor(Number(t.timestamp) / 1000) }));
    const res = scanSignalForSymbol(symbol, ticks);
    scanCache.set(symbol, { at: Date.now(), signal: res.signal });
    return res.signal;
  } catch {
    return null;
  }
}

async function getSettings(userId: number): Promise<ConciergeSettings> {
  const mem = await db.getUserMemory(userId);
  return { ...DEFAULT_SETTINGS, ...((mem?.concierge as any) || {}) };
}

/** User's followed symbols: explicit prefs, else symbols they've traded, else a sane default. */
async function followedSymbols(userId: number, trades: any[]): Promise<string[]> {
  const mem = await db.getUserMemory(userId);
  const pref = (mem?.concierge as any)?.symbols;
  if (Array.isArray(pref) && pref.length > 0) return pref.slice(0, 12);
  const fromTrades = Array.from(new Set(trades.map((t: any) => t?.symbol).filter(Boolean))).slice(0, 8);
  if (fromTrades.length > 0) return fromTrades;
  return getAllSymbols().slice(0, 4);
}

export interface NextMove {
  signal: GuidingSignalCandidate;
  symbolLabel: string;
  suggestedStake: number;
  maxStake: number;
  /** The account % this stake risks per trade (risk-managed, not confidence-derived). */
  riskPct: number;
  provenance: "technical";
}

export interface Briefing {
  generatedAt: number;
  verdict: string;
  headline: string;
  summary: string;
  nextMove: NextMove | null;
  candidates: GuidingSignalCandidate[];
  disclaimer: string;
}

export async function buildBriefing(userId: number, balance?: number): Promise<Briefing> {
  const trades = await db.getTradesByUserId(userId, 200);
  const symbols = await followedSymbols(userId, trades);
  const candidates: GuidingSignalCandidate[] = [];
  for (const sym of symbols) {
    let sig = getScanCache(sym);
    if (!sig) sig = await scanSymbolAndCache(sym);
    if (sig && sig.strength !== "WEAK") candidates.push(sig);
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0] ?? null;
  const budget = balance ?? 500;
  const settings = await getSettings(userId);
  const stake = top ? suggestStakeForSettings(budget, settings) : null;

  let verdict = "NO TRADE";
  let headline = "No live candidate right now";
  let summary = "The scanner found no strong confluence across your followed symbols. Doing nothing is the data-driven result.";
  if (top) {
    verdict = top.strength === "STRONG" ? "TRADE" : "WATCH";
    const tally = top.votes?.total ? `${Math.max(top.votes.up, top.votes.down)}/${top.votes.total} indicators agree` : "";
    headline = `${getSymbolDisplayName(top.symbol)} · ${top.direction === "up" ? "Rise" : "Fall"} — ${tally || "no computable indicators yet"}`;
    // Plain-language summary (the four-layer read lives on the signal itself);
    // fall back to the raw reasons only if the explanation is somehow absent.
    summary = top.plain ? `${top.plain.what} ${top.plain.why}` : top.reasons.join(" · ");
  }

  return {
    generatedAt: Date.now(),
    verdict,
    headline,
    summary,
    nextMove: top
      ? {
          signal: top,
          symbolLabel: getSymbolDisplayName(top.symbol),
          suggestedStake: stake?.stake ?? 1,
          maxStake: stake?.maxStake ?? 50,
          riskPct: stake?.riskPct ?? 2,
          provenance: "technical",
        }
      : null,
    candidates: candidates.slice(0, 5),
    disclaimer: "Guiding signals are observed technical reads, not guarantees — volatility indices are near-random by design. Always respect your risk limits.",
  };
}

export interface ScanAndPersistResult {
  persisted: number;
  perSymbol: { symbol: string; strength: GuideStrength | null; confidence: number | null }[];
  errors: string[];
}

/**
 * Scan the user's followed symbols, persist any new non-WEAK signals (dedup
 * by symbol+direction within 4h), settle open ones, and push a Telegram/email
 * briefing when a STRONG signal is new.
 */
export async function scanAndPersistForUser(userId: number): Promise<ScanAndPersistResult> {
  const trades = await db.getTradesByUserId(userId, 50);
  const symbols = await followedSymbols(userId, trades);
  const settings = await getSettings(userId);
  const persistedList = await db.listGuidingSignals(userId);
  const recentKeys = new Set(
    persistedList
      .filter((s) => s.status === "open" && s.generatedAt > Date.now() / 1000 - 4 * 3600)
      .map((s) => `${s.symbol}:${s.direction}`),
  );
  const settled = await settleOpenGuidingSignals(userId);

  const perSymbol: ScanAndPersistResult["perSymbol"] = [];
  const errors: string[] = [];
  let persisted = 0;
  let newStrong: GuidingSignalCandidate | null = null;

  // Balance is read once per cycle (and only when a signal is about to be
  // recorded) so the persisted stake is the user's real risk number, never a
  // hardcoded stand-in.
  let balance: number | null = null;
  const userBalance = async (): Promise<number> => {
    if (balance !== null) return balance;
    try {
      const snap = await getPortfolioSnapshot(userId);
      balance = snap?.balance > 0 ? snap.balance : 500;
    } catch {
      balance = 500;
    }
    return balance;
  };

  for (const sym of symbols) {
    try {
      const sig = await scanSymbolAndCache(sym);
      perSymbol.push({ symbol: sym, strength: sig?.strength ?? null, confidence: sig?.confidence ?? null });
      // Only record and suggest signals when agreement is STRONG (3/3 or 4/4 indicators agree),
      // filtering out the 1/3 and 2/3 coin-flips to minimize losses.
      if (!sig || sig.strength !== "STRONG") continue;
      if (recentKeys.has(`${sym}:${sig.direction}`)) continue;
      const stake = suggestStakeForSettings(await userBalance(), settings).stake;
      const ok = await db.saveGuidingSignal({
        userId,
        symbol: sym,
        family: sig.family,
        direction: sig.direction,
        contractType: sig.contractType,
        barrier: null,
        confidence: sig.confidence,
        strength: sig.strength,
        reasons: sig.reasons,
        entryPrice: String(sig.entryPrice),
        entryEpoch: sig.entryEpoch,
        windowTicks: sig.windowTicks,
        stake: String(stake),
        status: "open",
        generatedAt: Math.floor(Date.now() / 1000),
      });
      if (ok) {
        persisted++;
        recentKeys.add(`${sym}:${sig.direction}`);
        if (sig.strength === "STRONG") newStrong = sig;

        // Auto-execute: place real trade when autoExec is enabled and signal is STRONG
        if (settings.autoExec) {
          // Regime filter: block auto-exec in chop/high_vol unless aligned
          const regime = (sig as any).regime;
          if (regime && !regime.aligned) {
            console.log(`[concierge] Auto-exec blocked: regime ${regime.regime} (${regime.reason}) misaligned for ${sym}`);
          } else {
            try {
              const conn = await derivManager.ensureConnected(userId);
              if (conn && conn.isAuthorized()) {
                const account = conn.getSnapshot?.()?.account;
                const currency = account?.currency || "USD";
                const balance = typeof account?.balance === "number" ? account.balance : 0;
                if (balance > 0 && stake > balance) {
                  console.warn(`[concierge] User ${userId}: balance $${balance.toFixed(2)} below stake $${stake}. Skipping placement on ${sym}.`);
                } else {
                  const contractType = sig.direction === "up" ? "CALL" : "PUT";
                  const proposalPayload: Record<string, any> = {
                    proposal: 1,
                    amount: stake,
                    basis: "stake",
                    contract_type: contractType,
                    currency,
                    duration: sig.windowTicks,
                    duration_unit: "t",
                    underlying_symbol: sym,
                  };
                  // Add SL/TP via limit_order if supported
                  const limitOrder = buildLimitOrder(contractType, settings.stopLoss, settings.takeProfit);
                  if (limitOrder.limit_order) proposalPayload.limit_order = limitOrder.limit_order;

                  const proposal = await (conn as any).sendRaw(proposalPayload).catch((e: any) => {
                    console.warn(`[concierge] Deriv proposal failed (${sym} ${contractType}): ${e?.message || e}`);
                    return null;
                  });
                  if (proposal?.proposal?.id) {
                    const buy = await (conn as any).sendRaw({ buy: proposal.proposal.id, price: proposal.proposal.ask_price }).catch((e: any) => {
                      console.warn(`[concierge] Deriv buy failed (${sym} ${contractType}): ${e?.message || e}`);
                      return null;
                    });
                    if (buy?.buy?.contract_id) {
                      await db.saveTrade({
                        userId,
                        symbol: sym,
                        contractType,
                        stake: String(stake),
                        entryPrice: String(sig.entryPrice),
                        result: "pending",
                        contractId: String(buy.buy.contract_id),
                        entryTime: new Date(),
                        source: "concierge",
                      });
                      console.log(`[concierge] Auto trade placed — #${buy.buy.contract_id} ${sym} ${contractType} @ $${stake}`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[concierge] auto-exec error for ${sym}:`, (e as any)?.message || e);
            }
          }
        }
      }
    } catch {
      errors.push(sym);
    }
  }

  if (newStrong && settings.maxPerDay > persistedList.length + persisted) {
    const tally = newStrong.votes?.total ? `${Math.max(newStrong.votes.up, newStrong.votes.down)}/${newStrong.votes.total} indicators agree` : "no computable indicators yet";
    const body = `STRONG ${newStrong.direction === "up" ? "Rise" : "Fall"} read on ${getSymbolDisplayName(newStrong.symbol)} (${tally})\n${newStrong.reasons.join("\n")}`;
    notifyUser(userId, "signalDetected", "Concierge STRONG signal", body).catch(() => {});
    if (settings.telegramBriefings) await notifyUserTelegram(userId, `🤖 369Labs Concierge\n\n${body}`);
  }
  if (settled.settled > 0) {
    console.log(`[concierge] user ${userId}: settled ${settled.settled} (${settled.wins}W/${settled.losses}L)`);
  }
  return { persisted, perSymbol, errors };
}

// ---------------------------------------------------------------------------
// Always-on loop
// ---------------------------------------------------------------------------

let conciergeInterval: ReturnType<typeof setInterval> | null = null;
export interface ConciergeLoopStatus {
  enabled: boolean;
  inProgress: boolean;
  lastRunAt: number | null;
  intervalMs: number;
}

const loopStatus: ConciergeLoopStatus = { enabled: false, inProgress: false, lastRunAt: null, intervalMs: 0 };

export function getConciergeLoopStatus(): ConciergeLoopStatus {
  return { ...loopStatus };
}

export function startConciergeScanner(): void {
  if (conciergeInterval) return;
  const INTERVAL_MS = 3 * 60 * 1000;
  loopStatus.enabled = true;
  loopStatus.intervalMs = INTERVAL_MS;

  const tick = async () => {
    if (loopStatus.inProgress) return;
    loopStatus.inProgress = true;
    try {
      const users = await db.listAllUsers();
      for (const u of users) {
        try {
          await scanAndPersistForUser(u.id);
        } catch (e) {
          console.error("[concierge] user scan failed", u.id, e);
        }
      }
      loopStatus.lastRunAt = Date.now();
    } catch (e) {
      console.error("[concierge] loop cycle failed", e);
    } finally {
      loopStatus.inProgress = false;
    }
  };
  setTimeout(tick, 20 * 1000);
  conciergeInterval = setInterval(tick, INTERVAL_MS);
}

export function stopConciergeScanner(): void {
  if (conciergeInterval) {
    clearInterval(conciergeInterval);
    conciergeInterval = null;
  }
  loopStatus.enabled = false;
  loopStatus.inProgress = false;
}

/** Public list of candidates across every symbol (drives the Concierge page rail). */
export async function scanAllSymbolsLive(): Promise<GuidingSignalCandidate[]> {
  const all = getAllSymbols();
  const out: GuidingSignalCandidate[] = [];
  for (const sym of all) {
    try {
      const sig = await scanSymbolAndCache(sym);
      if (sig) out.push(sig);
    } catch {
      /* ignore one bad symbol */
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Persist settings via userMemory (additive; keeps existing memory intact). */
export async function updateSettings(userId: number, patch: Partial<ConciergeSettings>): Promise<void> {
  const mem = await db.getUserMemory(userId) || {};
  await db.setUserMemory(userId, { ...mem, concierge: { ...DEFAULT_SETTINGS, ...((mem.concierge as any) || {}), ...patch } });
}

export async function getSettingsFor(userId: number): Promise<ConciergeSettings> {
  const settings = await getSettings(userId);
  // If the user never picked symbols, resolve to the effective set the loop
  // actually scans (prefs → traded symbols → sane default) so the UI never
  // shows an empty "Followed symbols" row while the loop is live.
  if (Array.isArray(settings.symbols) && settings.symbols.length > 0) return settings;
  const trades = await db.getTradesByUserId(userId, 200);
  return { ...settings, symbols: await followedSymbols(userId, trades) };
}

export type MarketHealthRef = MarketHealth;

export interface CalibrationResult {
  brierScore: number;
  logLoss: number;
  expectedCalibrationError: number;
  maxCalibrationError: number;
  totalPredictions: number;
  resolvedPredictions: number;
  reliabilityDiagram: Array<{
    bin: string;
    predictedProbability: number;
    actualFrequency: number;
    count: number;
    isWellCalibrated: boolean;
  }>;
  byStrength: Record<string, {
    brierScore: number;
    logLoss: number;
    ece: number;
    count: number;
    resolvedCount: number;
  }>;
}

function binConfidence(confidence: number): { bin: string; midpoint: number } {
  const bins = [
    { min: 50, max: 55, label: "50-55%" },
    { min: 55, max: 60, label: "55-60%" },
    { min: 60, max: 65, label: "60-65%" },
    { min: 65, max: 70, label: "65-70%" },
    { min: 70, max: 75, label: "70-75%" },
    { min: 75, max: 80, label: "75-80%" },
    { min: 80, max: 86, label: "80-86%" },
  ];
  const bin = bins.find(b => confidence >= b.min && confidence < b.max) || bins[bins.length - 1];
  return { bin: bin.label, midpoint: (bin.min + bin.max) / 2 / 100 };
}

export async function computeSignalCalibration(userId: number): Promise<CalibrationResult> {
  const signals = await db.listGuidingSignals(userId, 500);
  const resolved = signals.filter(s => s.status === "win" || s.status === "loss");
  
  if (resolved.length === 0) {
    return {
      brierScore: 0,
      logLoss: 0,
      expectedCalibrationError: 0,
      maxCalibrationError: 0,
      totalPredictions: signals.length,
      resolvedPredictions: 0,
      reliabilityDiagram: [],
      byStrength: {},
    };
  }

  const bins = new Map<string, { sumPredicted: number; sumActual: number; count: number }>();
  let totalBrier = 0;
  let totalLogLoss = 0;
  const byStrengthMap = new Map<string, { sumBrier: number; sumLogLoss: number; sumEce: number; count: number; resolvedCount: number }>();

  for (const s of resolved) {
    const confidence = Math.min(s.confidence / 100, 0.86);
    const outcome = s.status === "win" ? 1 : 0;
    const brier = Math.pow(confidence - outcome, 2);
    const eps = 1e-15;
    const logLoss = - (outcome * Math.log(confidence + eps) + (1 - outcome) * Math.log(1 - confidence + eps));
    
    totalBrier += brier;
    totalLogLoss += logLoss;

    const { bin, midpoint } = binConfidence(s.confidence);
    const b = bins.get(bin) || { sumPredicted: 0, sumActual: 0, count: 0 };
    b.sumPredicted += confidence;
    b.sumActual += outcome;
    b.count += 1;
    bins.set(bin, b);

    const strength = s.strength || "UNKNOWN";
    const sm = byStrengthMap.get(strength) || { sumBrier: 0, sumLogLoss: 0, sumEce: 0, count: 0, resolvedCount: 0 };
    sm.sumBrier += brier;
    sm.sumLogLoss += logLoss;
    sm.sumEce += Math.abs(confidence - outcome);
    sm.count += 1;
    sm.resolvedCount += 1;
    byStrengthMap.set(strength, sm);
  }

  const reliabilityDiagram = Array.from(bins.entries()).map(([bin, data]) => {
    const predictedProbability = data.sumPredicted / data.count;
    const actualFrequency = data.sumActual / data.count;
    const calibrationError = Math.abs(predictedProbability - actualFrequency);
    return {
      bin,
      predictedProbability: Math.round(predictedProbability * 10000) / 10000,
      actualFrequency: Math.round(actualFrequency * 10000) / 10000,
      count: data.count,
      isWellCalibrated: calibrationError < 0.05,
    };
  }).sort((a, b) => a.predictedProbability - b.predictedProbability);

  const calibrationErrors = reliabilityDiagram.map(d => Math.abs(d.predictedProbability - d.actualFrequency));
  const expectedCalibrationError = calibrationErrors.length > 0 
    ? calibrationErrors.reduce((a, b) => a + b, 0) / calibrationErrors.length 
    : 0;
  const maxCalibrationError = calibrationErrors.length > 0 ? Math.max(...calibrationErrors) : 0;

  const byStrength: Record<string, { brierScore: number; logLoss: number; ece: number; count: number; resolvedCount: number }> = {};
  for (const [strength, data] of byStrengthMap.entries()) {
    byStrength[strength] = {
      brierScore: Math.round((data.sumBrier / data.resolvedCount) * 10000) / 10000,
      logLoss: Math.round((data.sumLogLoss / data.resolvedCount) * 10000) / 10000,
      ece: Math.round((data.sumEce / data.resolvedCount) * 10000) / 10000,
      count: data.count,
      resolvedCount: data.resolvedCount,
    };
  }

  return {
    brierScore: Math.round((totalBrier / resolved.length) * 10000) / 10000,
    logLoss: Math.round((totalLogLoss / resolved.length) * 10000) / 10000,
    expectedCalibrationError: Math.round(expectedCalibrationError * 10000) / 10000,
    maxCalibrationError: Math.round(maxCalibrationError * 10000) / 10000,
    totalPredictions: signals.length,
    resolvedPredictions: resolved.length,
    reliabilityDiagram,
    byStrength,
  };
}
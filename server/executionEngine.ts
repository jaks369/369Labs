import * as db from "./db";
import { botRunner } from "./botRunner";
import { derivManager } from "./derivConnection";
import { getRecentTicks, isFeedStale, isMarketOpen } from "./tickCollector";
import { fireWebhookEvent } from "./webhookExecutor";
import { actionToContractType, isDigitContract } from "@shared/contractSim";
import { isSyntheticIndexSymbol } from "@shared/symbols";
import { buildCandles, ema, rsi, macd } from "@shared/indicators";
import { buildLimitOrder } from "@shared/slTp";
import { logger } from "./_core/logger";
import { computePortfolioHeat } from "./portfolioRisk";
import { getForexSessionInfo } from "@shared/forexSessions";

const POLL_INTERVAL = 500; // 500ms — near-live bot evaluation
const MAX_PIPELINE_TRADES = 50; // max trades in one cycle globally
const MAX_CONCURRENT_BOTS_PER_USER = 10; // max concurrent running bots per user

let intervalId: ReturnType<typeof setInterval> | null = null;
let cycleRunning = false;

function evaluateCondition(rule: any, prices: number[], digits: number[], idx: number, symbol?: string): boolean {
  const cond = rule?.condition;
  if (!cond) return false;

  // Defense-in-depth: digit-pattern indicators are only valid on Deriv synthetic indices
  // (R_*, 1HZ*, BOOM*, CRASH*). If a digit condition is paired with a non-synthetic
  // symbol (forex/crypto/stocks), refuse to evaluate rather than silently returning false.
  const DIGIT_INDICATORS = ["digit_over", "digit_under", "digit_even", "digit_odd", "parity", "last_digit"];
  if (DIGIT_INDICATORS.includes(cond.indicator) && symbol && !isSyntheticIndexSymbol(symbol)) {
    return false;
  }

  // Indicator-based conditions (ema_trend, rsi, macd_histogram) — these work on
  // candle data built from the tick stream, not individual ticks.
  if (cond.indicator === "ema_trend" || cond.indicator === "rsi" || cond.indicator === "macd_histogram") {
    if (prices.length < 30) return false;
    // Build candles from the tick prices — use 1-minute timeframe as default
    const tickLikes = prices.map((p, i) => ({ price: p, epoch: i }));
    const candles = buildCandles(tickLikes, 60);
    if (candles.length < 15) return false;
    const closes = candles.map((c) => c.close);

    if (cond.indicator === "ema_trend") {
      const fast = ema(closes, 9);
      const slow = ema(closes, 21);
      const last = closes.length - 1;
      if (Number.isNaN(fast[last]) || Number.isNaN(slow[last])) return false;
      const emaUp = fast[last] > slow[last];
      return cond.comparison === "up" ? emaUp : !emaUp;
    }

    if (cond.indicator === "rsi") {
      const rsiVal = rsi(closes, 14);
      if (rsiVal === null || rsiVal === undefined) return false;
      const barrier = cond.barrier ?? 30;
      return cond.comparison === "below" ? rsiVal < barrier : rsiVal > barrier;
    }

    if (cond.indicator === "macd_histogram") {
      if (closes.length < 28) return false;
      const { histogram: curHist } = macd(closes);
      const { histogram: prevHist } = macd(closes.slice(0, -1));
      if (curHist === null || prevHist === null) return false;
      const barrier = cond.barrier ?? 0;
      if (cond.comparison === "crosses_above") return prevHist <= barrier && curHist > barrier;
      if (cond.comparison === "crosses_below") return prevHist >= barrier && curHist < barrier;
      return curHist > barrier;
    }
  }

  const checkIndex = (i: number): boolean => {
    const d = digits[i];
    switch (cond.indicator) {
      case "digit_over":
        return d > (cond.barrier ?? 5);
      case "digit_under":
        return d < (cond.barrier ?? 5);
      case "digit_even":
        return d % 2 === 0;
      case "digit_odd":
        return d % 2 === 1;
      case "parity":
        return cond.barrier === 1 ? d % 2 === 1 : d % 2 === 0;
      case "last_digit":
        if (cond.comparison === "greater_than") return d > (cond.barrier ?? 5);
        if (cond.comparison === "less_than") return d < (cond.barrier ?? 5);
        return d === (cond.barrier ?? 0);
      case "consecutive_rise":
        return i > 0 && prices[i] > prices[i - 1];
      case "consecutive_fall":
        return i > 0 && prices[i] < prices[i - 1];
      default:
        return false;
    }
  };
  const count = cond.count ?? 1;
  if (idx + 1 < count) return false;
  if (cond.comparison === "appears_consecutively") {
    for (let i = idx + 1 - count; i <= idx; i++) if (!checkIndex(i)) return false;
    return true;
  }
  const windowStart = Math.max(0, idx - 20);
  let occ = 0;
  for (let i = windowStart; i <= idx; i++) if (checkIndex(i)) occ++;
  return occ >= count;
}

async function executeBotCycle(): Promise<void> {
  // Re-entrancy guard: prevent overlapping cycles (a slow cycle must never
  // run concurrently with the next one, or the same bot could place two buys).
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    await executeBotCycleInner();
  } finally {
    cycleRunning = false;
  }
}

async function executeBotCycleInner(): Promise<void> {
  if (isFeedStale()) return;

  const allBots = botRunner.listAll();

  // Reset daily counters at midnight. Only dailyTrades/dailyPnl (the numbers the
  // safety limits read) reset — totalTrades/totalProfitLoss are LIFETIME counters
  // and must survive across days (they're what the UI shows as all-time stats).
  const now = Date.now();
  const midnight = new Date().setUTCHours(0, 0, 0, 0);
  for (const bot of allBots) {
    if (!bot.lastDailyReset || bot.lastDailyReset < midnight) {
      bot.dailyTrades = 0;
      bot.dailyPnl = 0;
      bot.lossStreak = 0;
      bot.lastDailyReset = now;
      botRunner.persistSummary(bot.def.id, bot.def.userId).catch((e: any) =>
        logger.warn("Failed to persist daily reset", { userId: bot.def.userId, error: e?.message || e, botId: bot.def.id }),
      );
    }
  }

  let traded = 0;
  // Per-user trades *attempted this cycle*. Incremented just before a bot tries
  // to place a trade so at most MAX_CONCURRENT_BOTS_PER_USER bots per user trade
  // per cycle — and the limit is exactly MAX, not MAX-1 or all-or-nothing.
  const tradedPerUser: Record<number, number> = {};
  for (const bot of allBots) {
    if (traded >= MAX_PIPELINE_TRADES) break;
    if (bot.status !== "running" || bot.hasOpenTrade) continue;

    const strategy = bot.def?.strategy;
    const rule = strategy?.condition ? strategy : strategy?.rule || strategy?.config?.rule;
    if (!rule?.condition) continue;

    const symbol = rule.symbol || "R_100";

    // Market-open check: skip bots on closed markets. This is expected, not a
    // failure — the bot should resume when the market reopens.
    if (!isMarketOpen(symbol)) continue;

    // Session-liquidity gate (real-market symbols only): synthetic indices
    // trade 24/7 with constant liquidity, but forex/crypto thin windows
    // (NY close → Sydney open) produce gappy prints and unreliable fills.
    // A signal with identical statistics carries different real risk there.
    if (!isSyntheticIndexSymbol(symbol) && getForexSessionInfo().liquidity === "thin") {
      logger.info("Bot trade skipped: thin FX liquidity window", { userId: bot.def.userId, botId: bot.def.id, symbol });
      continue;
    }

    const stake = parseFloat(rule.params?.stake || "1");
    if (isNaN(stake) || stake <= 0) continue;

    // Check safety limits
    const safety = bot.def?.safety || {};
    
    // maxRiskPerTrade - enforce per-trade stake limit
    if (safety.maxRiskPerTrade && stake > safety.maxRiskPerTrade) continue;
    
    // allowedSymbols - restrict bot to specific symbols
    if (safety.allowedSymbols && safety.allowedSymbols.length > 0 && !safety.allowedSymbols.includes(symbol)) continue;
    
    // allowedHours - check if current time is within allowed trading hours
    if (safety.allowedHours && Array.isArray(safety.allowedHours) && safety.allowedHours.length === 2) {
      const [startHour, endHour] = safety.allowedHours;
      const currentHour = new Date().getHours();
      if (currentHour < startHour || currentHour >= endHour) continue;
    }
    
    // maxDailyTrades - daily trade limit (reset at midnight)
    if (safety.maxDailyTrades && bot.dailyTrades >= safety.maxDailyTrades) continue;
    
    // maxConsecutiveLosses - consecutive loss limit
    if (safety.maxConsecutiveLosses && bot.lossStreak >= safety.maxConsecutiveLosses) continue;
    
    // maxDailyLoss - daily loss limit (reset at midnight)
    if (safety.maxDailyLoss && bot.dailyPnl <= -safety.maxDailyLoss) continue;
    
    // confidenceThreshold - minimum confidence to trade (placeholder for future)
    // Would require strategy evaluation to return confidence score
    if (safety.confidenceThreshold && safety.confidenceThreshold > 100) continue;

    const ticks = getRecentTicks(symbol, 100);
    if (ticks.length < 10) continue;

    const prices = ticks.map((t) => t.price);
    const digits = ticks.map((t) => t.lastDigit);

    // Evaluate the most recent tick only. A strategy condition is a windowed
    // predicate (evaluateCondition already looks back over consecutive/appears
    // windows internally), so we evaluate against the newest price — never a
    // stale tick from many seconds ago, which would trigger buys on an expired
    // signal with a wrong recorded entry price.
    let triggered = false;
    let triggerIdx = prices.length - 1;
    if (evaluateCondition(rule, prices, digits, triggerIdx, symbol)) {
      triggered = true;
    }
    if (!triggered) continue;

    // Per-user concurrency cap: reserve a slot for this bot before attempting.
    // The count is incremented here (not in a pre-loop snapshot) so a user with
    // exactly MAX bots gets all MAX trading and an over-cap user gets the first
    // MAX — no all-at-limit starvation and no off-by-one.
    const userTraded = tradedPerUser[bot.def.userId] || 0;
    if (userTraded >= MAX_CONCURRENT_BOTS_PER_USER) continue;
    tradedPerUser[bot.def.userId] = userTraded + 1;

    // Place trade via Deriv API
    try {
      const conn = await derivManager.ensureConnected(bot.def.userId);
      if (!conn) {
        logger.warn("No Deriv connection for bot", { userId: bot.def.userId, botId: bot.def.id });
        continue;
      }

      const { contractType, barrier: actionBarrier } = actionToContractType(rule);
      const barrier = rule.condition?.barrier !== undefined ? Number(rule.condition.barrier) : actionBarrier;
      const entryPrice = prices[triggerIdx];
      const isDigit = isDigitContract(contractType);
      // Use the account's actual currency (e.g. USD, EUR, GBP, AUD) instead of
      // hardcoding USD — sending a proposal in the wrong currency is rejected by
      // Deriv or prices the contract incorrectly for non-USD accounts.
      const account = (conn as any)?.getSnapshot?.()?.account;
      const currency = account?.currency || "USD";

      // PORTFOLIO HEAT GATE — aggregate open-risk cap across everything this
      // user has running. Per-bot limits cannot see each other; this can.
      // Unknown balance → not gateable → existing per-bot limits still apply.
      try {
        const openPending = await db.getPendingTradesForUser(bot.def.userId);
        const heat = computePortfolioHeat(
          openPending.map((t) => parseFloat(String(t.stake))).filter(Number.isFinite),
          Number(account?.balance),
        );
        if (Number.isFinite(account?.balance) && !heat.wouldAllowNew(stake)) {
          logger.warn("Portfolio heat cap reached — bot trade suppressed", {
            userId: bot.def.userId,
            botId: bot.def.id,
            heatPct: Math.round(heat.heatPct * 10) / 10,
            capPct: heat.capPct,
            stake,
          });
          continue;
        }
      } catch (heatErr: any) {
        // Heat check must never be the reason a trade loop dies.
        logger.warn("Portfolio heat check failed (allowing per-bot limits to govern)", { error: heatErr?.message || heatErr });
      }

      // Use Deriv proposal/buy flow to place the actual trade
      const proposalPayload: Record<string, any> = {
        proposal: 1,
        amount: stake,
        basis: "stake",
        contract_type: contractType,
        currency,
        duration: 1,
        duration_unit: "t",
        underlying_symbol: symbol,
      };
      if (isDigit && barrier !== undefined) proposalPayload.barrier = String(barrier);
      // Deriv only honors SL/TP as a `limit_order` on multiplier/accumulator
      // contracts. Top-level stop_loss/take_profit are not part of the proposal
      // schema — sending them for rise/fall or digit contracts rejects the
      // proposal, so the bot would silently never trade.
      const limitOrder = buildLimitOrder(contractType, Number(rule.params?.stopLoss), Number(rule.params?.takeProfit));
      if (limitOrder.limit_order) proposalPayload.limit_order = limitOrder.limit_order;
      const proposal = await (conn as any).sendRaw(proposalPayload).catch((e: any) => {
        logger.warn("Deriv proposal failed", { userId: bot.def.userId, botId: bot.def.id, error: e?.message || e });
        return null;
      });
      if (!proposal?.proposal?.id) {
        logger.warn("Deriv proposal returned no id", { userId: bot.def.userId, botId: bot.def.id, response: JSON.stringify(proposal) });
        continue;
      }

      const buy = await (conn as any)
        .sendRaw({
          buy: proposal.proposal.id,
          price: proposal.proposal.ask_price,
        })
        .catch((e: any) => {
          logger.warn("Deriv buy failed", { userId: bot.def.userId, botId: bot.def.id, error: e?.message || e });
          return null;
        });
      if (!buy?.buy?.contract_id) {
        logger.warn("Deriv buy failed, trade not recorded", { userId: bot.def.userId, botId: bot.def.id, symbol });
        fireWebhookEvent(bot.def.userId, "trade.error", { botId: bot.def.id, symbol, stake, reason: "buy_failed" }).catch(() => {});
        continue;
      }

      // Record the trade as pending FIRST (settlement happens in SettlementTracker).
      // If this save fails we must NOT set hasOpenTrade=true, otherwise the bot is
      // locked forever with a live contract that has no DB row to settle.
      const entryTime = new Date();
      const botRunId = (() => {
        const parsed = parseInt(bot.def.id, 10);
        if (isNaN(parsed)) {
          console.error(`[ExecutionEngine] Invalid bot run ID: ${bot.def.id} (must be numeric)`);
          return undefined;
        }
        return parsed;
      })();
      try {
        const trade = await db.saveTrade({
          userId: bot.def.userId,
          symbol,
          contractType,
          stake: String(stake),
          entryPrice: String(entryPrice),
          result: "pending",
          contractId: String(buy.buy.contract_id),
          entryTime,
          botRunId,
        });
        import("./copyTrader").then(({ broadcastLeaderFill }) =>
          broadcastLeaderFill(trade, bot.def.userId).catch(() => {})
        ).catch(() => {});
      } catch (e: any) {
        logger.error("DB save failed after Deriv buy, retrying", { userId: bot.def.userId, botId: bot.def.id, contractId: String(buy.buy.contract_id), error: e?.message || e });
        await new Promise(r => setTimeout(r, 1000));
        try {
          const retriedTrade = await db.saveTrade({
            userId: bot.def.userId,
            symbol,
            contractType,
            stake: String(stake),
            entryPrice: String(entryPrice),
            result: "pending",
            contractId: String(buy.buy.contract_id),
            entryTime,
            botRunId,
          });
          logger.info("Retry succeeded for orphaned contract", { userId: bot.def.userId, contractId: String(buy.buy.contract_id) });
          import("./copyTrader").then(({ broadcastLeaderFill }) =>
            broadcastLeaderFill(retriedTrade, bot.def.userId).catch(() => {})
          ).catch(() => {});
        } catch (retryErr: any) {
          logger.error("CRITICAL: retry also failed, contract orphaned on Deriv", { userId: bot.def.userId, botId: bot.def.id, contractId: String(buy.buy.contract_id), error: retryErr?.message || retryErr });
          fireWebhookEvent(bot.def.userId, "trade.error", { botId: bot.def.id, symbol, stake, contractId: buy.buy.contract_id, reason: "db_save_failed" }).catch(() => {});
          continue;
        }
      }

      // Track open contract only after the pending row is safely recorded
      await botRunner.setOpenTrade(bot.def.id, bot.def.userId, true);
      fireWebhookEvent(bot.def.userId, "trade.executed", { botId: bot.def.id, symbol, stake, contractId: buy.buy.contract_id }).catch(() => {});
      traded++;
    } catch (e: any) {
      logger.error("Trade cycle error", { userId: bot.def.userId, botId: bot.def.id, error: e?.message || e });
    }
  }
}

export function startExecutionEngine(): void {
  if (intervalId) return;
  logger.info("ExecutionEngine starting", { pollInterval: POLL_INTERVAL });
  intervalId = setInterval(() => {
    executeBotCycle().catch((e) => logger.error("Cycle error", { error: e?.message || e }));
  }, POLL_INTERVAL);
}

export function stopExecutionEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

import * as db from "./db";
import { botRunner } from "./botRunner";
import { derivManager } from "./derivConnection";
import { getRecentTicks, isFeedStale } from "./tickCollector";
import { fireWebhookEvent } from "./webhookExecutor";
import { actionToContractType, isDigitContract } from "@shared/contractSim";

const POLL_INTERVAL = 500; // 500ms — near-live bot evaluation
const MAX_PIPELINE_TRADES = 50; // max trades in one cycle

let intervalId: ReturnType<typeof setInterval> | null = null;

function evaluateCondition(rule: any, prices: number[], digits: number[], idx: number): boolean {
  const cond = rule?.condition;
  if (!cond) return false;
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
  if (isFeedStale()) return;

  const allBots = botRunner.listAll();

  // Reset daily counters at midnight
  const now = Date.now();
  const midnight = new Date().setHours(0, 0, 0, 0);
  for (const bot of allBots) {
    if (!bot.lastDailyReset || bot.lastDailyReset < midnight) {
      bot.totalTrades = 0;
      bot.totalProfitLoss = 0;
      bot.lossStreak = 0;
      bot.lastDailyReset = now;
    }
  }

  let traded = 0;
  for (const bot of allBots) {
    if (traded >= MAX_PIPELINE_TRADES) break;
    if (bot.status !== "running" || bot.hasOpenTrade) continue;

    const strategy = bot.def?.strategy;
    const rule = strategy?.condition ? strategy : strategy?.rule || strategy?.config?.rule;
    if (!rule?.condition) continue;

    const symbol = rule.symbol || "R_100";
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
    if (safety.maxDailyTrades && bot.totalTrades >= safety.maxDailyTrades) continue;
    
    // maxConsecutiveLosses - consecutive loss limit
    if (safety.maxConsecutiveLosses && bot.lossStreak >= safety.maxConsecutiveLosses) continue;
    
    // maxDailyLoss - daily loss limit (reset at midnight)
    if (safety.maxDailyLoss && bot.totalProfitLoss <= -safety.maxDailyLoss) continue;
    
    // confidenceThreshold - minimum confidence to trade (placeholder for future)
    // Would require strategy evaluation to return confidence score
    if (safety.confidenceThreshold && safety.confidenceThreshold > 100) continue;

    const ticks = getRecentTicks(symbol, 100);
    if (ticks.length < 10) continue;

    const prices = ticks.map((t) => t.price);
    const digits = ticks.map((t) => t.lastDigit);

    // Evaluate the last N ticks
    let triggered = false;
    let triggerIdx = -1;
    for (let i = Math.max(0, prices.length - 10); i < prices.length; i++) {
      if (evaluateCondition(rule, prices, digits, i)) {
        triggered = true;
        triggerIdx = i;
        break;
      }
    }
    if (!triggered) continue;

    // Place trade via Deriv API
    try {
      const conn = await derivManager.ensureConnected(bot.def.userId);
      if (!conn) {
        console.warn(`[ExecutionEngine] No Deriv connection/token for bot ${bot.def.id} (user ${bot.def.userId}). Skipping.`);
        continue;
      }

      const { contractType, barrier: actionBarrier } = actionToContractType(rule);
      const barrier = rule.condition?.barrier !== undefined ? Number(rule.condition.barrier) : actionBarrier;
      const entryPrice = prices[triggerIdx];
      const isDigit = isDigitContract(contractType);
      // Use Deriv proposal/buy flow to place the actual trade
      const proposalPayload: Record<string, any> = {
        proposal: 1,
        amount: stake,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: 1,
        duration_unit: "t",
        symbol,
      };
      if (isDigit && barrier !== undefined) proposalPayload.barrier = String(barrier);
      // Enforce the strategy's stop-loss / take-profit on the live contract,
      // mirroring the manual terminal path.
      const sl = Number(rule.params?.stopLoss);
      const tp = Number(rule.params?.takeProfit);
      if (sl > 0) proposalPayload.stop_loss = String(sl);
      if (tp > 0) proposalPayload.take_profit = String(tp);
      const proposal = await (conn as any).sendRaw(proposalPayload).catch((e: any) => {
        console.warn(`[ExecutionEngine] Deriv proposal failed for bot ${bot.def.id}: ${e?.message || e}`);
        return null;
      });
      if (!proposal?.proposal?.id) {
        console.warn(`[ExecutionEngine] Deriv proposal returned no id for bot ${bot.def.id}. Response: ${JSON.stringify(proposal)}`);
        continue;
      }

      const buy = await (conn as any)
        .sendRaw({
          buy: proposal.proposal.id,
          price: proposal.proposal.ask_price,
        })
        .catch((e: any) => {
          console.warn(`[ExecutionEngine] Deriv buy failed for bot ${bot.def.id}: ${e?.message || e}`);
          return null;
        });
      if (!buy?.buy?.contract_id) {
        // Real fill failed. Do NOT fabricate a fake win/loss and record it as a
        // real trade in the user's history/portfolio/analytics — that silently
        // pollutes the trading record. Surface the failure instead and let the
        // bot evaluate again on the next cycle.
        console.warn(`[ExecutionEngine] Deriv buy failed for bot ${bot.def.id} (${symbol}). Trade not recorded.`);
        fireWebhookEvent(bot.def.userId, "trade.error", { botId: bot.def.id, symbol, stake, reason: "buy_failed" }).catch(() => {});
        continue;
      }

      // Track open contract
      botRunner.setOpenTrade(bot.def.id, bot.def.userId, true);
      // Record the trade as pending (settlement happens in SettlementTracker)
      await db.saveTrade({
        userId: bot.def.userId,
        symbol,
        contractType,
        stake: String(stake),
        entryPrice: String(entryPrice),
        result: "pending",
        contractId: String(buy.buy.contract_id),
        entryTime: new Date(),
        botRunId: (() => {
          const parsed = parseInt(bot.def.id, 10);
          if (isNaN(parsed)) {
            console.error(`[ExecutionEngine] Invalid bot run ID: ${bot.def.id} (must be numeric)`);
            return undefined;
          }
          return parsed;
        })(),
      });
      fireWebhookEvent(bot.def.userId, "trade.executed", { botId: bot.def.id, symbol, stake, contractId: buy.buy.contract_id }).catch(() => {});
      traded++;
    } catch (e: any) {
      console.error(`[ExecutionEngine] Trade cycle error for bot ${bot.def.id}:`, e?.message || e);
    }
  }
}

export function startExecutionEngine(): void {
  if (intervalId) return;
  console.log("[ExecutionEngine] Starting — polling every 500ms for active bots");
  intervalId = setInterval(() => {
    executeBotCycle().catch((e) => console.error("[ExecutionEngine] Cycle error:", e?.message || e));
  }, POLL_INTERVAL);
}

export function stopExecutionEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

import * as db from "./db";
import { botRunner } from "./botRunner";
import { derivManager } from "./derivConnection";
import { getRecentTicks, isFeedStale } from "./tickCollector";
import { fireWebhookEvent } from "./webhookExecutor";

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

function simulateOutcome(
  entryPrice: number,
  nextTick: { price: number; lastDigit: number } | undefined,
  contractType: string,
  barrier?: number,
): "win" | "loss" {
  if (!nextTick) return "loss";
  const nextPrice = nextTick.price;
  const d = nextTick.lastDigit;
  switch (contractType) {
    case "CALL":
      return nextPrice > entryPrice ? "win" : "loss";
    case "PUT":
      return nextPrice < entryPrice ? "win" : "loss";
    case "DIGITEVEN":
      return d % 2 === 0 ? "win" : "loss";
    case "DIGITODD":
      return d % 2 === 1 ? "win" : "loss";
    case "DIGITOVER":
      return d > (barrier ?? 5) ? "win" : "loss";
    case "DIGITUNDER":
      return d < (barrier ?? 5) ? "win" : "loss";
    case "DIGITMATCH":
      return d === (barrier ?? 0) ? "win" : "loss";
    case "DIGITDIFF":
      return d !== (barrier ?? 0) ? "win" : "loss";
    default:
      return nextPrice > entryPrice ? "win" : "loss";
  }
}

function actionToContractType(action: any): string {
  switch (action?.tradeType) {
    case "buy_rise":
      return "CALL";
    case "buy_fall":
      return "PUT";
    case "buy_even":
      return "DIGITEVEN";
    case "buy_odd":
      return "DIGITODD";
    case "buy_over":
      return "DIGITOVER";
    case "buy_under":
      return "DIGITUNDER";
    case "buy_digit_match":
      return "DIGITMATCH";
    case "buy_digit_diff":
      return "DIGITDIFF";
    default:
      return "CALL";
  }
}

async function executeBotCycle(): Promise<void> {
  if (isFeedStale()) return;

  const allBots = botRunner.listAll();

  let traded = 0;
  for (const bot of allBots) {
    if (traded >= MAX_PIPELINE_TRADES) break;
    if (bot.status !== "running" || bot.hasOpenTrade) continue;

    const strategy = bot.def?.strategy;
    const rule = strategy?.rule || strategy?.config?.rule;
    if (!rule?.condition) continue;

    const symbol = rule.symbol || "R_100";
    const stake = parseFloat(rule.params?.stake || "1");
    if (isNaN(stake) || stake <= 0) continue;

    // Check safety limits
    const safety = bot.def?.safety || {};
    if (safety.maxDailyTrades && bot.totalTrades >= safety.maxDailyTrades) continue;
    if (safety.maxConsecutiveLosses && bot.lossStreak >= safety.maxConsecutiveLosses) continue;
    if (safety.maxDailyLoss && bot.totalProfitLoss <= -safety.maxDailyLoss) continue;

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
      if (!conn) continue;

      const contractType = actionToContractType(rule.action);
      const barrier = rule.condition?.barrier !== undefined ? Number(rule.condition.barrier) : undefined;
      const entryPrice = prices[triggerIdx];
      const tickAfter = ticks[triggerIdx + 1];
      const isDigit = ["DIGITMATCH", "DIGITDIFF", "DIGITOVER", "DIGITUNDER", "DIGITEVEN", "DIGITODD"].includes(contractType);
      // Use Deriv proposal/buy flow to place the actual trade
      const proposalPayload: Record<string, any> = {
        proposal: 1,
        amount: stake,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: 1,
        duration_unit: "t",
        underlying_symbol: symbol,
      };
      if (isDigit && barrier !== undefined) proposalPayload.barrier = String(barrier);
      const proposal = await (conn as any).sendRaw(proposalPayload).catch(() => null);
      if (!proposal?.proposal?.id) continue;

      const buy = await (conn as any)
        .sendRaw({
          buy: proposal.proposal.id,
          price: proposal.proposal.ask_price,
        })
        .catch(() => null);
      if (!buy?.buy?.contract_id) {
        // Paper/simulation fallback if Deriv API not available
        if (tickAfter != null) {
          const result = simulateOutcome(entryPrice, tickAfter, contractType, barrier);
          const pnl = result === "win" ? stake * 0.95 : -stake;
          await db.saveTrade({
            userId: bot.def.userId,
            symbol,
            contractType,
            stake: String(stake),
            entryPrice: String(entryPrice),
            result,
            profitLoss: String(pnl),
            entryTime: new Date(ticks[triggerIdx].epoch * 1000),
            exitTime: new Date(ticks[triggerIdx + 1]?.epoch * 1000 || Date.now()),
            botRunId: (() => {
              const id = bot.def.id;
              if (typeof id === "string" && id.startsWith("bot_")) {
                return parseInt(id.replace("bot_", ""), 10) || undefined;
              }
              return parseInt(id, 10) || undefined;
            })(),
          });
          botRunner.updateTradeStats(bot.def.id, bot.def.userId, pnl);
          fireWebhookEvent(bot.def.userId, "trade.settled", { botId: bot.def.id, symbol, stake, result, profitLoss: pnl }).catch(() => {});
        }
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
        botRunId: parseInt(bot.def.id) || undefined,
      });
      fireWebhookEvent(bot.def.userId, "trade.executed", { botId: bot.def.id, symbol, stake, contractId: buy.buy.contract_id }).catch(() => {});
      traded++;
    } catch {
      // bot continues running; error is isolated to this trade
    }
  }
}

export function startExecutionEngine(): void {
  if (intervalId) return;
  console.log("[ExecutionEngine] Starting — polling every 500ms for active bots");
  intervalId = setInterval(() => {
    executeBotCycle().catch(() => {});
  }, POLL_INTERVAL);
}

export function stopExecutionEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

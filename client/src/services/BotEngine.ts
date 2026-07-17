import { derivWS, Tick, ContractUpdate, DerivContractType } from "./derivWebSocket";
import { StrategyRule } from "@/components/RuleBuilder";

export type BotStatus = "idle" | "running" | "error" | "stopped";

export interface BotConfig {
  symbol: string;
  // Full rule from the visual builder. This is the only strategy shape the
  // engine currently understands how to trade for real — the freeform
  // "blocks" builder mode is a draft/notes format, not executable.
  strategy: StrategyRule;
  decimalPlaces?: number; // last-digit precision for this symbol; default 2
}

export interface BotTrade {
  id: number;
  symbol: string;
  entryPrice: number;
  stake: number;
  pnl: string;
  result: "win" | "loss" | "open";
  timestamp: Date;
  contractId?: number;
}

// Maps the no-code rule's action into a real Deriv contract type + params.
function actionToContract(rule: StrategyRule): { contractType: DerivContractType; barrier?: number } {
  switch (rule.action.tradeType) {
    case "buy_rise":
      return { contractType: "CALL" };
    case "buy_fall":
      return { contractType: "PUT" };
    case "buy_even":
      return { contractType: "DIGITEVEN" };
    case "buy_odd":
      return { contractType: "DIGITODD" };
    case "buy_over":
      return { contractType: "DIGITOVER", barrier: rule.condition.barrier ?? 5 };
    case "buy_under":
      return { contractType: "DIGITUNDER", barrier: rule.condition.barrier ?? 5 };
    default:
      throw new Error(`Unknown trade action: ${rule.action.tradeType}`);
  }
}

export class BotEngine {
  private status: BotStatus = "idle";
  private config: BotConfig | null = null;
  private subscriptionId: number | null = null;
  private totalPnl = 0;
  private trades: BotTrade[] = [];
  private hasOpenTrade = false;
  private stopRequested = false;
  // Resolved when the currently-open trade settles, so callers can wait for
  // a clean stop instead of tearing down state mid-trade.
  private stopWaiters: Array<() => void> = [];

  // Rolling history used to evaluate conditions like "digit over 5 appeared 5 times"
  // or "3 consecutive rises". Capped so memory doesn't grow unbounded on long runs.
  private tickHistory: Tick[] = [];
  private readonly historyLimit = 200;

  private onStatusChange?: (status: BotStatus) => void;
  private onTick?: (tick: Tick) => void;
  private onTrade?: (trade: BotTrade) => void;
  private onLog?: (message: string) => void;

  constructor(callbacks: {
    onStatusChange?: (status: BotStatus) => void;
    onTick?: (tick: Tick) => void;
    onTrade?: (trade: BotTrade) => void;
    onLog?: (message: string) => void;
  }) {
    this.onStatusChange = callbacks.onStatusChange;
    this.onTick = callbacks.onTick;
    this.onTrade = callbacks.onTrade;
    this.onLog = callbacks.onLog;
  }

  public start(config: BotConfig) {
    if (this.status === "running") return;

    this.config = config;
    this.status = "running";
    this.stopRequested = false;
    this.tickHistory = [];
    this.onStatusChange?.(this.status);

    this.log(`Starting bot for ${config.symbol}...`);

    this.subscriptionId = derivWS.subscribe(config.symbol);

    derivWS.addListener({
      onTick: (tick) => this.handleTick(tick),
      onError: (err) => this.handleError(err),
    });
  }

  public stop() {
    if (this.status !== "running") return;

    this.stopRequested = true;

    if (this.subscriptionId !== null) {
      derivWS.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }

    this.status = "stopped";
    this.onStatusChange?.(this.status);
    this.log("Bot stopped manually.");
  }

  private handleTick(tick: Tick) {
    if (this.status !== "running" || !this.config) return;

    this.onTick?.(tick);

    this.tickHistory.push(tick);
    if (this.tickHistory.length > this.historyLimit) {
      this.tickHistory.shift();
    }

    // Never stack trades — wait for the open contract to resolve first.
    if (this.hasOpenTrade) return;

    if (this.evaluateStrategy()) {
      this.executeTrade();
    }
  }

  private lastDigit(price: number): number {
    const decimals = this.config?.decimalPlaces ?? derivWS.decimalPlacesFor(this.config.symbol);
    const fixed = price.toFixed(decimals);
    return parseInt(fixed[fixed.length - 1], 10);
  }

  /**
   * Returns true if the current tick satisfies the strategy's per-tick condition,
   * given the rule's indicator (digit_over/under/even/odd, consecutive_rise/fall).
   */
  private tickSatisfiesIndicator(index: number): boolean {
    if (!this.config) return false;
    const rule = this.config.strategy;
    const tick = this.tickHistory[index];
    const indicator = rule.condition.indicator;

    switch (indicator) {
      case "digit_over":
        return this.lastDigit(tick.price) > (rule.condition.barrier ?? 5);
      case "digit_under":
        return this.lastDigit(tick.price) < (rule.condition.barrier ?? 5);
      case "digit_even":
        return this.lastDigit(tick.price) % 2 === 0;
      case "digit_odd":
        return this.lastDigit(tick.price) % 2 === 1;
      case "parity":
        return rule.condition.barrier === 1
          ? this.lastDigit(tick.price) % 2 === 1
          : this.lastDigit(tick.price) % 2 === 0;
      case "last_digit":
        if (rule.condition.comparison === "greater_than") return this.lastDigit(tick.price) > (rule.condition.barrier ?? 5);
        if (rule.condition.comparison === "less_than") return this.lastDigit(tick.price) < (rule.condition.barrier ?? 5);
        return this.lastDigit(tick.price) === (rule.condition.barrier ?? 0);
      case "parity":
        return rule.condition.barrier === 1
          ? this.lastDigit(tick.price) % 2 === 1
          : this.lastDigit(tick.price) % 2 === 0;
      case "last_digit":
        if (rule.condition.comparison === "greater_than") return this.lastDigit(tick.price) > (rule.condition.barrier ?? 5);
        if (rule.condition.comparison === "less_than") return this.lastDigit(tick.price) < (rule.condition.barrier ?? 5);
        return this.lastDigit(tick.price) === (rule.condition.barrier ?? 0);
      case "consecutive_rise":
        return index > 0 && tick.price > this.tickHistory[index - 1].price;
      case "consecutive_fall":
        return index > 0 && tick.price < this.tickHistory[index - 1].price;
      default:
        return false;
    }
  }

  /**
   * "appears_consecutively": the last N ticks must ALL satisfy the indicator, back to back.
   * "appears": the indicator must have been true at least N times within the recent window.
   */
  private evaluateStrategy(): boolean {
    if (!this.config) return false;
    const { comparison, count } = this.config.strategy.condition;
    if (this.tickHistory.length < count) return false;

    if (comparison === "appears_consecutively") {
      for (let i = this.tickHistory.length - count; i < this.tickHistory.length; i++) {
        if (!this.tickSatisfiesIndicator(i)) return false;
      }
      return true;
    }

    // "appears": frequency count within the trailing window (last 20 ticks, or all history if shorter)
    const windowStart = Math.max(0, this.tickHistory.length - 20);
    let occurrences = 0;
    for (let i = windowStart; i < this.tickHistory.length; i++) {
      if (this.tickSatisfiesIndicator(i)) occurrences++;
    }
    return occurrences >= count;
  }

      private async executeTrade() {
    if (!this.config) return;
    const currentTick = this.tickHistory[this.tickHistory.length - 1];
    const { stake } = this.config.strategy.params;

    const decimalRegex = /^\d+(\.\d{1,8})?$/;
    if (!decimalRegex.test(stake.toString())) {
      throw new Error(`Invalid stake amount: ${stake} must be a valid decimal number`);
    }
    const numStake = stake;
    if (numStake < 0.35 || numStake > 999999) {
      throw new Error(`Invalid stake amount: ${numStake} must be between 0.35 and 999999`);
    }

    let contractType: DerivContractType;
    let barrier: number | undefined;
    try {
      const mapped = actionToContract(this.config.strategy);
      contractType = mapped.contractType;
      barrier = mapped.barrier;
    } catch (e) {
      this.handleError(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    this.log(`Signal detected at ${currentTick.price} — placing ${contractType} for $${stake}`);
    this.hasOpenTrade = true;

    const pendingTrade: BotTrade = {
      id: Date.now(),
      symbol: this.config.symbol,
      entryPrice: currentTick.price,
      stake,
      pnl: "0.00",
      result: "open",
      timestamp: new Date(),
    };

    try {
      if (derivWS.isConnected() && derivWS.isAuthorized()) {
        // Real money path: proposal -> buy -> subscribe for the settled result.
        const purchase = await derivWS.purchaseContract({
          symbol: this.config.symbol,
          contractType,
          amount: stake,
          duration: 5,
          durationUnit: "t",
          barrier,
        });
        pendingTrade.contractId = purchase.contractId;
        this.trades.push(pendingTrade);
        this.onTrade?.(pendingTrade);

        derivWS.subscribeToContract(purchase.contractId, (update) => this.handleContractUpdate(pendingTrade, update));
      } else {
        // No live/authorized connection — engine is in demo/offline mode.
        // We do NOT fabricate a win/loss here; the bot simply can't trade for real right now.
        this.hasOpenTrade = false;
        this.handleError(new Error("Not connected to a live, authorized Deriv session — cannot place a real trade. Add a Deriv API token in Settings."));
        return;
      }
    } catch (error) {
      this.hasOpenTrade = false;
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleContractUpdate(trade: BotTrade, update: ContractUpdate) {
    if (!update.is_sold) return; // still open, ignore intermediate ticks on the contract

    this.hasOpenTrade = false;
    trade.pnl = update.profit.toFixed(2);
    trade.result = update.profit >= 0 ? "win" : "loss";
    this.totalPnl += update.profit;
    this.onTrade?.(trade);

    const waiters = this.stopWaiters;
    this.stopWaiters = [];
    waiters.forEach((resolve) => resolve());

    this.log(`Contract ${trade.contractId} settled: ${trade.result} ($${trade.pnl})`);

    if (!this.config) return;
    const { stopLoss, takeProfit } = this.config.strategy.params;
    if (stopLoss > 0 && this.totalPnl <= -Math.abs(stopLoss)) {
      this.log(`Stop loss of $${stopLoss} hit (P&L $${this.totalPnl.toFixed(2)}). Stopping bot.`);
      this.stop();
    } else if (takeProfit > 0 && this.totalPnl >= Math.abs(takeProfit)) {
      this.log(`Take profit of $${takeProfit} hit (P&L $${this.totalPnl.toFixed(2)}). Stopping bot.`);
      this.stop();
    }
  }

  private handleError(error: Error) {
    console.error("[BotEngine] Error:", error);
    this.log(`Error: ${error.message}`);
    if (this.stopRequested) return; // errors after an intentional stop shouldn't flip status back
    this.status = "error";
    this.onStatusChange?.(this.status);
  }

  private log(message: string) {
    console.log(`[BotEngine] ${message}`);
    this.onLog?.(message);
  }

  /** True if a trade is currently open and hasn't settled yet. */
  public hasPendingTrade(): boolean {
    return this.hasOpenTrade;
  }

  /**
   * Resolves once the currently-open trade settles, or immediately if none is
   * open. Times out after 30s as a safety net so a caller (e.g. a Stop button)
   * never hangs indefinitely if a settlement update never arrives.
   */
  public waitForOpenTradeToSettle(timeoutMs = 30000): Promise<void> {
    if (!this.hasOpenTrade) return Promise.resolve();
    return new Promise((resolve) => {
      const onSettle = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.stopWaiters = this.stopWaiters.filter((w) => w !== onSettle);
        resolve();
      }, timeoutMs);
      this.stopWaiters.push(onSettle);
    });
  }

  public getStatus() {
    return this.status;
  }

  public getTotalPnl() {
    return this.totalPnl;
  }

  public getTrades() {
    return this.trades;
  }
}

import { derivWS, Tick } from "./derivWebSocket";

export type BotStatus = "idle" | "running" | "error" | "stopped";

export interface BotConfig {
  symbol: string;
  stake: number;
  stopLoss: number;
  takeProfit: number;
  strategy: any; // Strategy configuration from builder
}

export class BotEngine {
  private status: BotStatus = "idle";
  private config: BotConfig | null = null;
  private subscriptionId: number | null = null;
  private balance: number = 0;
  private totalPnl: number = 0;
  private trades: any[] = [];
  
  private onStatusChange?: (status: BotStatus) => void;
  private onTick?: (tick: Tick) => void;
  private onTrade?: (trade: any) => void;

  constructor(callbacks: {
    onStatusChange?: (status: BotStatus) => void;
    onTick?: (tick: Tick) => void;
    onTrade?: (trade: any) => void;
  }) {
    this.onStatusChange = callbacks.onStatusChange;
    this.onTick = callbacks.onTick;
    this.onTrade = callbacks.onTrade;
  }

  public start(config: BotConfig) {
    if (this.status === "running") return;
    
    this.config = config;
    this.status = "running";
    this.onStatusChange?.(this.status);

    console.log(`[BotEngine] Starting bot for ${config.symbol}...`);

    // Subscribe to market data
    this.subscriptionId = derivWS.subscribe(config.symbol);
    
    derivWS.addListener({
      onTick: (tick) => this.handleTick(tick),
      onError: (err) => this.handleError(err),
    });
  }

  public stop() {
    if (this.status !== "running") return;
    
    if (this.subscriptionId !== null) {
      derivWS.unsubscribe(this.subscriptionId);
    }
    
    this.status = "stopped";
    this.onStatusChange?.(this.status);
    console.log("[BotEngine] Bot stopped manually.");
  }

  private handleTick(tick: Tick) {
    if (this.status !== "running" || !this.config) return;
    
    this.onTick?.(tick);

    // Placeholder for strategy evaluation logic
    // In a real implementation, we would evaluate the blocks/rules here
    this.evaluateStrategy(tick);
  }

  private evaluateStrategy(tick: Tick) {
    // This is where the magic happens
    // Example: Simple Random Entry for Demo
    if (Math.random() > 0.98) {
       this.executeTrade(tick);
    }
  }

  private executeTrade(tick: Tick) {
    if (!this.config) return;

    console.log(`[BotEngine] Strategy signal detected! Executing trade at ${tick.price}`);
    
    // Mock trade execution
    const isWin = Math.random() > 0.5;
    const pnl = isWin ? this.config.stake * 0.95 : -this.config.stake;
    
    const trade = {
      id: Date.now(),
      symbol: this.config.symbol,
      entryPrice: tick.price,
      stake: this.config.stake,
      pnl: pnl.toFixed(2),
      result: isWin ? "win" : "loss",
      timestamp: new Date()
    };

    this.totalPnl += pnl;
    this.trades.push(trade);
    this.onTrade?.(trade);
  }

  private handleError(error: Error) {
    console.error("[BotEngine] Error:", error);
    this.status = "error";
    this.onStatusChange?.(this.status);
  }

  public getStatus() { return this.status; }
  public getTotalPnl() { return this.totalPnl; }
}

import { Tick } from "./derivWebSocket";
import { getDecimalPlaces } from "@shared/lastDigit";
import { actionToContractType, calcPnl, simulateOutcome } from "@shared/contractSim";

const PAPER_BALANCE_KEY = "369labs_paper_balance";
const DEFAULT_PAPER_BALANCE = 10000;

export interface PaperTradeResult {
  tradeId: number;
  entryPrice: number;
  exitPrice: number;
  result: "win" | "loss";
  pnl: number;
  contractType: string;
  entryTime: number;
  exitTime: number;
}

export class PaperEngine {
  private balance: number;
  private trades: PaperTradeResult[] = [];
  private listeners: Set<(bal: number) => void> = new Set();
  private tradeListeners: Set<(trade: PaperTradeResult) => void> = new Set();

  constructor() {
    const saved = localStorage.getItem(PAPER_BALANCE_KEY);
    this.balance = saved ? parseFloat(saved) : DEFAULT_PAPER_BALANCE;
  }

  getBalance(): number {
    return this.balance;
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb(this.balance);
      } catch {}
    });
  }

  resetBalance(): void {
    this.balance = DEFAULT_PAPER_BALANCE;
    this.trades = [];
    localStorage.setItem(PAPER_BALANCE_KEY, String(this.balance));
    this.notify();
  }

  onBalance(cb: (bal: number) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onTrade(cb: (trade: PaperTradeResult) => void): () => void {
    this.tradeListeners.add(cb);
    return () => this.tradeListeners.delete(cb);
  }

  async executeTrade(entryTick: Tick, strategy: any, stake: number, symbol?: string): Promise<PaperTradeResult> {
    const decimals = symbol ? getDecimalPlaces(symbol) : 2;
    const { contractType, barrier } = actionToContractType(strategy);

    const tradeId = Date.now() + Math.floor(Math.random() * 1000);
    const entryPrice = entryTick.price;

    const result: PaperTradeResult = {
      tradeId,
      entryPrice,
      exitPrice: entryPrice,
      result: "win",
      pnl: 0,
      contractType,
      entryTime: entryTick.timestamp,
      exitTime: 0,
    };

    return new Promise((resolve) => {
      setTimeout(
        () => {
          // Use volatility-scaled random move instead of flat ±2 range
          const volatility = Math.max(entryPrice * 0.001, 0.1); // ~0.1% of entry price
          const exitPrice = entryPrice + (Math.random() - 0.5) * 2 * volatility;
          result.exitPrice = exitPrice;
          result.exitTime = Date.now();
          const outcome = simulateOutcome(entryPrice, exitPrice, contractType, barrier, decimals);
          result.result = outcome === "draw" ? "loss" : outcome;
          result.pnl = calcPnl(result.result, stake);

          this.balance += result.pnl;
          localStorage.setItem(PAPER_BALANCE_KEY, String(this.balance));
          this.trades.push(result);
          this.notify();
          this.tradeListeners.forEach((cb) => {
            try {
              cb(result);
            } catch {}
          });

          resolve(result);
        },
        1000 + Math.random() * 2000,
      );
    });
  }
}

export const paperEngine = new PaperEngine();

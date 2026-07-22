import { Tick } from "./derivWebSocket";
import { lastDigitOf } from "./conditionEval";

const PAPER_BALANCE_KEY = "369labs_paper_balance";
const DEFAULT_PAPER_BALANCE = 10000;

function simulateOutcome(entryPrice: number, nextPrice: number, contractType: string, barrier?: number): "win" | "loss" {
  switch (contractType) {
    case "CALL": return nextPrice > entryPrice ? "win" : "loss";
    case "PUT": return nextPrice < entryPrice ? "win" : "loss";
    case "DIGITEVEN": return lastDigitOf(nextPrice) % 2 === 0 ? "win" : "loss";
    case "DIGITODD": return lastDigitOf(nextPrice) % 2 === 1 ? "win" : "loss";
    case "DIGITOVER": return lastDigitOf(nextPrice) > (barrier ?? 5) ? "win" : "loss";
    case "DIGITUNDER": return lastDigitOf(nextPrice) < (barrier ?? 5) ? "win" : "loss";
    default: return nextPrice > entryPrice ? "win" : "loss";
  }
}

function calcPnl(result: "win" | "loss", stake: number): number {
  return result === "win" ? stake * 0.95 : -stake;
}

function actionToContract(action: any): { contractType: string; barrier?: number } {
  switch (action?.tradeType) {
    case "buy_rise": return { contractType: "CALL" };
    case "buy_fall": return { contractType: "PUT" };
    case "buy_even": return { contractType: "DIGITEVEN" };
    case "buy_odd": return { contractType: "DIGITODD" };
    case "buy_over": return { contractType: "DIGITOVER", barrier: action.barrier ?? 5 };
    case "buy_under": return { contractType: "DIGITUNDER", barrier: action.barrier ?? 5 };
    default: return { contractType: "CALL" };
  }
}

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

  getBalance(): number { return this.balance; }

  private notify(): void {
    this.listeners.forEach(cb => { try { cb(this.balance); } catch {} });
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

  async executeTrade(
    entryTick: Tick,
    strategyAction: any,
    stake: number,
  ): Promise<PaperTradeResult> {
    const { contractType, barrier } = actionToContract(strategyAction);

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
      setTimeout(() => {
        const exitPrice = entryPrice + (Math.random() - 0.46) * 2;
        result.exitPrice = exitPrice;
        result.exitTime = Date.now();
        result.result = simulateOutcome(entryPrice, exitPrice, contractType, barrier);
        result.pnl = calcPnl(result.result, stake);

        this.balance += result.pnl;
        localStorage.setItem(PAPER_BALANCE_KEY, String(this.balance));
        this.trades.push(result);
        this.notify();
        this.tradeListeners.forEach(cb => { try { cb(result); } catch {} });

        resolve(result);
      }, 1000 + Math.random() * 2000);
    });
  }
}

export const paperEngine = new PaperEngine();
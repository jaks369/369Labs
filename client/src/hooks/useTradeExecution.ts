/**
 * Shared trade-execution core.
 *
 * Born from the desktop Dashboard purchase flow (the contract-type map, the
 * REAL-account confirm, the daily-loss guard, the Deriv proposal→buy, and the
 * settlement subscription) and reused by the mobile terminal so both run the
 * exact same logic. The desktop page is NOT modified — this is the canonical
 * home for the logic, and callers keep persistence via onFill / onSettle.
 */

import { useCallback, useRef, useState } from "react";
import { derivWS } from "@/services/derivWebSocket";
import type { ContractSelection } from "@/components/ContractTypeSelector";
import type { DurationUnit } from "@/components/DurationSelector";

export interface TradeSpec {
  symbol: string;
  contract: ContractSelection;
  stake: number;
  duration: number;
  durationUnit: DurationUnit;
  stopLoss: number;
  takeProfit: number;
}

export interface TradeFill {
  contractId: string;
  symbol: string;
  contractType: string;
  stake: number;
  entryPrice: string;
  entryTime: Date;
  balanceAfter?: number;
}

/** Map a terminal contract selection to the Deriv contract type string. */
export function mapContractType(contract: ContractSelection, direction?: "rise" | "fall"): string | null {
  const map: Record<string, string> = {
    rise_fall: (direction || contract.direction) === "fall" ? "PUT" : "CALL",
    over_under: contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
    even_odd: contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
    digits: contract.digitMatch === "differ" ? "DIGITDIFF" : "DIGITMATCH",
    accumulator: "ACCU",
  };
  return map[contract.category] ?? null;
}

export interface UseTradeExecutionHooks {
  /** "real" | "demo" | … — gates the REAL-account confirmation. */
  accountType: string;
  /** Called when no authorized Deriv session exists (open the token modal). */
  onRequireToken?: () => void;
  /** Optional daily-loss guard: the limit and today's P&L so far. */
  dailyLossLimit?: { limit: number; todayPnl: number };
  onError?: (msg: string) => void;
  /** Called after a successful buy so the caller can persist the pending row. */
  onFill?: (fill: TradeFill) => void | Promise<void>;
  /** Called when the contract settles (win/loss). */
  onSettle?: (fill: TradeFill, profit: number) => void | Promise<void>;
  /** Called after a fill so the caller can surface open positions. */
  onOpenPositions?: () => void;
}

/**
 * One shared path for placing a terminal trade. Mirrors the desktop flow:
 * authorize → map type → daily-loss guard → REAL confirm → purchase (with
 * SL/TP, barriers, accumulator growth) → register contract meta → subscribe
 * and settle. Returns the fill on success, null when skipped/failed.
 */
export function useTradeExecution(spec: TradeSpec, hooks: UseTradeExecutionHooks) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { accountType, onRequireToken, dailyLossLimit, onError, onFill, onSettle, onOpenPositions } = hooks;

  const placeTrade = useCallback(
    async (dir?: "rise" | "fall"): Promise<TradeFill | null> => {
      if (busyRef.current) return null;
      if (!derivWS.isAuthorized()) {
        onRequireToken?.();
        return null;
      }
      const contractType = mapContractType(spec.contract, dir);
      if (!contractType) {
        onError?.("Unsupported contract type.");
        return null;
      }
      if (dailyLossLimit && dailyLossLimit.limit > 0 && dailyLossLimit.todayPnl <= -dailyLossLimit.limit) {
        onError?.(`Daily loss limit of $${dailyLossLimit.limit} reached. Trading blocked until tomorrow.`);
        return null;
      }
      if (accountType === "real") {
        const ok = window.confirm("You are connected to a REAL account. This trade uses real funds. Continue?");
        if (!ok) return null;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const { symbol, contract, stake, duration, durationUnit, stopLoss, takeProfit } = spec;
        const isAccumulator = contract.category === "accumulator";
        const purchase = await derivWS.purchaseContract({
          symbol,
          contractType: contractType as any,
          amount: stake,
          ...(isAccumulator ? { growthRate: contract.growthRate ?? 1 } : { duration, durationUnit }),
          ...(contract.category === "over_under" && contract.barrier !== undefined ? { barrier: contract.barrier } : {}),
          ...(contract.category === "digits" && contract.digit !== undefined ? { barrier: contract.digit } : {}),
          ...(stopLoss > 0 ? { stopLoss } : {}),
          ...(takeProfit > 0 ? { takeProfit } : {}),
        });
        const entryTime = new Date();
        const entryPrice = String(purchase.entrySpot ?? purchase.buyPrice ?? stake);
        const fill: TradeFill = {
          contractId: String(purchase.contractId),
          symbol,
          contractType,
          stake,
          entryPrice,
          entryTime,
          balanceAfter: typeof purchase.balanceAfter === "number" ? purchase.balanceAfter : undefined,
        };
        derivWS.registerContractMeta(purchase.contractId, {
          stake: String(stake),
          entryPrice,
          entryTime: entryTime.toISOString(),
          symbol,
          contractType,
        });
        await onFill?.(fill);
        derivWS.subscribeToContract(purchase.contractId, (c: any) => {
          if (c.status === "open") return;
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          onSettle?.(fill, profit);
          derivWS.clearContractMeta(purchase.contractId);
        });
        onOpenPositions?.();
        return fill;
      } catch (e: any) {
        onError?.(e?.message || "Trade failed");
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [spec, accountType, onRequireToken, dailyLossLimit, onError, onFill, onSettle, onOpenPositions],
  );

  return { busy, placeTrade };
}

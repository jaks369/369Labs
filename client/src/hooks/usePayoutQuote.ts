/**
 * Shared payout-quote hook.
 *
 * Computes a real-time payout estimate from Deriv's proposal endpoint for any
 * contract type + barrier combination. Used by both Desktop (TerminalContextPanel)
 * and Mobile (MobileTerminal) to avoid duplicating the payout logic.
 */

import { useEffect, useState } from "react";
import type { ContractSelection } from "@/components/ContractTypeSelector";
import type { ContractCategory } from "@shared/contractAvailability";
import type { DurationUnit } from "@/components/DurationSelector";
import { derivWS } from "@/services/derivWebSocket";
import { formatMoney } from "@/lib/format";

export interface PayoutQuoteResult {
  payoutEst: number | null;
  payoutError: string | null;
  payoutLabel: string;
}

export function usePayoutQuote(
  selectedSymbol: string,
  contract: ContractSelection,
  stake: number,
  duration: number,
  durationUnit: DurationUnit,
  isAuthorized: boolean,
): PayoutQuoteResult {
  const [payoutEst, setPayoutEst] = useState<number | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthorized) {
      setPayoutEst(null);
      setPayoutError(null);
      return;
    }
    const map: Record<ContractCategory, string> = {
      rise_fall: contract.direction === "fall" ? "PUT" : "CALL",
      higher_lower: contract.direction === "fall" ? "PUT" : "CALL",
      over_under: contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
      even_odd: contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
      digits: contract.digitMatch === "differ" ? "DIGITDIFF" : "DIGITMATCH",
      accumulator: "ACCU",
    };
    const contractType = map[contract.category];
    if (!contractType || !selectedSymbol) return;
    const barrier = contract.category === "higher_lower"
      ? contract.barrier
      : contract.category === "over_under"
        ? contract.barrier
        : contract.category === "digits"
          ? contract.digit
          : undefined;
    derivWS
      .getPayoutQuote({
        symbol: selectedSymbol,
        contractType: contractType as any,
        amount: stake,
        ...(contract.category === "accumulator" ? { growthRate: contract.growthRate ?? 1 } : { duration, durationUnit }),
        ...(barrier !== undefined ? { barrier } : {}),
      })
      .then((q) => {
        if (cancelled) return;
        setPayoutEst(q && q.payout > 0 ? q.payout : null);
        setPayoutError(null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setPayoutEst(null);
        setPayoutError((e?.message || String(e || "")).slice(0, 120) || null);
      });
    return () => { cancelled = true; };
  }, [selectedSymbol, contract, stake, isAuthorized, duration, durationUnit]);

  const payoutLabel = payoutEst !== null && payoutEst > 0 ? formatMoney(payoutEst) : "—";
  return { payoutEst, payoutError, payoutLabel };
}

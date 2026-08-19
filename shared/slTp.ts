/** Deriv only honors stop-loss/take-profit through `limit_order`, and only for
 *  multiplier (MULTUP/MULTDOWN) and accumulator (ACCU) contracts. Top-level
 *  `stop_loss`/`take_profit` are not part of the proposal schema (the schema
 *  sets `additionalProperties: false`) — sending them for rise/fall or digit
 *  contracts makes Deriv reject the proposal, silently blocking the trade.
 *  ACCU exposes take_profit only; stop_loss is forwarded for multipliers. */
export const LIMIT_ORDER_CONTRACT_TYPES = ["ACCU", "MULTUP", "MULTDOWN"] as const;
export type LimitOrderContractType = (typeof LIMIT_ORDER_CONTRACT_TYPES)[number];

export function isLimitOrderContract(contractType: string): boolean {
  return (LIMIT_ORDER_CONTRACT_TYPES as readonly string[]).includes(contractType);
}

export function buildLimitOrder(contractType: string, stopLoss?: number, takeProfit?: number): Record<string, unknown> {
  const limit: Record<string, number> = {};
  if (takeProfit !== undefined && takeProfit > 0 && (contractType === "ACCU" || contractType === "MULTUP" || contractType === "MULTDOWN")) {
    limit.take_profit = takeProfit;
  }
  if (stopLoss !== undefined && stopLoss > 0 && (contractType === "MULTUP" || contractType === "MULTDOWN")) {
    limit.stop_loss = stopLoss;
  }
  return Object.keys(limit).length ? { limit_order: limit } : {};
}
import { derivManager } from "./derivConnection";
import * as db from "./db";

export async function getPortfolioSnapshot(userId: number) {
  try {
    const conn = await derivManager.ensureConnected(userId);
    if (!conn) {
      return {
        connected: false, authorized: false, balance: 0, equity: 0,
        accountType: null, currency: "USD", openPositionCount: 0,
        unrealizedPnl: 0, totalPositions: 0, totalTrades: 0,
      };
    }
    const snap = conn.getSnapshot();
    const account = snap.account || { balance: 0, currency: "USD", accountType: "" };
    return {
      connected: snap.connected,
      authorized: snap.authorized,
      balance: account.balance,
      equity: account.balance,
      accountType: account.accountType,
      currency: account.currency || "USD",
      openPositionCount: snap.openPositionCount,
      unrealizedPnl: snap.totalUnrealizedPnl,
      totalPositions: snap.positions.length,
      totalTrades: (await db.getTradesByUserId(userId, 1)).length > 0 ? await db.getTradesByUserId(userId, 1).then(r => r.length) : 0,
    };
  } catch {
    return {
      connected: false, authorized: false, balance: 0, equity: 0,
      accountType: null, currency: "USD", openPositionCount: 0,
      unrealizedPnl: 0, totalPositions: 0, totalTrades: 0,
    };
  }
}

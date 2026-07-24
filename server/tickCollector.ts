import { WebSocket } from "ws";
import { saveTickHistory } from "./db";
import { getAllVolatilitySymbols } from "@shared/symbols";

const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";
const VOLATILITY_PREFIXES = getAllVolatilitySymbols();

let ws: WebSocket | null = null;
let started = false;
// Feed integrity tracking. Bots/strategies should pause when feed is stale or out of order.
const lastTickEpoch: Record<string, number> = {};
let lastAnyTickEpoch = 0;
let feedStale = false;
export function isFeedStale(): boolean { return feedStale; }
export function getFeedHealth(): { stale: boolean; lastTickEpoch: number } { return { stale: feedStale, lastTickEpoch: lastAnyTickEpoch }; }
let msgId = 1;

function decimalPlacesFor(symbol: string): number {
  // Volatility indices use 3 decimals; R_100/R_200 historically 2, but Deriv serves 3-4.
  // We compute the last digit from the raw quoted string to stay accurate.
  return 3;
}

async function fetchActiveSymbols(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!ws) return resolve([]);
    const reqId = msgId++;
    const handler = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.req_id !== reqId) return;
        ws!.removeListener("message", handler);
        const syms = (msg.active_symbols || [])
          .map((s: any) => s.symbol as string)
          .filter((s: string) => VOLATILITY_PREFIXES.some((p) => s === p || s.startsWith(p + "_")));
        resolve(syms);
      } catch {
        resolve([]);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ active_symbols: "full", req_id: reqId }));
    setTimeout(() => resolve([]), 8000);
  });
}

function subscribeSymbol(symbol: string) {
  if (!ws) return;
  ws.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: msgId++ }));
}

export function startTickCollector() {
  if (started) return;
  started = true;
  try {
    ws = new WebSocket(DERIV_WS_PUBLIC);
    ws.on("open", async () => {
      console.log("[tickCollector] connected");
      const symbols = await fetchActiveSymbols();
      console.log(`[tickCollector] subscribing to ${symbols.length} volatility symbols`);
      symbols.forEach(subscribeSymbol);
    });
    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg.tick) return;
        const symbol = msg.tick.symbol;
        const quote = String(msg.tick.quote);
        const epoch = Number(msg.tick.epoch) || Math.floor(Date.now() / 1000);
        // last digit = the FINAL decimal digit of the tick price (true Deriv "last digit").
        // e.g. 95.2144 -> 4, 95.2279 -> 9. This is what digit strategies analyze.
        const numStr = String(quote).replace(".", "");
        const lastDigit = parseInt(numStr[numStr.length - 1], 10) || 0;
        const prev = lastTickEpoch[symbol] || 0;
        const outOfOrder = prev && epoch < prev;
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - lastAnyTickEpoch > 30) feedStale = true; // no tick across all symbols for 30s
        lastAnyTickEpoch = nowSec;
        lastTickEpoch[symbol] = epoch;
        if (outOfOrder) {
          console.warn(`[tickCollector] out-of-order tick for ${symbol}: ${epoch} < ${prev}`);
        }
        saveTickHistory({
          symbol,
          price: quote,
          lastDigit,
          epoch,
        }).catch(() => {});
      } catch {}
    });
    ws.on("error", (e: any) => console.warn("[tickCollector] error:", e?.message || e));
    ws.on("close", () => {
      console.log("[tickCollector] closed, will retry in 10s");
      ws = null;
      setTimeout(() => startTickCollector(), 10000);
    });
  } catch (e) {
    console.warn("[tickCollector] failed to start:", e);
  }
}

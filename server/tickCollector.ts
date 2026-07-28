import { WebSocket } from "ws";
import { saveTickHistory } from "./db";
import { getAllVolatilitySymbols } from "@shared/symbols";
import { getDecimalPlaces } from "@shared/lastDigit";

const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";
const VOLATILITY_PREFIXES = getAllVolatilitySymbols();

let ws: WebSocket | null = null;
let started = false;
let subscribedSymbolsOnServer = new Set<string>();
// Feed integrity tracking. Bots/strategies should pause when feed is stale or out of order.
const lastTickEpoch: Record<string, number> = {};
let lastAnyTickEpoch = 0;
let feedStale = false;
// In-memory tick buffer: symbol -> latest 500 ticks (for strategy evaluation)
const tickBuffer = new Map<string, { price: number; epoch: number; lastDigit: number }[]>();
const MAX_TICKS_PER_SYMBOL = 500;
export function getRecentTicks(symbol: string, count: number = 100): { price: number; epoch: number; lastDigit: number }[] {
  const buf = tickBuffer.get(symbol);
  if (!buf) return [];
  return buf.slice(-count);
}
export function isFeedStale(): boolean { return feedStale; }
export function getFeedHealth(): { stale: boolean; lastTickEpoch: number } { return { stale: feedStale, lastTickEpoch: lastAnyTickEpoch }; }
let msgId = 1;

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
  if (subscribedSymbolsOnServer.has(symbol)) return;
  subscribedSymbolsOnServer.add(symbol);
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
        const decimals = getDecimalPlaces(symbol);
        const lastDigit = parseInt(Number(quote).toFixed(decimals).slice(-1), 10) || 0;
        const prev = lastTickEpoch[symbol] || 0;
        const outOfOrder = prev && epoch < prev;
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - lastAnyTickEpoch > 30) { feedStale = true; } else { feedStale = false; }
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
        // maintain in-memory buffer for strategy execution
        if (!tickBuffer.has(symbol)) tickBuffer.set(symbol, []);
        const buf = tickBuffer.get(symbol)!;
        buf.push({ price: parseFloat(quote), epoch, lastDigit });
        if (buf.length > MAX_TICKS_PER_SYMBOL) buf.splice(0, buf.length - MAX_TICKS_PER_SYMBOL);
      } catch {}
    });
    ws.on("error", (e: any) => console.warn("[tickCollector] error:", e?.message || e));
    ws.on("close", () => {
      console.log("[tickCollector] closed, will retry in 10s");
      ws = null;
      subscribedSymbolsOnServer.clear();
      started = false; // allow reconnection
      setTimeout(() => startTickCollector(), 10000);
    });
  } catch (e) {
    console.warn("[tickCollector] failed to start:", e);
  }
}

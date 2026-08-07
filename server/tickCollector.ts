import { WebSocket } from "ws";
import { saveTickHistory } from "./db";
import { getAllVolatilitySymbols } from "@shared/symbols";
import { getDecimalPlaces, lastDigitOf } from "@shared/lastDigit";

const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";
const VOLATILITY_PREFIXES = getAllVolatilitySymbols();
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let ws: WebSocket | null = null;
let started = false;
let subscribedSymbolsOnServer = new Set<string>();
// Feed integrity tracking. Bots/strategies should pause when feed is stale or out of order.
const lastTickEpoch: Record<string, number> = {};
let lastAnyTickEpoch = 0;
let feedStale = false;
// Hysteresis: need 10 consecutive seconds of healthy ticks to recover from stale
let consecutiveHealthySeconds = 0;
const STALE_THRESHOLD_SECONDS = 30;
const RECOVERY_REQUIRED_SECONDS = 10;
// In-memory tick buffer: symbol -> latest 500 ticks (for strategy evaluation)
const tickBuffer = new Map<string, { price: number; epoch: number; lastDigit: number }[]>();
const MAX_TICKS_PER_SYMBOL = 500;
export function getRecentTicks(symbol: string, count: number = 100): { price: number; epoch: number; lastDigit: number }[] {
  const buf = tickBuffer.get(symbol);
  if (!buf) return [];
  return buf.slice(-count);
}
export function isFeedStale(): boolean {
  return feedStale;
}
export function getFeedHealth(): { stale: boolean; lastTickEpoch: number; consecutiveHealthySeconds: number } {
  return { stale: feedStale, lastTickEpoch: lastAnyTickEpoch, consecutiveHealthySeconds };
}
let msgId = 1;
let reconnectAttempts = 0;
let isIntentionallyStopped = false;
let watchdog: ReturnType<typeof setInterval> | null = null;

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

export function stopTickCollector() {
  isIntentionallyStopped = true;
  reconnectAttempts = 0;
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  started = false;
}

export function startTickCollector() {
  if (started) return;
  started = true;
  // Watchdog: feedStale is only updated inside the message handler. If the WS
  // dies silently (or reconnect gives up) no message ever arrives, so without
  // this timer feedStale would stay false and bots would trade on hours-old data.
  if (!watchdog) {
    watchdog = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      if (lastAnyTickEpoch > 0 && nowSec - lastAnyTickEpoch > STALE_THRESHOLD_SECONDS) {
        if (!feedStale) {
          console.warn(`[tickCollector] No ticks for ${nowSec - lastAnyTickEpoch}s — marking feed STALE`);
        }
        feedStale = true;
        consecutiveHealthySeconds = 0;
      }
    }, 5000);
  }
  try {
    ws = new WebSocket(DERIV_WS_PUBLIC);
    ws.on("open", async () => {
      console.log("[tickCollector] connected");
      reconnectAttempts = 0; // Reset on successful connection
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
        const lastDigit = lastDigitOf(Number(quote), decimals);
        const prev = lastTickEpoch[symbol] || 0;
        const outOfOrder = prev && epoch < prev;
        const nowSec = Math.floor(Date.now() / 1000);
        const gap = nowSec - lastAnyTickEpoch;
        if (gap > STALE_THRESHOLD_SECONDS) {
          feedStale = true;
          consecutiveHealthySeconds = 0;
        } else {
          consecutiveHealthySeconds++;
          if (consecutiveHealthySeconds >= RECOVERY_REQUIRED_SECONDS) {
            feedStale = false;
          }
        }
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
      console.log("[tickCollector] closed, scheduling reconnect");
      ws = null;
      subscribedSymbolsOnServer.clear();
      started = false; // allow reconnection
      
      if (isIntentionallyStopped) return;
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[tickCollector] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping.`);
        feedStale = true;
        consecutiveHealthySeconds = 0;
        return;
      }
      
      reconnectAttempts++;
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) + Math.random() * 1000,
        MAX_RECONNECT_DELAY
      );
      
      console.log(`[tickCollector] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay)}ms`);
      
      setTimeout(() => {
        // Do NOT reset reconnectAttempts here — reset happens in the on("open")
        // handler only after a real connection succeeds, so a flapping feed
        // actually reaches MAX_RECONNECT_ATTEMPTS and stops hammering the API.
        consecutiveHealthySeconds = 0; // Reset hysteresis counter
        startTickCollector();
      }, delay);
    });
  } catch (e) {
    console.warn("[tickCollector] failed to start:", e);
  }
}
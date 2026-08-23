import { WebSocket } from "ws";
import { saveTickHistoryBatch } from "./db";
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
// Batch DB writes: accumulate ticks and flush every 2 seconds instead of
// writing each tick individually. This reduces DB connection pressure and
// eliminates the untracked promise accumulation that caused OOM on Render.
const pendingDbWrites: { symbol: string; price: string; lastDigit: number; epoch: number }[] = [];
let dbFlushTimer: ReturnType<typeof setInterval> | null = null;
const DB_FLUSH_INTERVAL_MS = 2000;
const MAX_DB_BATCH = 200;

function flushDbWrites() {
  if (!pendingDbWrites.length) return;
  const batch = pendingDbWrites.splice(0, MAX_DB_BATCH);
  // Fire-and-forget the batch — if it fails we lose 2s of ticks, which is
  // acceptable for a free-tier deployment. Individual tick errors are logged
  // inside saveTickHistoryBatch.
  saveTickHistoryBatch(batch).catch(() => {});
}

// Market-open tracking: populated from Deriv's `exchange_is_open` field on every
// reconnect. Synthetic indices are always open; real markets (forex, crypto, etc.)
// have trading hours.
const symbolMarketStatus = new Map<string, { market: string; exchangeIsOpen: boolean; lastChecked: number }>();
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

/**
 * Check whether a symbol's market is currently open for trading.
 * Returns `true` (open) for symbols not in the map — synthetic indices are
 * always open and may not appear in the market-status map.
 */
export function isMarketOpen(symbol: string): boolean {
  return symbolMarketStatus.get(symbol)?.exchangeIsOpen ?? true;
}

/**
 * Check whether the most recent tick for a symbol is fresh enough to trade on.
 * If the market is closed, returns `false` explicitly — a closed market has no
 * "fresh" data by definition, and callers need to distinguish "closed" from
 * "open but feed problem."
 */
export function isSymbolDataFresh(symbol: string, maxAgeSeconds: number = 60): boolean {
  if (!isMarketOpen(symbol)) return false;
  const epoch = lastTickEpoch[symbol];
  if (!epoch) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - epoch <= maxAgeSeconds;
}

/** Get market status for a symbol (for UI display). */
export function getSymbolMarketStatus(symbol: string): { market: string; exchangeIsOpen: boolean } | undefined {
  return symbolMarketStatus.get(symbol);
}
let msgId = 1;
let reconnectAttempts = 0;
let isIntentionallyStopped = false;
let watchdog: ReturnType<typeof setInterval> | null = null;

// Markets to subscribe to: volatility/boom/crash (always) + real markets from
// Deriv (forex, commodities, crypto, stock indices). The exact market strings
// come from Deriv's `active_symbols` response — verify against a live response
// before changing these values.
const ALLOWED_MARKETS = new Set(["forex", "commodities", "cryptocurrency", "stock_indices"]);

async function fetchActiveSymbols(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!ws) return resolve([]);
    const reqId = msgId++;
    const handler = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.req_id !== reqId) return;
        ws!.removeListener("message", handler);
        const raw = msg.active_symbols || [];
        if (!raw.length) {
          console.warn("[tickCollector] active_symbols response empty");
          resolve([]);
          return;
        }
        // Deriv may use different field names for the symbol across response
        // types. Try the common ones (same logic as the client-side parser).
        const sample = raw[0];
        const symField = ["underlying_symbol", "symbol", "name", "id", "code", "underlying", "ticker"].find((f) => f in sample) || "symbol";
        const mktField = ["market", "market_name", "sector", "group"].find((f) => f in sample) || "market";
        console.log(`[tickCollector] active_symbols: ${raw.length} total, sample fields: ${Object.keys(sample).join(", ")}, using symField=${symField}`);
        const now = Date.now();
        const syms: string[] = [];
        for (const s of raw) {
          const sym = String(s[symField] || "").trim();
          if (!sym) continue;
          const market = String(s[mktField] || "").trim();
          const exchangeIsOpen = s.exchange_is_open === 1 || s.exchange_is_open === true;
          symbolMarketStatus.set(sym, { market, exchangeIsOpen, lastChecked: now });
          // Subscribe to: volatility/boom/crash indices (always open) + real markets
          const isVolatility = VOLATILITY_PREFIXES.some((p) => sym === p || sym.startsWith(p + "_"));
          const isBoomCrash = sym.startsWith("BOOM") || sym.startsWith("CRASH");
          const isRealMarket = ALLOWED_MARKETS.has(market);
          if (isVolatility || isBoomCrash || (isRealMarket && exchangeIsOpen)) {
            syms.push(sym);
          }
        }
        console.log(`[tickCollector] subscribing to ${syms.length} symbols (markets: ${[...new Set(syms.map(s => symbolMarketStatus.get(s)?.market))].join(", ") || "none"})`);
        resolve(syms);
      } catch (e) {
        console.error("[tickCollector] fetchActiveSymbols parse error", e);
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
  if (dbFlushTimer) {
    clearInterval(dbFlushTimer);
    dbFlushTimer = null;
  }
  // Flush any remaining pending writes before closing
  flushDbWrites();
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
      // Self-heal: if the feed has been stale for 2+ minutes and the websocket is
      // dead (null or closed), reset reconnect attempts and restart the collector.
      // This covers the case where MAX_RECONNECT_ATTEMPTS was exhausted — without
      // this, the feed stays dead until the process is manually restarted.
      if (feedStale && nowSec - lastAnyTickEpoch > 120 && (!ws || ws.readyState >= 2)) {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.warn("[tickCollector] Feed stale 2+ min with dead socket — resetting reconnect counter and restarting");
          reconnectAttempts = 0;
          started = false;
          startTickCollector();
        }
      }
    }, 5000);
  }
  try {
    ws = new WebSocket(DERIV_WS_PUBLIC);
    // Start DB flush timer for batched tick writes
    if (!dbFlushTimer) {
      dbFlushTimer = setInterval(flushDbWrites, DB_FLUSH_INTERVAL_MS);
    }
    ws.on("open", async () => {
      console.log("[tickCollector] connected");
      reconnectAttempts = 0; // Reset on successful connection
      const symbols = await fetchActiveSymbols();
      console.log(`[tickCollector] subscribing to ${symbols.length} symbols`);
      // Throttle subscribes: Deriv rate-limits requests per second. Batching
      // 15 symbols with 100ms gaps keeps us well under the limit even with
      // 150+ symbols (15 × 100ms = 1.5s total, ~10 req/s per batch).
      const BATCH_SIZE = 15;
      const BATCH_DELAY_MS = 100;
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        batch.forEach(subscribeSymbol);
        if (i + BATCH_SIZE < symbols.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    });
    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        // Log Deriv error responses (rate-limit, auth, subscribe failures)
        // instead of silently discarding them — these were invisible before
        // and made rate-limit issues impossible to diagnose.
        if (msg.error) {
          // MarketIsClosed is expected on weekends/holidays — not an error.
          if (msg.error.code === "MarketIsClosed") return;
          console.error("[tickCollector] Deriv error:", JSON.stringify(msg.error));
          return;
        }
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
        // Batch for DB flush instead of fire-and-forget individual inserts.
        pendingDbWrites.push({ symbol, price: quote, lastDigit, epoch });
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
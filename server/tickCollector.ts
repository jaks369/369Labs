import { WebSocket } from "ws";
import { saveTickHistory } from "./db";

const DERIV_APP_ID = Number(process.env.VITE_DERIV_APP_ID) || 1089;
const VOLATILITY_PREFIXES = ["R_10", "R_25", "R_50", "R_75", "R_100", "R_150", "R_200"];

let ws: WebSocket | null = null;
let started = false;
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
    ws.send(JSON.stringify({ active_symbols: "full", product_type: "all", req_id: reqId }));
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
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
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
        // last digit = last numeric char of the quoted price
        const digits = quote.replace(/[^0-9]/g, "");
        const lastDigit = digits.length ? parseInt(digits[digits.length - 1], 10) : 0;
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

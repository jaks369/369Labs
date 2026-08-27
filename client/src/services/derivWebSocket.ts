import { buildLimitOrder } from "@shared/slTp";
import { broadcastTabMessage, onTabMessage } from "@/lib/tabSync";

export interface Tick {
  symbol: string;
  price: number;
  timestamp: number;
  bid?: number;
  ask?: number;
}
export interface TickStreamListener {
  onTick: (tick: Tick) => void;
  onError?: (error: Error, symbol?: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}
export type DerivContractType = "CALL" | "PUT" | "DIGITEVEN" | "DIGITODD" | "DIGITOVER" | "DIGITUNDER" | "DIGITMATCH" | "DIGITDIFF" | "ACCU";

export interface PurchaseParams {
  symbol: string;
  contractType: DerivContractType;
  amount: number;
  duration?: number;
  durationUnit?: "t" | "s" | "m" | "h" | "d";
  barrier?: number;
  growthRate?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface PurchaseResult {
  contractId: number;
  buyPrice: number;
  longcode: string;
  balanceAfter: number;
  entryTick?: number;
  entrySpot?: number;
  entryTime?: number;
}
export interface ClientPortfolioContract {
  contractId: number;
  contractType: string;
  symbol: string;
  stake: number;
  entryPrice: number;
  purchasedAt: number | null;
  isSold: boolean;
  profit: number;
  soldAt: number | null;
}
export interface ContractUpdate {
  contract_id: number;
  is_sold: 0 | 1;
  profit: number;
  buy_price: number;
  sell_price?: number;
  status: "open" | "won" | "lost" | string;
  entry_tick?: number;
  exit_tick?: number;
}
export interface DerivSymbol {
  symbol: string;
  displayName: string;
  market: string;
  submarket: string;
  decimalPlaces?: number;
  exchangeIsOpen?: boolean;
}

const DERIV_APP_ID = (import.meta as any).env?.VITE_DERIV_APP_ID || "33V0MWtYaZLLmAZBWUycN";
const DERIV_API_BASE = "https://api.derivws.com";
const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";
// Trading happens ONLY on the OTP-authenticated socket (this.ws). The legacy
// v3 host rejects the alphanumeric Build Client ID, so we never open a
// secondary authorized socket with a hardcoded app_id.
// If no tick has arrived for this long while symbols are subscribed, the live
// feed is considered stale/frozen even if the socket itself is still open.
const FEED_STALE_MS = 15000;

class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<TickStreamListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 8;
  private baseReconnectDelay = 800;
  private msgId = 1;
  public apiToken: string | null = null;
  private authorized = false;
  private cachedOtpUrl: string | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private backgroundSymbols: Set<string> = new Set();
  private tickBuffer: Map<string, Tick[]> = new Map();
  private lastTickAt = 0;
  private pendingSubscriptionSymbols: string[] = [];
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private contractListeners: Map<number, (c: ContractUpdate) => void> = new Map();
  private contractSettledListeners: Set<(contractId: number, update: ContractUpdate, meta: any) => void> = new Set();
  private subSymbolById: Map<number, string> = new Map();
  private subRefCount: Map<string, number> = new Map();
  private subErrors: Map<string, string> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private intentionallyDisconnected = false;
  private lastBalance: any = null;
  private lastAccountType: string = "";
  private accountId: string = "";
  private accountCurrency: string = "USD";
  private apiMode: "v1" | "v3" = "v3";
  private balanceListeners: Set<(b: any) => void> = new Set();
  private _activeSymbols: DerivSymbol[] = [];
  private symbolListeners: Set<(symbols: DerivSymbol[]) => void> = new Set();
  private tokenListeners: Set<(msg: string) => void> = new Set();
  private otpInProgress = false;

  constructor() {
    try {
      this.apiToken = localStorage.getItem("deriv_token");
    } catch {}
    if (this.apiToken) {
      this.connectWithOtp(this.apiToken).catch(() => this.connectPublic());
    } else {
      this.connectPublic();
    }
  }

  private friendlyError(msg: string, status?: number): string {
    const lower = msg.toLowerCase();
    if (status === 502 || status === 503 || status === 504) {
      return "Server is starting up. Retrying automatically…";
    }
    if (status === 429) {
      return "Too many requests. Wait a moment and try again.";
    }
    if (status === 401 || lower.includes("invalidtoken") || lower.includes("invalid token")) {
      return "Your Deriv API token is invalid or has expired. Generate a new token at app.deriv.com/account/api-token and update it in Settings.";
    }
    if (status === 403 || lower.includes("forbidden") || lower.includes("permission")) {
      return "This API token lacks required permissions. Create a token with 'Trade' and 'Read' scopes at app.deriv.com/account/api-token.";
    }
    if (lower.includes("no trading accounts") || lower.includes("no accounts")) {
      return "No Deriv trading accounts found. Open a demo account at app.deriv.com first, then try again.";
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused") || lower.includes("enotfound")) {
      return "Cannot reach Deriv servers. Check your internet connection or try again later.";
    }
    if (lower.includes("timeout")) {
      return "Deriv server did not respond in time. Check your connection and try again.";
    }
    if (!msg) return "Server is waking up. Please wait a moment and try again.";
    return msg;
  }

  private async fetchAccounts(): Promise<any[]> {
    const url = `/api/deriv/accounts`;
    console.log("[Deriv OTP] GET", url);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });
    const body = await res.text();
    console.log("[Deriv OTP] response", res.status, body);
    if (!res.ok) {
      throw new Error(this.friendlyError(body, res.status));
    }
    let json: any;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(this.friendlyError(`Accounts: invalid JSON: ${body}`));
    }
    const accounts = json.data || json.accounts || [];
    if (!accounts.length) console.warn("[Deriv OTP] No accounts found in:", json);
    return accounts;
  }

  private async fetchOtpUrl(accountId: string): Promise<{ url: string; accountType: string }> {
    const url = `/api/deriv/otp/${accountId}`;
    console.log("[Deriv OTP] POST", url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });
    const body = await res.text();
    console.log("[Deriv OTP] response", res.status, body);
    if (!res.ok) {
      throw new Error(this.friendlyError(body, res.status));
    }
    let json: any;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(this.friendlyError(`OTP: invalid JSON: ${body}`));
    }
    const wsUrl: string = json.data?.url || json.url;
    if (!wsUrl) throw new Error(this.friendlyError(`OTP response missing url: ${body}`));
    const accountType = wsUrl.includes("/real") ? "real" : "demo";
    return { url: wsUrl, accountType };
  }

  private connectPublic() {
    this.disconnect();
    this.authorized = false;
    this.connectWs(DERIV_WS_PUBLIC, false);
  }

  private connectWs(url: string, authenticated: boolean) {
    this.intentionallyDisconnected = false;
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        console.log(`[Deriv WS] Connected (${authenticated ? "authenticated" : "public"})`);
        this.reconnectAttempts = 0;
        this.subErrors.clear();
        this.processPendingSubscriptions();
        this.resubscribeAllTicks();
        this.startKeepAlive(this.ws!, "main");
        if (authenticated) {
          this.authorized = true;
          this.notifyConnect();
          this.fetchBalance();
          this.fetchActiveSymbols();
          setTimeout(() => this.resubscribeToContracts(), 500);
        } else {
          this.authorized = false;
          this.notifyConnect();
          this.fetchActiveSymbols();
        }
      };
      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(event.data));
        } catch (error) {
          console.error("[Deriv WS] Parse error:", error);
        }
      };
      this.ws.onerror = (event) => {
        // Browser WebSocket errors carry no status text, but the underlying
        // CloseEvent (code/reason) arrives on `close` and tells us WHY Deriv
        // rejected the handshake (e.g. 1006 abnormal, 4001 auth, 4408 timeout).
        const err = event as Event & { message?: string; error?: Error };
        console.warn("[Deriv WS] Connection error", {
          message: err?.message || (err?.error?.message ?? ""),
        });
      };
      this.ws.onclose = (event) => {
        console.log(
          `[Deriv WS] Disconnected (code=${event.code}, reason=${JSON.stringify(event.reason)}, wasClean=${event.wasClean})`
        );
        this.authorized = false;
        // Keep subscribedSymbols/pendingSubscriptionSymbols intact so the
        // reconnect's onopen can restore live tick feeds (charts/bots would
        // otherwise go permanently dark after a drop).
        this.retryTimers.forEach((t) => clearTimeout(t));
        this.retryTimers.clear();
        this.notifyDisconnect();
        if (!this.intentionallyDisconnected) this.attemptReconnect();
      };
    } catch (error) {
      console.error("[Deriv WS] Setup failed:", error);
    }
  }

  private handleMessage(data: any) {
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      if (data.error) pending.reject(new Error(data.error.message || "Deriv API error"));
      else pending.resolve(data);
      // The message was a response to an explicit request (proposal, buy,
      // balance, etc). Do NOT fall through to the generic error fan-out below:
      // that would broadcast a failed trade/proposal as a "connection error"
      // and stop every live chart.
      return;
    }
    if (data.tick) {
      this.notifyTick({
        symbol: data.tick.symbol || "UNKNOWN",
        price: data.tick.quote || 0,
        timestamp: (data.tick.epoch || Date.now() / 1000) * 1000,
        bid: data.tick.bid,
        ask: data.tick.ask,
      });
    }
    if (data.proposal_open_contract) {
      const c = data.proposal_open_contract;
      const isSold = c.is_sold === 1 || c.status === "sold" || c.status === "won" || c.status === "lost" || c.status === "expired";
      const cb = this.contractListeners.get(c.contract_id);
      cb?.({
        contract_id: c.contract_id,
        is_sold: isSold ? 1 : 0,
        profit: c.profit,
        buy_price: c.buy_price,
        sell_price: c.sell_price,
        status: c.status,
        entry_tick: c.entry_tick,
        exit_tick: c.exit_tick,
      });
      if (isSold) {
        this.contractListeners.delete(c.contract_id);
        this.clearContractMeta(c.contract_id);
      }
    }
    if (data.msg_type === "balance") {
      this.lastBalance = data.balance;
      const arr = Array.isArray(data.balance) ? data.balance : [data.balance];
      const cur = arr[0]?.currency || data.balance?.currency;
      if (typeof cur === "string" && cur) this.accountCurrency = cur.toUpperCase();
      const at = arr[0]?.account_type || data.account_type || "";
      this.lastAccountType = typeof at === "string" ? at.toLowerCase() : "";
      this.notifyBalance(data.balance);
      return;
    }
    if (data.msg_type === "active_symbols") {
      const raw = data.active_symbols || data.data || [];
      if (!raw.length) {
        console.warn("[Deriv WS] active_symbols empty", JSON.stringify(data).slice(0, 400));
        return;
      }
      const first = raw[0];
      const keys = Object.keys(first);
      console.log("[Deriv WS] active_symbols sample keys:", keys.join(", "), "sample:", JSON.stringify(first).slice(0, 200));
      const guessField = (...names: string[]): string => names.find((n) => n in first) || "";
      const symField = guessField("underlying_symbol", "symbol", "name", "id", "key", "code", "underlying", "ticker");
      const dispField = guessField(
        "underlying_symbol_name",
        "display_name",
        "displayName",
        "description",
        "name",
        "symbol_description",
        "long_name",
        "full_name",
        "label",
        "title",
      );
      const mktField = guessField("market", "market_name", "market_display_name", "sector", "group", "asset_class");
      const smktField = guessField("submarket", "submarket_name", "sub_sector", "subgroup", "sub_market");
      const pipField = guessField("pip", "pip_size", "pip_display", "display_digits", "decimal_places", "fractional_digits", "digits");
      let symbols: DerivSymbol[] = raw
        .map((s: any) => {
          const sym = String(s[symField] || s.name || s.id || s.code || s.underlying || s.ticker || "").trim();
          const display = String(s[dispField] || s.display_name || s.displayName || s.description || s.name || s.long_name || s.label || s.title || sym).trim();
          return {
            symbol: sym,
            displayName: display,
            market: String(s[mktField] || s.market || "").trim(),
            submarket: String(s[smktField] || "").trim(),
            decimalPlaces: (() => {
              const pip = s[pipField] ?? s.pip ?? s.pip_size ?? s.display_digits;
              const countDecimals = (v: any): number => {
                const str = typeof v === "number" ? v.toString() : String(v || "");
                const parts = str.split(".");
                return parts[1] ? parts[1].replace(/0+$/, "").length || parts[1].length : 0;
              };
              if (typeof pip === "number" || typeof pip === "string") return countDecimals(pip);
              return 3;
            })(),
            exchangeIsOpen: s.exchange_is_open === 1 || s.exchange_is_open === true,
          };
        })
        .filter((s: any) => s.symbol && s.displayName);
      if (!symbols.length) {
        console.warn("[Deriv WS] active_symbols all filtered out, using defaults");
        symbols = [
          { symbol: "R_10", displayName: "Volatility 10 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "R_25", displayName: "Volatility 25 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "R_50", displayName: "Volatility 50 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 4, exchangeIsOpen: true },
          { symbol: "R_75", displayName: "Volatility 75 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 4, exchangeIsOpen: true },
          { symbol: "R_100", displayName: "Volatility 100 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "R_150", displayName: "Volatility 150 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "R_200", displayName: "Volatility 200 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 2, exchangeIsOpen: true },
          { symbol: "1HZ15V", displayName: "Volatility 15 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "1HZ30V", displayName: "Volatility 30 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "1HZ90V", displayName: "Volatility 90 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "BOOM300", displayName: "Boom 300 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "BOOM500", displayName: "Boom 500 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "BOOM1000", displayName: "Boom 1000 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "CRASH300", displayName: "Crash 300 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "CRASH500", displayName: "Crash 500 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
          { symbol: "CRASH1000", displayName: "Crash 1000 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3, exchangeIsOpen: true },
        ];
      }
      console.log("[Deriv WS] active_symbols loaded:", symbols.length);
      this._activeSymbols = symbols;
      this.symbolListeners.forEach((cb) => {
        try {
          cb(symbols);
        } catch {}
      });
      this.processPendingSubscriptions();
      return;
    }
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      if (!msg.includes("subscribe")) console.error("[Deriv WS] API Error:", msg);
      const isTokenError = /token|authoriz|session/i.test(msg);
      if (isTokenError) {
        // Mid-session auth failures (expired/invalidated token) must reach the
        // token-error listeners — the status pill and re-auth prompts listen
        // there, not on tick errors. Previously this only notified tick
        // listeners, so the UI showed "connected" while every trade failed.
        this.notifyTokenError(msg);
        return;
      }
      const reqId = data.req_id;
      const sym = reqId ? this.subSymbolById.get(reqId) : null;
      if (sym) {
        this.subErrors.set(sym, msg);
        this.subscribedSymbols.delete(sym);
        if (this.authorized && msg.includes("Input validation")) {
          if (!this.pendingSubscriptionSymbols.includes(sym)) {
            this.pendingSubscriptionSymbols.push(sym);
          }
          this.processPendingSubscriptions();
        }
        this.listeners.forEach((l) => {
          try {
            l.onError?.(new Error(msg), sym);
          } catch {}
        });
      } else if (data.msg_type === "proposal_open_contract") {
        console.warn("[Deriv WS] Contract subscription error:", msg);
      } else {
        this.notifyError(new Error(msg));
      }
    }
  }

  private fetchActiveSymbols() {
    if (!this.ws) return;
    const msg = { active_symbols: "full", req_id: this.msgId++ };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (error) {
      console.error("[Deriv WS] Failed to fetch active symbols:", error);
    }
  }

  private keepAliveTimers: ReturnType<typeof setInterval>[] = [];

  private startKeepAlive(socket: WebSocket | null, label: string) {
    if (!socket || typeof socket.addEventListener !== "function") return;
    try {
      socket.send(JSON.stringify({ ping: 1, req_id: this.msgId++ }));
    } catch {}
    const timer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        clearInterval(timer);
        return;
      }
      try {
        socket.send(JSON.stringify({ ping: 1, req_id: this.msgId++ }));
      } catch {}
    }, 15000);
    this.keepAliveTimers.push(timer);
    socket.addEventListener("close", () => clearInterval(timer));
  }

  private resubscribeAllTicks() {
    const target = this.wsForTicks();
    if (!target || target.readyState !== WebSocket.OPEN) return;
    for (const symbol of this.subscribedSymbols) {
      try {
        target.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: this.msgId++ }));
      } catch (error) {
        console.error("[Deriv WS] Failed to re-subscribe:", error);
      }
    }
  }

  private processPendingSubscriptions() {
    const pending = [...this.pendingSubscriptionSymbols];
    this.pendingSubscriptionSymbols = [];
    if (pending.length === 0) return;
    for (const symbol of pending) {
      if (!symbol || typeof symbol !== "string") continue;
      try {
        const target = this.ws;
        target?.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: this.msgId++ }));
      } catch (error) {
        console.error("[Deriv WS] Failed to subscribe:", error);
      }
    }
  }

  public fetchBalance() {
    if (!this.ws) return;
    try {
      // subscribe:1 turns the one-shot read into a live stream so balance
      // updates from ANY source (this tab, another device, open contracts
      // settling) push immediately instead of drifting stale.
      this.ws.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: this.msgId++ }));
    } catch (error) {
      console.error("[Deriv WS] Failed to fetch balance:", error);
    }
  }

  /**
   * Live payout quote straight from Deriv. Deriv's payout is not a flat
   * stake * 1.95 — it depends on the symbol, contract type, direction and
   * barrier digit. This sends a real `proposal` and returns the payout,
   * ask price and current spot so the UI reflects what Deriv would actually
   * pay for the exact selection.
   */
  public async getPayoutQuote(params: {
    symbol: string;
    contractType: DerivContractType;
    amount: number;
    duration?: number;
    durationUnit?: "t" | "s" | "m" | "h" | "d";
    growthRate?: number;
    barrier?: number | string;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<{ payout: number; askPrice: number; spot: number } | null> {
    if (!this.authorized || this.apiMode !== "v1" || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected or authorized yet");
    }
    const contractParams: Record<string, any> = {
      amount: params.amount,
      basis: "stake",
      contract_type: params.contractType,
      currency: this.accountCurrency,
      underlying_symbol: params.symbol,
      ...(params.growthRate !== undefined ? { growth_rate: params.growthRate } : { duration: params.duration, duration_unit: params.durationUnit || "t" }),
      ...(params.barrier !== undefined ? { barrier: String(params.barrier) } : {}),
      ...buildLimitOrder(params.contractType, params.stopLoss, params.takeProfit),
    };
    try {
      const res = await this.sendRequest({ proposal: 1, ...contractParams }, 8000);
      const p = res?.proposal;
      const err = res?.error;
      if (err && err.message) {
        console.warn("[Deriv WS] payout proposal error ->", err.message);
        throw new Error(err.message);
      }
      if (!p?.id) {
        const raw = JSON.stringify(res).slice(0, 300);
        console.warn("[Deriv WS] payout proposal ->", raw);
        throw new Error("Proposal rejected: " + raw);
      }
      return {
        payout: Number(p.payout ?? 0),
        askPrice: Number(p.ask_price ?? 0),
        spot: Number(p.spot ?? 0),
      };
    } catch (e: any) {
      console.warn("[Deriv WS] payout quote error:", e?.message || e);
      throw e;
    }
  }

  public async fetchTickHistory(symbol: string, start: number, end: number): Promise<Tick[]> {
    let payload: Record<string, any> = { start, end, style: "ticks", adjust_start_time: 1 };
    for (const field of ["ticks_history", "ticks", "tick_history", "symbol"]) {
      payload[field] = symbol;
      const res = await this.sendRequest({ ...payload }, 30000).catch(() => null);
      if (res?.history?.times || res?.ticks_history?.history) {
        const history = res.history || res.ticks_history.history;
        if (!history?.times || !history?.prices) break;
        const ticks: Tick[] = [];
        for (let i = 0; i < history.times.length; i++) {
          ticks.push({ symbol, price: Number(history.prices[i]), timestamp: history.times[i] * 1000 });
        }
        return ticks;
      }
      if (res?.error?.message?.includes("Properties not allowed") || res?.error?.message?.includes("not allow")) continue;
      if (res && !res.error) break;
    }
    return [];
  }

  private sendRequest(payload: Record<string, any>, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const reqId = this.msgId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("Deriv API request timed out"));
      }, timeoutMs);
      this.pendingRequests.set(reqId, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Pull the account's real portfolio (open + recently sold contracts) over the
   * browser's own authorized socket. Used for client-driven reconciliation: the
   * server-side Deriv connection can be down (OTP handshake) while this socket —
   * the one that places trades — is still authorized, so recovering unrecorded
   * contracts must not depend on the server connection.
   */
  public async fetchPortfolio(): Promise<ClientPortfolioContract[]> {
    if (!this.authorized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected or authorized yet");
    }
    const res = await this.sendRequest({ portfolio: 1 }, 15000);
    if (res?.error) throw new Error(res.error.message);
    const contracts: any[] = res?.portfolio?.contracts || [];
    return contracts.map((c: any) => ({
      contractId: Number(c.contract_id),
      contractType: String(c.contract_type ?? ""),
      symbol: String(c.underlying ?? ""),
      stake: Number(c.buy_price) || 0,
      entryPrice: Number(c.entry_tick) || 0,
      purchasedAt: c.purchase_time != null ? Number(c.purchase_time) : null,
      isSold: Number(c.is_sold) === 1,
      profit: Number(c.profit) || 0,
      soldAt: c.selling_time != null ? Number(c.selling_time) : null,
    }));
  }

  public async purchaseContract(params: PurchaseParams): Promise<PurchaseResult> {
    if (!this.authorized) throw new Error("Not authorized");
    if (this.apiMode === "v1") {
      // The OTP-authenticated socket is the only valid trading path for this
      // Build app. Send the standard v3-style proposal/buy messages directly on
      // it (the legacy v3 host rejects the alphanumeric Build Client ID, so we
      // never open a secondary authorized socket anymore). Any API error (bad
      // symbol, expired OTP session, insufficient balance, …) is surfaced to
      // the caller verbatim instead of being masked by a blind v3 fallback.
      const contractParams: Record<string, any> = {
        amount: params.amount,
        basis: "stake",
        contract_type: params.contractType,
        currency: this.accountCurrency,
        underlying_symbol: params.symbol,
        ...(params.growthRate !== undefined ? { growth_rate: params.growthRate } : { duration: params.duration, duration_unit: params.durationUnit || "t" }),
        ...(params.barrier !== undefined ? { barrier: String(params.barrier) } : {}),
        ...buildLimitOrder(params.contractType, params.stopLoss, params.takeProfit),
      };
      let lastErr: string | null = null;
      for (const format of [
        { proposal: 1, ...contractParams },
        { proposal: 1, contract: contractParams },
        { proposal: 1, parameters: contractParams },
      ]) {
        try {
          const proposalRes = await this.sendRequest(format, 15000);
          if (!proposalRes?.proposal) {
            lastErr = `No proposal returned: ${JSON.stringify(proposalRes).slice(0, 200)}`;
            continue;
          }
          const buyRes = await this.sendRequest({ buy: proposalRes.proposal.id, price: proposalRes.proposal.ask_price });
          if (!buyRes?.buy) {
            lastErr = `Buy rejected: ${JSON.stringify(buyRes).slice(0, 200)}`;
            continue;
          }
          const b = buyRes.buy.balance_after ?? (this.lastBalance?.balance ?? 0) - params.amount;
          this.lastBalance = { ...(this.lastBalance || {}), balance: b };
          this.notifyBalance(this.lastBalance);
          const entrySpot = Number(proposalRes.proposal.spot ?? 0);
          return {
            contractId: buyRes.buy.contract_id,
            buyPrice: buyRes.buy.buy_price,
            longcode: buyRes.buy.longcode,
            balanceAfter: b,
            entrySpot: entrySpot > 0 ? entrySpot : undefined,
            entryTime: Date.now(),
          };
        } catch (e: any) {
          lastErr = e?.message || String(e);
        }
      }
      throw new Error(lastErr || "All trading methods failed");
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");
    let proposalPayload: Record<string, any> = { proposal: 1, amount: params.amount, basis: "stake", contract_type: params.contractType, currency: this.accountCurrency };
    if (params.growthRate !== undefined) proposalPayload.growth_rate = params.growthRate;
    else {
      proposalPayload.duration = params.duration;
      proposalPayload.duration_unit = params.durationUnit || "t";
    }
    if (params.barrier !== undefined) proposalPayload.barrier = String(params.barrier);
    const limitOrder = buildLimitOrder(params.contractType, params.stopLoss, params.takeProfit);
    if (limitOrder.limit_order) proposalPayload.limit_order = limitOrder.limit_order;
    let lastError: Error | null = null;
    for (const symField of ["symbol", "underlying", "underlying_symbol"]) {
      try {
        proposalPayload[symField] = params.symbol;
        const proposalRes = await this.sendRequest({ ...proposalPayload });
        if (proposalRes.proposal) {
          const buyRes = await this.sendRequest({ buy: proposalRes.proposal.id, price: proposalRes.proposal.ask_price });
          if (!buyRes.buy) throw new Error("Buy request failed");
          const b = buyRes.buy.balance_after ?? (this.lastBalance?.balance ?? 0) - params.amount;
          this.lastBalance = { ...(this.lastBalance || {}), balance: b };
          this.notifyBalance(this.lastBalance);
          const entrySpot = Number(proposalRes.proposal.spot ?? 0);
          return {
            contractId: buyRes.buy.contract_id,
            buyPrice: buyRes.buy.buy_price,
            longcode: buyRes.buy.longcode,
            balanceAfter: b,
            entrySpot: entrySpot > 0 ? entrySpot : undefined,
            entryTime: Date.now(),
          };
        }
        lastError = new Error("No proposal returned: " + JSON.stringify(proposalRes).slice(0, 200));
      } catch (e: any) {
        lastError = e;
      }
    }
    throw new Error("Trade failed: symbol field not accepted by Deriv API");
  }

  public subscribeToContract(contractId: number, onUpdate: (c: ContractUpdate) => void): void {
    this.contractListeners.set(contractId, onUpdate);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: this.msgId++ }));
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe to contract:", error);
    }
  }

  public onContractSettled(cb: (contractId: number, update: ContractUpdate, meta: any) => void): void {
    this.contractSettledListeners.add(cb);
  }
  public removeContractSettledListener(cb: (contractId: number, update: ContractUpdate, meta: any) => void): void {
    this.contractSettledListeners.delete(cb);
  }

  public resubscribeToContracts(): void {
    const ids = Array.from(this.contractListeners.keys());
    for (const contractId of ids) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: this.msgId++ }));
      } catch (error) {
        console.error("[Deriv WS] Failed to re-subscribe to contract:", error);
      }
    }
  }

  // Persist contract metadata to localStorage so settlement callbacks can
  // be reconstituted after a page refresh.
  private contractMeta = new Map<number, { stake: string; entryPrice: string; entryTime: string; symbol: string; contractType: string }>();

  public registerContractMeta(contractId: number, meta: { stake: string; entryPrice: string; entryTime: string; symbol: string; contractType: string }): void {
    this.contractMeta.set(contractId, meta);
    try {
      const key = "pendingTrade_" + contractId;
      localStorage.setItem(key, JSON.stringify(meta));
    } catch {}
  }

  public getContractMeta(contractId: number): { stake: string; entryPrice: string; entryTime: string; symbol: string; contractType: string } | undefined {
    if (this.contractMeta.has(contractId)) return this.contractMeta.get(contractId);
    try {
      const key = "pendingTrade_" + contractId;
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const meta = JSON.parse(raw);
      this.contractMeta.set(contractId, meta);
      return meta;
    } catch {
      return undefined;
    }
  }

  public clearContractMeta(contractId: number): void {
    this.contractMeta.delete(contractId);
    try {
      const key = "pendingTrade_" + contractId;
      localStorage.removeItem(key);
    } catch {}
  }

  public restorePendingContractsFromLocalStorage(): number[] {
    const restored: number[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("pendingTrade_")) {
          const contractId = parseInt(key.replace("pendingTrade_", ""));
          if (!isNaN(contractId) && !this.contractListeners.has(contractId)) {
            restored.push(contractId);
            const meta = this.getContractMeta(contractId);
            this.subscribeToContract(contractId, (update) => {
              if (update.is_sold) {
                this.contractSettledListeners.forEach((cb) => {
                  try {
                    cb(contractId, update, meta);
                  } catch {}
                });
              }
            });
          }
        }
      }
    } catch {}
    return restored;
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[Deriv WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      const delay = Math.min(this.baseReconnectDelay * 2 ** (this.reconnectAttempts - 1), 10000);
      const timer = setTimeout(() => {
        this.retryTimers.delete("main");
        // Bail out if the user (or a newer connection) disconnected while the
        // backoff timer was pending — otherwise we'd silently reconnect after
        // an explicit disconnect().
        if (this.intentionallyDisconnected) return;
        // Deriv's OTP URLs are single-use: the socket that first opens consumes
        // the OTP, so reopening the cached URL always fails the WS handshake
        // (seen as `WebSocket connection to '...?otp=...' failed:` in the
        // console). Always re-run the REST accounts+otp flow to mint a fresh
        // single-use URL on every reconnect.
        if (this.apiToken) {
          this.connectWithOtp(this.apiToken).catch(() => this.connectPublic());
        } else {
          this.connectPublic();
        }
      }, delay);
      this.retryTimers.set("main", timer);
      return;
    }
    // The main socket has exhausted its reconnects. Do NOT leave the feed dead:
    // a public socket still delivers ticks without auth, and wsForTicks() will
    // only route through this.ws. Without this fallback every chart/frequency
    // widget silently goes dark after a transient network drop until the user
    // reloads the whole page (ticks just pile up in pendingSubscriptionSymbols).
    console.warn("[Deriv WS] Reconnect attempts exhausted — falling back to public tick feed");
    this.connectPublic();
  }

  private wsForTicks(): WebSocket | null {
    return this.ws;
  }

  public subscribe(symbol: string): number {
    if (this.subscribedSymbols.has(symbol)) {
      this.subRefCount.set(symbol, (this.subRefCount.get(symbol) || 0) + 1);
      return this.msgId++;
    }
    const reqId = this.msgId++;
    this.subSymbolById.set(reqId, symbol);
    this.subscribedSymbols.add(symbol);
    this.subRefCount.set(symbol, 1);
    this.subErrors.delete(symbol);
    const target = this.wsForTicks();
    if (!target || target.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptionSymbols.push(symbol);
      return reqId;
    }
    try {
      target.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: reqId }));
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe:", error);
      this.subscribedSymbols.delete(symbol);
      this.subRefCount.delete(symbol);
    }
    return reqId;
  }

  private doSubscribe(symbol: string) {
    if (!symbol) return;
    if (this.subscribedSymbols.has(symbol)) {
      this.subRefCount.set(symbol, (this.subRefCount.get(symbol) || 0) + 1);
      return;
    }
    const reqId = this.msgId++;
    this.subSymbolById.set(reqId, symbol);
    this.subscribedSymbols.add(symbol);
    this.subRefCount.set(symbol, 1);
    this.subErrors.delete(symbol);
    const target = this.wsForTicks();
    try {
      target?.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: reqId }));
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe:", error);
      this.subscribedSymbols.delete(symbol);
      this.subRefCount.delete(symbol);
      this.subSymbolById.delete(reqId);
    }
  }

  public unsubscribe(subscriptionId: number): void {
    const symbol = this.subSymbolById.get(subscriptionId);
    this.subSymbolById.delete(subscriptionId);
    if (!symbol) return;
    // Ref-count: decrement, only fully unsubscribe when count reaches 0
    const count = (this.subRefCount.get(symbol) || 1) - 1;
    if (count > 0) {
      this.subRefCount.set(symbol, count);
      return;
    }
    this.subRefCount.delete(symbol);
    // Keep the subscription alive if the symbol is marked as background-watched,
    // so the rolling tick buffer keeps accumulating across page navigation.
    if (this.backgroundSymbols.has(symbol)) return;
    this.subscribedSymbols.delete(symbol);
    const target = this.wsForTicks();
    if (target && target.readyState === WebSocket.OPEN) {
      try {
        target.send(JSON.stringify({ ticks: symbol, subscribe: 0, req_id: this.msgId++ }));
      } catch (error) {
        console.error("[Deriv WS] Failed to unsubscribe:", error);
      }
    }
  }

  /**
   * Mark a symbol as background-watched: it stays subscribed (and its tick
   * buffer keeps growing) even when no page is actively viewing it, so
   * navigating away and back never resets the price history. Call once per
   * symbol you want to keep warm; the buffer is bounded internally.
   */
  public markBackground(symbol: string): void {
    if (!symbol || this.backgroundSymbols.has(symbol)) return;
    this.backgroundSymbols.add(symbol);
    this.subscribe(symbol);
    // Bound the warm set to the 12 most recently marked symbols.
    if (this.backgroundSymbols.size > 12) {
      const first = this.backgroundSymbols.values().next().value as string | undefined;
      if (first) {
        this.backgroundSymbols.delete(first);
        this.unsubscribe(this.subSymbolById.entries().find(([, s]) => s === first)?.[0] ?? -1);
      }
    }
  }
  public addListener(listener: TickStreamListener): void {
    this.listeners.add(listener);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        listener.onConnect?.();
      } catch {}
    }
  }
  public removeListener(listener: TickStreamListener): void {
    this.listeners.delete(listener);
  }
  private notifyTick(tick: Tick): void {
    this.lastTickAt = Date.now();
    const buf = this.tickBuffer.get(tick.symbol) || [];
    buf.push(tick);
    if (buf.length > 2000) buf.shift();
    this.tickBuffer.set(tick.symbol, buf);
    this.listeners.forEach((l) => {
      try {
        l.onTick(tick);
      } catch {}
    });
  }
  private notifyError(error: Error): void {
    this.listeners.forEach((l) => {
      try {
        l.onError?.(error);
      } catch {}
    });
  }
  getSubError(symbol: string): string | undefined {
    return this.subErrors.get(symbol);
  }
  private notifyConnect(): void {
    this.listeners.forEach((l) => {
      try {
        l.onConnect?.();
      } catch {}
    });
  }
  private notifyDisconnect(): void {
    this.listeners.forEach((l) => {
      try {
        l.onDisconnect?.();
      } catch {}
    });
  }
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  /**
   * Feed health reflects whether live prices are actually flowing, not just
   * whether a socket is open. When the socket has gone quiet for more than
   * FEED_STALE_MS, the market is effectively frozen.
   */
  public getFeedHealth(): { alive: boolean; lastTickAt: number } {
    const stale = this.lastTickAt > 0 && Date.now() - this.lastTickAt > FEED_STALE_MS;
    const hasFeed = this.subscribedSymbols.size > 0 || this.backgroundSymbols.size > 0;
    const alive = this.lastTickAt > 0 && !stale && hasFeed;
    return { alive, lastTickAt: this.lastTickAt };
  }
  public isAuthorized(): boolean {
    return this.authorized;
  }
  public getAccountType(): string {
    return this.lastAccountType;
  }
  public onBalance(cb: (b: any) => void): () => void {
    this.balanceListeners.add(cb);
    if (this.lastBalance) {
      try {
        cb(this.lastBalance);
      } catch {}
    }
    if (this.authorized) this.fetchBalance();
    return () => this.balanceListeners.delete(cb);
  }
  public onSymbols(cb: (symbols: DerivSymbol[]) => void): () => void {
    this.symbolListeners.add(cb);
    if (this._activeSymbols.length > 0) cb(this._activeSymbols);
    return () => this.symbolListeners.delete(cb);
  }
  public onTokenError(cb: (msg: string) => void): () => void {
    this.tokenListeners.add(cb);
    return () => this.tokenListeners.delete(cb);
  }
  public get activeSymbols(): DerivSymbol[] {
    return this._activeSymbols;
  }
  public getSymbol(symbol: string): DerivSymbol | undefined {
    return this._activeSymbols.find((s) => s.symbol === symbol);
  }
  public getRecentTicks(symbol: string, limit = 100): Tick[] {
    const buf = this.tickBuffer.get(symbol) || [];
    return buf.slice(-limit);
  }
  public decimalPlacesFor(symbol: string): number {
    return this.getSymbol(symbol)?.decimalPlaces ?? 3;
  }
  private notifyBalance(b: any): void {
    this.balanceListeners.forEach((cb) => {
      try {
        cb(b);
      } catch {}
    });
  }
  private notifyTokenError(msg: string): void {
    this.tokenListeners.forEach((cb) => {
      try {
        cb(msg);
      } catch {}
    });
  }
  public disconnect(): void {
    this.intentionallyDisconnected = true;
    this.retryTimers.forEach((t) => clearTimeout(t));
    this.retryTimers.clear();
    this.keepAliveTimers.forEach((t) => clearInterval(t));
    this.keepAliveTimers = [];
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authorized = false;
    this.contractListeners.clear();
    this.pendingRequests.forEach((p) => p.reject(new Error("Connection closed")));
    this.pendingRequests.clear();
  }

  public async setApiToken(token: string): Promise<void> {
    const changed = this.apiToken !== token;
    if (!changed && this.authorized) return;
    this.apiToken = token;
    this.authorized = false;
    try {
      if (token) localStorage.setItem("deriv_token", token);
      else localStorage.removeItem("deriv_token");
    } catch {}
    // Other tabs: re-auth (or drop to public) with the same token — previously
    // a login/logout in one tab left the others on a stale connection.
    broadcastTabMessage("deriv-token-changed", { hasToken: !!token });
    if (!token) {
      this.connectPublic();
      return;
    }
    await this.connectWithOtp(token);
  }

  private async connectWithOtp(token: string): Promise<void> {
    if (this.otpInProgress) return;
    this.otpInProgress = true;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 8000;
    const timeoutMs = 15000;
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OTP connection timeout")), timeoutMs));
    let lastError: any;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await Promise.race([
          (async () => {
            const accounts = await this.fetchAccounts();
            if (!accounts.length) throw new Error(this.friendlyError("No trading accounts found"));
            const account = accounts[0];
            this.accountId = account.account_id;
            this.apiMode = "v1";
            const { url, accountType } = await this.fetchOtpUrl(account.account_id);
            this.lastAccountType = accountType;
            this.cachedOtpUrl = url;
            this.disconnect();
            this.connectWs(url, true);
          })(),
          timeoutPromise,
        ]);
        this.otpInProgress = false;
        return; // success
      } catch (error: any) {
        lastError = error;
        const msg = error.message || "";
        const isServerError = msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("Server is waking up") || msg.includes("Server is starting up");
        if (isServerError && attempt < MAX_RETRIES) {
          console.log(`[Deriv WS] Server unavailable (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms…`);
          this.notifyTokenError(`Server is waking up — retry ${attempt}/${MAX_RETRIES}…`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break; // non-retryable or exhausted
      }
    }
    // All retries exhausted
    const msg = lastError?.message || "";
    const friendly = msg.includes(".") ? msg : this.friendlyError(msg);
    this.notifyTokenError(friendly);
    this.connectPublic();
    this.otpInProgress = false;
  }
}

export const derivWS = new DerivWebSocketService();

// Cross-tab token coherence: when another tab saves/removes the Deriv token,
// re-auth this tab's connection with the same stored credential (or drop to
// public). Debounced so a burst of changes triggers one reconnect.
let tokenSyncTimer: ReturnType<typeof setTimeout> | null = null;
onTabMessage((type) => {
  if (type !== "deriv-token-changed") return;
  if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
  tokenSyncTimer = setTimeout(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("deriv_token");
    } catch {}
    if (stored && stored !== derivWS.apiToken) {
      void derivWS.setApiToken(stored);
    } else if (!stored && derivWS.isAuthorized()) {
      void derivWS.setApiToken("");
    }
  }, 400);
});

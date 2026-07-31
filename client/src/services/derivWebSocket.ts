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
export type DerivContractType =
  | "CALL" | "PUT" | "DIGITEVEN" | "DIGITODD" | "DIGITOVER" | "DIGITUNDER";
export interface PurchaseParams {
  symbol: string;
  contractType: DerivContractType;
  amount: number;
  duration: number;
  durationUnit?: "t" | "s" | "m";
  barrier?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface PurchaseResult {
  contractId: number;
  buyPrice: number;
  longcode: string;
  balanceAfter: number;
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
}

const DERIV_APP_ID = (import.meta as any).env?.VITE_DERIV_APP_ID || "33V0MWtYaZLLmAZBWUycN";
const DERIV_API_BASE = "https://api.derivws.com";
const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";
const DERIV_WS_V3 = "wss://ws.derivws.com/websockets/v3?app_id=1089";

class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private tickWs: WebSocket | null = null;
  private tickWsReady = false;
  private listeners: Set<TickStreamListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 3000;
  private msgId = 1;
  private apiToken: string | null = null;
  private authorized = false;
  private subscribedSymbols: Set<string> = new Set();
  private tickBuffer: Map<string, Tick[]> = new Map();
  private pendingSubscriptionSymbols: string[] = [];
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private contractListeners: Map<number, (c: ContractUpdate) => void> = new Map();
  private contractSettledListeners: Set<(contractId: number, update: ContractUpdate, meta: any) => void> = new Set();
  private subSymbolById: Map<number, string> = new Map();
  private subErrors: Map<string, string> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private intentionallyDisconnected = false;
  private lastBalance: any = null;
  private lastAccountType: string = "";
  private accountId: string = "";
  private apiMode: "v1" | "v3" = "v3";
  private balanceListeners: Set<(b: any) => void> = new Set();
  private _activeSymbols: DerivSymbol[] = [];
  private symbolListeners: Set<(symbols: DerivSymbol[]) => void> = new Set();
  private tokenListeners: Set<(msg: string) => void> = new Set();
  private otpInProgress = false;

  constructor() {
    try { this.apiToken = localStorage.getItem("deriv_token"); } catch {}
    if (this.apiToken) {
      this.connectWithOtp(this.apiToken).catch(() => this.connectPublic());
    } else {
      this.connectPublic();
    }
  }

  private friendlyError(msg: string, status?: number): string {
    const lower = msg.toLowerCase();
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
    return msg;
  }

  private async fetchAccounts(): Promise<any[]> {
    const url = `${DERIV_API_BASE}/trading/v1/options/accounts`;
    console.log("[Deriv OTP] GET", url);
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Deriv-App-ID": DERIV_APP_ID,
      },
    });
    const body = await res.text();
    console.log("[Deriv OTP] response", res.status, body);
    if (!res.ok) {
      throw new Error(this.friendlyError(body, res.status));
    }
    let json: any;
    try { json = JSON.parse(body); } catch { throw new Error(this.friendlyError(`Accounts: invalid JSON: ${body}`)); }
    const accounts = json.data || json.accounts || [];
    if (!accounts.length) console.warn("[Deriv OTP] No accounts found in:", json);
    return accounts;
  }

  private async fetchOtpUrl(accountId: string): Promise<{ url: string; accountType: string }> {
    const url = `${DERIV_API_BASE}/trading/v1/options/accounts/${accountId}/otp`;
    console.log("[Deriv OTP] POST", url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Deriv-App-ID": DERIV_APP_ID,
      },
    });
    const body = await res.text();
    console.log("[Deriv OTP] response", res.status, body);
    if (!res.ok) {
      throw new Error(this.friendlyError(body, res.status));
    }
    let json: any;
    try { json = JSON.parse(body); } catch { throw new Error(this.friendlyError(`OTP: invalid JSON: ${body}`)); }
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
      if (authenticated) this.ensureTickWs();
      this.ws.onopen = () => {
        console.log(`[Deriv WS] Connected (${authenticated ? "authenticated" : "public"})`);
        this.reconnectAttempts = 0;
        this.subErrors.clear();
        this.processPendingSubscriptions();
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
        try { this.handleMessage(JSON.parse(event.data)); }
        catch (error) { console.error("[Deriv WS] Parse error:", error); }
      };
      this.ws.onerror = () => console.warn("[Deriv WS] Connection error");
      this.ws.onclose = () => {
        console.log("[Deriv WS] Disconnected");
        this.authorized = false;
        this.subscribedSymbols.clear();
        this.pendingSubscriptionSymbols = [];
        this.retryTimers.forEach(t => clearTimeout(t));
        this.retryTimers.clear();
        this.notifyDisconnect();
        if (!this.intentionallyDisconnected) this.attemptReconnect();
      };
    } catch (error) { console.error("[Deriv WS] Setup failed:", error); }
  }

  private handleMessage(data: any) {
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      if (data.error) pending.reject(new Error(data.error.message || "Deriv API error"));
      else pending.resolve(data);
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
      const isSold = c.is_sold === 1 || c.status === "sold" || c.status === "won" || c.status === "lost";
      const cb = this.contractListeners.get(c.contract_id);
      cb?.({ contract_id: c.contract_id, is_sold: isSold ? 1 : 0, profit: c.profit, buy_price: c.buy_price, sell_price: c.sell_price, status: c.status, entry_tick: c.entry_tick, exit_tick: c.exit_tick });
      if (isSold) {
        this.contractListeners.delete(c.contract_id);
        this.clearContractMeta(c.contract_id);
      }
    }
    if (data.msg_type === "balance") {
      this.lastBalance = data.balance;
      const arr = Array.isArray(data.balance) ? data.balance : [data.balance];
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
      const guessField = (...names: string[]): string => names.find(n => n in first) || "";
      const symField = guessField("underlying_symbol", "symbol", "name", "id", "key", "code", "underlying", "ticker");
      const dispField = guessField("underlying_symbol_name", "display_name", "displayName", "description", "name", "symbol_description", "long_name", "full_name", "label", "title");
      const mktField = guessField("market", "market_name", "market_display_name", "sector", "group", "asset_class");
      const smktField = guessField("submarket", "submarket_name", "sub_sector", "subgroup", "sub_market");
      const pipField = guessField("pip", "pip_size", "pip_display", "display_digits", "decimal_places", "fractional_digits", "digits");
      let symbols: DerivSymbol[] = raw.map((s: any) => {
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
        };
      }).filter((s: any) => s.symbol && s.displayName);
      if (!symbols.length) {
        console.warn("[Deriv WS] active_symbols all filtered out, using defaults");
        symbols = [
          { symbol: "R_10", displayName: "Volatility 10 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_25", displayName: "Volatility 25 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_50", displayName: "Volatility 50 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_75", displayName: "Volatility 75 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_100", displayName: "Volatility 100 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_150", displayName: "Volatility 150 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "R_200", displayName: "Volatility 200 Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ15V", displayName: "Volatility 15 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ30V", displayName: "Volatility 30 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "1HZ90V", displayName: "Volatility 90 (1s) Index", market: "volatility", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "BOOM300", displayName: "Boom 300 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "BOOM500", displayName: "Boom 500 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "BOOM1000", displayName: "Boom 1000 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "CRASH300", displayName: "Crash 300 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "CRASH500", displayName: "Crash 500 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
          { symbol: "CRASH1000", displayName: "Crash 1000 Index", market: "boom_crash", submarket: "synthetic_index", decimalPlaces: 3 },
        ];
      }
      console.log("[Deriv WS] active_symbols loaded:", symbols.length);
      this._activeSymbols = symbols;
      this.symbolListeners.forEach(cb => { try { cb(symbols); } catch {} });
      this.processPendingSubscriptions();
      return;
    }
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      if (!msg.includes("subscribe")) console.error("[Deriv WS] API Error:", msg);
      const isTokenError = /token|authoriz|session/i.test(msg);
      if (isTokenError) return;
      const reqId = data.req_id;
      const sym = reqId ? this.subSymbolById.get(reqId) : null;
      if (sym) {
        this.subErrors.set(sym, msg);
        this.subscribedSymbols.delete(sym);
        if (this.authorized && msg.includes("Input validation")) {
          this.ensureTickWs();
          if (!this.pendingSubscriptionSymbols.includes(sym)) {
            this.pendingSubscriptionSymbols.push(sym);
          }
          if (this.tickWsReady) this.processPendingSubscriptions();
        }
        this.listeners.forEach(l => { try { l.onError?.(new Error(msg), sym); } catch {} });
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
    try { this.ws.send(JSON.stringify(msg)); }
    catch (error) { console.error("[Deriv WS] Failed to fetch active symbols:", error); }
  }

  private ensureTickWs() {
    if (this.tickWs && this.tickWs.readyState === WebSocket.OPEN) return;
    if (this.tickWs) { this.tickWs.close(); this.tickWs = null; }
    try {
      this.tickWs = new WebSocket(DERIV_WS_PUBLIC);
      this.tickWs.onopen = () => { this.tickWsReady = true; this.processPendingSubscriptions(); };
      this.tickWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tick) {
            this.notifyTick({
              symbol: data.tick.symbol || "UNKNOWN",
              price: data.tick.quote || 0,
              timestamp: (data.tick.epoch || Date.now() / 1000) * 1000,
              bid: data.tick.bid,
              ask: data.tick.ask,
            });
          }
        } catch {}
      };
      this.tickWs.onerror = () => {};
      this.tickWs.onclose = () => { this.tickWsReady = false; this.tickWs = null; };
    } catch (e) { console.error("[Deriv WS] Tick WS setup failed:", e); }
  }

  private processPendingSubscriptions() {
    const pending = [...this.pendingSubscriptionSymbols];
    this.pendingSubscriptionSymbols = [];
    if (pending.length === 0) return;
    setTimeout(() => {
      for (const symbol of pending) {
        if (!symbol || typeof symbol !== "string") continue;
        try {
          const target = this.authorized ? (this.tickWsReady ? this.tickWs : this.ws) : this.ws;
          target?.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: this.msgId++ }));
        }
        catch (error) { console.error("[Deriv WS] Failed to subscribe:", error); }
      }
    }, 500);
  }

  public fetchBalance() {
    if (!this.ws) return;
    try { this.ws.send(JSON.stringify({ balance: 1, req_id: this.msgId++ })); }
    catch (error) { console.error("[Deriv WS] Failed to fetch balance:", error); }
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
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { reject(new Error("WebSocket not connected")); return; }
      const reqId = this.msgId++;
      const timer = setTimeout(() => { this.pendingRequests.delete(reqId); reject(new Error("Deriv API request timed out")); }, timeoutMs);
      this.pendingRequests.set(reqId, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      try { this.ws.send(JSON.stringify({ ...payload, req_id: reqId })); }
      catch (error) { clearTimeout(timer); this.pendingRequests.delete(reqId); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  private async v3Trade(params: PurchaseParams): Promise<PurchaseResult> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(DERIV_WS_V3);
        const timeout = setTimeout(() => { ws.close(); reject(new Error("v3 WS timed out")); }, 30000);
        let reqId = 1;
        const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
        let proposalId = "";
        let askPrice = 0;
        ws.onopen = () => {
          ws.send(JSON.stringify({ authorize: this.apiToken, req_id: reqId++ }));
        };
        ws.onmessage = (event) => {
          let data: any;
          try { data = JSON.parse(event.data); } catch { return; }
          if (data.error) { ws.close(); clearTimeout(timeout); reject(new Error(data.error.message || JSON.stringify(data.error))); return; }
          if (data.msg_type === "authorize") {
            ws.send(JSON.stringify({ proposal: 1, amount: params.amount, basis: "stake", contract_type: params.contractType, currency: "USD", duration: params.duration, duration_unit: params.durationUnit || "t", symbol: params.symbol, ...(params.barrier !== undefined ? { barrier: String(params.barrier) } : {}), req_id: reqId++ }));
          } else if (data.msg_type === "proposal") {
            proposalId = data.proposal.id;
            askPrice = data.proposal.ask_price;
            ws.send(JSON.stringify({ buy: proposalId, price: askPrice, req_id: reqId++ }));
          } else if (data.msg_type === "buy") {
            ws.close(); clearTimeout(timeout);
            const b = data.buy;
            this.lastBalance = { ...(this.lastBalance || {}), balance: b.balance_after ?? (this.lastBalance?.balance ?? 0) - params.amount };
            this.notifyBalance(this.lastBalance);
            resolve({ contractId: b.contract_id, buyPrice: b.buy_price, longcode: b.longcode || "", balanceAfter: b.balance_after ?? 0 });
          }
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error("v3 WS connection failed")); };
      } catch (e: any) { reject(e); }
    });
  }

  public async purchaseContract(params: PurchaseParams): Promise<PurchaseResult> {
    if (!this.authorized) throw new Error("Not authorized");
    if (this.apiMode === "v1") {
      // Try v1 OTP WS — tries various message formats
      try {
        const contractParams = { amount: params.amount, basis: "stake", contract_type: params.contractType, currency: "USD", duration: params.duration, duration_unit: params.durationUnit || "t", underlying_symbol: params.symbol, ...(params.barrier !== undefined ? { barrier: String(params.barrier) } : {}) };
        for (const format of [
          { proposal: 1, ...contractParams },
          { proposal: 1, contract: contractParams },
          { proposal: 1, parameters: contractParams },
        ]) {
          const proposalRes = await this.sendRequest(format, 15000).catch(() => null);
          if (proposalRes?.proposal) {
            const buyRes = await this.sendRequest({ buy: proposalRes.proposal.id, price: proposalRes.proposal.ask_price });
            if (!buyRes?.buy) continue;
            const b = buyRes.buy.balance_after ?? (this.lastBalance?.balance ?? 0) - params.amount;
            this.lastBalance = { ...(this.lastBalance || {}), balance: b };
            this.notifyBalance(this.lastBalance);
            return { contractId: buyRes.buy.contract_id, buyPrice: buyRes.buy.buy_price, longcode: buyRes.buy.longcode, balanceAfter: b };
          }
        }
        console.warn("[Deriv WS] v1 proposal failed all formats");
      } catch (e: any) {
        console.warn("[Deriv WS] v1 proposal error:", e.message);
      }
      // Fall back to v3 WS
      try { return await this.v3Trade(params); } catch {}
      throw new Error("All trading methods failed");
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");
    let proposalPayload: Record<string, any> = { proposal: 1, amount: params.amount, basis: "stake", contract_type: params.contractType, currency: "USD", duration: params.duration, duration_unit: params.durationUnit || "t" };
    if (params.barrier !== undefined) proposalPayload.barrier = String(params.barrier);
    if (params.stopLoss !== undefined) proposalPayload.stop_loss = String(params.stopLoss);
    if (params.takeProfit !== undefined) proposalPayload.take_profit = String(params.takeProfit);
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
          return { contractId: buyRes.buy.contract_id, buyPrice: buyRes.buy.buy_price, longcode: buyRes.buy.longcode, balanceAfter: b };
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
    try { this.ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: this.msgId++ })); }
    catch (error) { console.error("[Deriv WS] Failed to subscribe to contract:", error); }
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
                this.contractSettledListeners.forEach(cb => { try { cb(contractId, update, meta); } catch {} });
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
      const delay = this.baseReconnectDelay * (2 ** (this.reconnectAttempts - 1));
      setTimeout(() => {
        if (this.apiToken) {
          this.connectWithOtp(this.apiToken).catch(() => this.connectPublic());
        } else {
          this.connectPublic();
        }
      }, delay);
    }
  }

  private wsForTicks(): WebSocket | null {
    return (this.authorized && this.tickWsReady) ? this.tickWs : this.ws;
  }

  public subscribe(symbol: string): number {
    const subId = this.msgId++;
    if (this.subscribedSymbols.has(symbol)) return subId;
    if (this.authorized) this.ensureTickWs();
    this.subSymbolById.set(subId, symbol);
    this.subscribedSymbols.add(symbol);
    this.subErrors.delete(symbol);
    const target = this.wsForTicks();
    if (!target || target.readyState !== WebSocket.OPEN) { this.pendingSubscriptionSymbols.push(symbol); return subId; }
    try { target.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: this.msgId++ })); }
    catch (error) { console.error("[Deriv WS] Failed to subscribe:", error); this.subscribedSymbols.delete(symbol); }
    return subId;
  }

  private doSubscribe(symbol: string) {
    if (!symbol) return;
    if (this.subscribedSymbols.has(symbol)) return;
    if (this.authorized) this.ensureTickWs();
    this.subscribedSymbols.add(symbol);
    this.subErrors.delete(symbol);
    const reqId = this.msgId++;
    this.subSymbolById.set(reqId, symbol);
    const target = this.wsForTicks();
    try { target?.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: reqId })); }
    catch (error) { console.error("[Deriv WS] Failed to subscribe:", error); this.subscribedSymbols.delete(symbol); this.subSymbolById.delete(reqId); }
  }

  public unsubscribe(subscriptionId: number): void {
    const symbol = this.subSymbolById.get(subscriptionId);
    this.subSymbolById.delete(subscriptionId);
    if (!symbol) return;
    this.subscribedSymbols.delete(symbol);
    const target = this.wsForTicks();
    if (target && target.readyState === WebSocket.OPEN) {
      try { target.send(JSON.stringify({ ticks: symbol, subscribe: 0, req_id: this.msgId++ })); }
      catch (error) { console.error("[Deriv WS] Failed to unsubscribe:", error); }
    }
  }
  public addListener(listener: TickStreamListener): void { this.listeners.add(listener); if (this.ws && this.ws.readyState === WebSocket.OPEN) { try { listener.onConnect?.(); } catch {} } }
  public removeListener(listener: TickStreamListener): void { this.listeners.delete(listener); }
  private notifyTick(tick: Tick): void {
    const buf = this.tickBuffer.get(tick.symbol) || [];
    buf.push(tick);
    if (buf.length > 2000) buf.shift();
    this.tickBuffer.set(tick.symbol, buf);
    this.listeners.forEach(l => { try { l.onTick(tick); } catch {} });
  }
  private notifyError(error: Error): void { this.listeners.forEach(l => { try { l.onError?.(error); } catch {} }); }
  getSubError(symbol: string): string | undefined { return this.subErrors.get(symbol); }
  private notifyConnect(): void { this.listeners.forEach(l => { try { l.onConnect?.(); } catch {} }); }
  private notifyDisconnect(): void { this.listeners.forEach(l => { try { l.onDisconnect?.(); } catch {} }); }
  public isConnected(): boolean { return this.ws !== null && this.ws.readyState === WebSocket.OPEN; }
  public isAuthorized(): boolean { return this.authorized; }
  public getAccountType(): string { return this.lastAccountType; }
  public onBalance(cb: (b: any) => void): void {
    this.balanceListeners.add(cb);
    if (this.lastBalance) { try { cb(this.lastBalance); } catch {} }
    if (this.authorized) this.fetchBalance();
  }
  public onSymbols(cb: (symbols: DerivSymbol[]) => void): void { this.symbolListeners.add(cb); if (this._activeSymbols.length > 0) cb(this._activeSymbols); }
  public onTokenError(cb: (msg: string) => void): () => void { this.tokenListeners.add(cb); return () => this.tokenListeners.delete(cb); }
  public get activeSymbols(): DerivSymbol[] { return this._activeSymbols; }
  public getSymbol(symbol: string): DerivSymbol | undefined { return this._activeSymbols.find(s => s.symbol === symbol); }
  public getRecentTicks(symbol: string, limit = 100): Tick[] {
    const buf = this.tickBuffer.get(symbol) || [];
    return buf.slice(-limit);
  }
  public decimalPlacesFor(symbol: string): number { return this.getSymbol(symbol)?.decimalPlaces ?? 3; }
  private notifyBalance(b: any): void { this.balanceListeners.forEach(cb => { try { cb(b); } catch {} }); }
  private notifyTokenError(msg: string): void { this.tokenListeners.forEach(cb => { try { cb(msg); } catch {} }); }
  public disconnect(): void { this.intentionallyDisconnected = true; if (this.ws) { this.ws.close(); this.ws = null; } if (this.tickWs) { this.tickWs.close(); this.tickWs = null; this.tickWsReady = false; } this.authorized = false; this.contractListeners.clear(); this.pendingRequests.forEach(p => p.reject(new Error("Connection closed"))); this.pendingRequests.clear(); }

  public async setApiToken(token: string): Promise<void> {
    const changed = this.apiToken !== token;
    if (!changed && this.authorized) return;
    this.apiToken = token;
    this.authorized = false;
    try { if (token) localStorage.setItem("deriv_token", token); else localStorage.removeItem("deriv_token"); } catch {}
    if (!token) {
      this.connectPublic();
      return;
    }
    await this.connectWithOtp(token);
  }

  private async connectWithOtp(token: string): Promise<void> {
    if (this.otpInProgress) return;
    this.otpInProgress = true;
    try {
      const accounts = await this.fetchAccounts();
      if (!accounts.length) throw new Error(this.friendlyError("No trading accounts found"));
      const account = accounts[0];
      this.accountId = account.account_id;
      this.apiMode = "v1";
      const { url, accountType } = await this.fetchOtpUrl(account.account_id);
      this.lastAccountType = accountType;
      this.disconnect();
      this.connectWs(url, true);
    } catch (error: any) {
      console.error("[Deriv WS] OTP connection failed:", error.message);
      const msg = error.message || "";
      const friendly = msg.includes(".") ? msg : this.friendlyError(msg);
      this.notifyTokenError(friendly);
      this.connectPublic();
    } finally {
      this.otpInProgress = false;
    }
  }
}

export const derivWS = new DerivWebSocketService();

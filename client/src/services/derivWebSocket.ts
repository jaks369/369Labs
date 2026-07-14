/**
 * Deriv WebSocket Service for Real-time Tick Streaming
 */
export interface Tick {
  symbol: string;
  price: number;
  timestamp: number;
  bid?: number;
  ask?: number;
}
export interface TickStreamListener {
  onTick: (tick: Tick) => void;
  onError?: (error: Error) => void;
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
}
export interface PurchaseResult {
  contractId: number;
  buyPrice: number;
  longcode: string;
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
const DERIV_APP_ID = (import.meta as any).env?.VITE_DERIV_APP_ID || "1089";
class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<TickStreamListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 3000;
  private msgId = 1;
  private apiToken: string | null = null;
  private authorized = false;
  private subscribedSymbols: Set<string> = new Set();
  private pendingSubscriptionSymbols: string[] = [];
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private contractListeners: Map<number, (c: ContractUpdate) => void> = new Map();
  private intentionallyDisconnected = false;
  private lastBalance: any = null;
  private balanceListeners: Set<(b: any) => void> = new Set();
  constructor() { this.setupWebSocket(); }
  private setupWebSocket() {
    try {
      const endpoint = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;
      this.ws = new WebSocket(endpoint);
      this.ws.onopen = () => {
        console.log("[Deriv WS] Connected");
        this.reconnectAttempts = 0;
        this.notifyConnect();
        if (this.apiToken) this.authorize();
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
        this.notifyDisconnect();
        if (!this.intentionallyDisconnected) this.attemptReconnect();
      };
    } catch (error) { console.error("[Deriv WS] Setup failed:", error); }
  }
  private authorize() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.apiToken) return;
    const reqId = this.msgId++;
    try {
      this.ws.send(JSON.stringify({ authorize: this.apiToken, req_id: reqId }));
      console.log("[Deriv WS] Authorization sent");
    } catch (error) { console.error("[Deriv WS] Failed to authorize:", error); }
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
      const cb = this.contractListeners.get(c.contract_id);
      cb?.({ contract_id: c.contract_id, is_sold: c.is_sold, profit: c.profit, buy_price: c.buy_price, sell_price: c.sell_price, status: c.status, entry_tick: c.entry_tick, exit_tick: c.exit_tick });
      if (c.is_sold) this.contractListeners.delete(c.contract_id);
    }
    if (data.msg_type === "authorize") {
      console.log("[Deriv WS] Authorized successfully");
      this.authorized = true;
      this.notifyConnect();
      this.fetchBalance();
      this.processPendingSubscriptions();
      return;
    }
    if (data.msg_type === "balance") {
      console.log("[Deriv WS] Balance:", data.balance);
      this.lastBalance = data.balance;
      this.notifyBalance(data.balance);
      return;
    }
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      console.error("[Deriv WS] API Error:", msg);
      this.notifyError(new Error(msg));
    }
  }
  private processPendingSubscriptions() {
    const pending = [...this.pendingSubscriptionSymbols];
    this.pendingSubscriptionSymbols = [];
    for (const symbol of pending) {
      if (!this.subscribedSymbols.has(symbol)) this.doSubscribe(symbol);
    }
  }
  private fetchBalance() {
    if (!this.ws || !this.authorized) return;
    try {
      this.ws.send(JSON.stringify({ balance: 1, account: "all", req_id: this.msgId++ }));
    } catch (error) { console.error("[Deriv WS] Failed to fetch balance:", error); }
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
  public async purchaseContract(params: PurchaseParams): Promise<PurchaseResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");
    if (!this.authorized) throw new Error("Not authorized");
    const proposalRes = await this.sendRequest({ proposal: 1, amount: params.amount, basis: "stake", contract_type: params.contractType, currency: "USD", duration: params.duration, duration_unit: params.durationUnit || "t", symbol: params.symbol, ...(params.barrier !== undefined ? { barrier: String(params.barrier) } : {}) });
    if (!proposalRes.proposal) throw new Error("No proposal returned");
    const buyRes = await this.sendRequest({ buy: proposalRes.proposal.id, price: proposalRes.proposal.ask_price });
    if (!buyRes.buy) throw new Error("Buy request failed");
    return { contractId: buyRes.buy.contract_id, buyPrice: buyRes.buy.buy_price, longcode: buyRes.buy.longcode };
  }
  public subscribeToContract(contractId: number, onUpdate: (c: ContractUpdate) => void): void {
    this.contractListeners.set(contractId, onUpdate);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: this.msgId++ })); }
    catch (error) { console.error("[Deriv WS] Failed to subscribe to contract:", error); }
  }
  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[Deriv WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => this.setupWebSocket(), this.baseReconnectDelay * (2 ** (this.reconnectAttempts - 1)));
    }
  }
  public subscribe(symbol: string): number {
    const subId = this.msgId++;
    if (this.subscribedSymbols.has(symbol)) return subId;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptionSymbols.push(symbol);
      return subId;
    }
    if (!this.authorized) {
      if (this.apiToken) { this.pendingSubscriptionSymbols.push(symbol); return subId; }
      console.warn(`[Deriv WS] No token set, cannot subscribe to ${symbol}`);
      return subId;
    }
    this.doSubscribe(symbol);
    return subId;
  }
  private doSubscribe(symbol: string) {
    if (this.subscribedSymbols.has(symbol)) return;
    this.subscribedSymbols.add(symbol);
    const reqId = this.msgId++;
    try {
      this.ws!.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: reqId }));
      console.log(`[Deriv WS] Subscribed to ${symbol}`);
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe:", error);
      this.subscribedSymbols.delete(symbol);
    }
  }
  public unsubscribe(subscriptionId: number): void {}
  public addListener(listener: TickStreamListener): void {
    this.listeners.add(listener);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { listener.onConnect?.(); } catch {}
    }
  }
  public removeListener(listener: TickStreamListener): void { this.listeners.delete(listener); }
  private notifyTick(tick: Tick): void { this.listeners.forEach(l => { try { l.onTick(tick); } catch {} }); }
  private notifyError(error: Error): void { this.listeners.forEach(l => { try { l.onError?.(error); } catch {} }); }
  private notifyConnect(): void { this.listeners.forEach(l => { try { l.onConnect?.(); } catch {} }); }
  private notifyDisconnect(): void { this.listeners.forEach(l => { try { l.onDisconnect?.(); } catch {} }); }
  public isConnected(): boolean { return this.ws !== null && this.ws.readyState === WebSocket.OPEN; }
  public isAuthorized(): boolean { return this.authorized; }
  public onBalance(cb: (b: any) => void): void { this.balanceListeners.add(cb); if (this.lastBalance) cb(this.lastBalance); }
  private notifyBalance(b: any): void { this.balanceListeners.forEach(cb => { try { cb(b); } catch {} }); }
  public disconnect(): void {
    this.intentionallyDisconnected = true;
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.contractListeners.clear();
    this.pendingRequests.forEach(p => p.reject(new Error("Connection closed")));
    this.pendingRequests.clear();
  }
  public setApiToken(token: string): void {
    if (this.apiToken !== token) this.authorized = false;
    this.apiToken = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.authorize();
  }
}
export const derivWS = new DerivWebSocketService();

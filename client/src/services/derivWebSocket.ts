/**
 * Deriv WebSocket Service for Real-time Tick Streaming
 * Connects to Deriv API and streams live market data
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
  | "CALL"
  | "PUT"
  | "DIGITEVEN"
  | "DIGITODD"
  | "DIGITOVER"
  | "DIGITUNDER";

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
  private messageId = 1;
  private apiToken: string | null = null;
  private authorized = false;
  private activeSubscriptions: Map<number, NodeJS.Timeout> = new Map();
  private pendingSubscriptionSymbols: string[] = [];
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private contractListeners: Map<number, (c: ContractUpdate) => void> = new Map();
  private intentionallyDisconnected = false;

  constructor() {
    this.setupWebSocket();
  }

  private setupWebSocket() {
    try {
      const endpoint = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;
      this.ws = new WebSocket(endpoint);

      this.ws.onopen = () => {
        console.log("[Deriv WS] Connected to Deriv API");
        this.reconnectAttempts = 0;
        this.notifyConnect();
        if (this.apiToken) {
          this.authorize();
        }
        // Process any subscriptions queued while connecting
        this.processPendingSubscriptions();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error("[Deriv WS] Failed to parse message:", error);
        }
      };

      this.ws.onerror = () => {
        console.warn("[Deriv WS] Connection error");
      };

      this.ws.onclose = () => {
        console.log("[Deriv WS] Disconnected");
        this.authorized = false;
        this.notifyDisconnect();
        if (!this.intentionallyDisconnected) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error("[Deriv WS] Setup failed:", error);
    }
  }

  private authorize() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.apiToken) {
      return;
    }
    const message = {
      authorize: this.apiToken,
      id: this.messageId++,
    };
    try {
      this.ws.send(JSON.stringify(message));
      console.log("[Deriv WS] Authorization sent");
    } catch (error) {
      console.error("[Deriv WS] Failed to authorize:", error);
    }
  }

  private handleMessage(data: any) {
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      if (data.error) {
        pending.reject(new Error(data.error.message || "Deriv API error"));
      } else {
        pending.resolve(data);
      }
    }

    if (data.tick) {
      const tick: Tick = {
        symbol: data.tick.symbol || "UNKNOWN",
        price: data.tick.quote || 0,
        timestamp: (data.tick.epoch || Date.now() / 1000) * 1000,
        bid: data.tick.bid,
        ask: data.tick.ask,
      };
      this.notifyTick(tick);
    }

    if (data.proposal_open_contract) {
      const c = data.proposal_open_contract;
      const update: ContractUpdate = {
        contract_id: c.contract_id,
        is_sold: c.is_sold,
        profit: c.profit,
        buy_price: c.buy_price,
        sell_price: c.sell_price,
        status: c.status,
        entry_tick: c.entry_tick,
        exit_tick: c.exit_tick,
      };
      const cb = this.contractListeners.get(c.contract_id);
      cb?.(update);
      if (c.is_sold) {
        this.contractListeners.delete(c.contract_id);
      }
    }

    if (data.authorize) {
      console.log("[Deriv WS] Authorized successfully");
      this.authorized = true;
      this.processPendingSubscriptions();
    }

    if (data.error) {
      console.error("[Deriv WS] API Error:", data.error);
      this.notifyError(new Error(data.error.message || "Unknown error"));
    }
  }

  private processPendingSubscriptions() {
    if (this.pendingSubscriptionSymbols.length === 0) return;
    const pending = [...this.pendingSubscriptionSymbols];
    this.pendingSubscriptionSymbols = [];
    for (const symbol of pending) {
      this.doSubscribe(symbol);
    }
  }

  private sendRequest(payload: Record<string, any>, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Deriv WebSocket is not connected"));
        return;
      }
      const reqId = this.messageId++;
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

  public async purchaseContract(params: PurchaseParams): Promise<PurchaseResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Deriv WebSocket is not connected");
    }
    if (!this.authorized) {
      throw new Error("Not authorized — set a valid Deriv API token before trading");
    }
    if ((params.contractType === "DIGITOVER" || params.contractType === "DIGITUNDER") && params.barrier === undefined) {
      throw new Error(`${params.contractType} requires a barrier digit (0-9)`);
    }

    const proposalReq: Record<string, any> = {
      proposal: 1,
      amount: params.amount,
      basis: "stake",
      contract_type: params.contractType,
      currency: "USD",
      duration: params.duration,
      duration_unit: params.durationUnit || "t",
      symbol: params.symbol,
    };
    if (params.barrier !== undefined) proposalReq.barrier = String(params.barrier);

    const proposalRes = await this.sendRequest(proposalReq);
    const proposal = proposalRes.proposal;
    if (!proposal) throw new Error("Deriv did not return a proposal");

    const buyRes = await this.sendRequest({ buy: proposal.id, price: proposal.ask_price });
    const buy = buyRes.buy;
    if (!buy) throw new Error("Deriv buy request failed");

    return { contractId: buy.contract_id, buyPrice: buy.buy_price, longcode: buy.longcode };
  }

  public subscribeToContract(contractId: number, onUpdate: (c: ContractUpdate) => void): void {
    this.contractListeners.set(contractId, onUpdate);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1,
          req_id: this.messageId++,
        })
      );
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe to contract:", error);
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[Deriv WS] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.setupWebSocket(), this.baseReconnectDelay * (2 ** (this.reconnectAttempts - 1)));
    } else {
      console.log("[Deriv WS] Max reconnect attempts reached");
    }
  }

  public subscribe(symbol: string): number {
    const id = this.messageId++;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[Deriv WS] Queuing ${symbol} — connection not ready`);
      this.pendingSubscriptionSymbols.push(symbol);
      return id;
    }
    if (!this.authorized) {
      if (this.apiToken) {
        console.log(`[Deriv WS] Queuing ${symbol} — waiting for authorization`);
        this.pendingSubscriptionSymbols.push(symbol);
        return id;
      }
      console.warn(`[Deriv WS] Cannot subscribe to ${symbol} — no API token set`);
      // Still return a valid ID, components will just get no ticks until token is set
      return id;
    }
    return this.doSubscribe(symbol);
  }

  private doSubscribe(symbol: string): number {
    const id = this.messageId++;
    this.activeSubscriptions.set(id, null as any);
    const message = {
      ticks: symbol,
      subscribe: 1,
      id: id,
    };
    try {
      this.ws!.send(JSON.stringify(message));
      console.log(`[Deriv WS] Subscribed to ${symbol} (ID: ${id})`);
      return id;
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe:", error);
      this.activeSubscriptions.delete(id);
      return -1;
    }
  }

  public unsubscribe(subscriptionId: number): void {
    const interval = this.activeSubscriptions.get(subscriptionId);
    if (interval) {
      clearInterval(interval);
      this.activeSubscriptions.delete(subscriptionId);
    }
  }

  public addListener(listener: TickStreamListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: TickStreamListener): void {
    this.listeners.delete(listener);
  }

  private notifyTick(tick: Tick): void {
    this.listeners.forEach((listener) => {
      try {
        listener.onTick(tick);
      } catch (error) {
        console.error("[Deriv WS] Listener error:", error);
      }
    });
  }

  private notifyError(error: Error): void {
    this.listeners.forEach((listener) => {
      try {
        listener.onError?.(error);
      } catch (e) {
        console.error("[Deriv WS] Error listener failed:", e);
      }
    });
  }

  private notifyConnect(): void {
    this.listeners.forEach((listener) => {
      try {
        listener.onConnect?.();
      } catch (error) {
        console.error("[Deriv WS] Connect listener failed:", error);
      }
    });
  }

  private notifyDisconnect(): void {
    this.listeners.forEach((listener) => {
      try {
        listener.onDisconnect?.();
      } catch (error) {
        console.error("[Deriv WS] Disconnect listener failed:", error);
      }
    });
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public isAuthorized(): boolean {
    return this.authorized;
  }

  public disconnect(): void {
    this.intentionallyDisconnected = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.activeSubscriptions.forEach((interval) => {
      if (interval) clearInterval(interval);
    });
    this.activeSubscriptions.clear();
    this.contractListeners.clear();
    this.pendingRequests.forEach((p) => p.reject(new Error("Connection closed")));
    this.pendingRequests.clear();
  }

  public setApiToken(token: string): void {
    if (this.apiToken !== token) {
      this.authorized = false;
    }
    this.apiToken = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.authorize();
    }
  }

  public setToken(token: string): void {
    this.setApiToken(token);
  }
}

export const derivWS = new DerivWebSocketService();

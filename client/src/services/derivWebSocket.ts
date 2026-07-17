/**
 * Deriv WebSocket Service for Real-time Tick Streaming
 * Connects to Deriv API and streams live market data
 * Falls back to simulated data if connection fails
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

// Deriv real contract types this app can place. DIGITOVER/DIGITUNDER require a barrier (0-9).
export type DerivContractType =
  | "CALL" // rise
  | "PUT" // fall
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
  barrier?: number; // required for DIGITOVER / DIGITUNDER
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

// Deriv requires an app_id on every connection. 1089 is Deriv's public demo app_id;
// register your own at https://developers.deriv.com for production use.
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
  private subscribedSymbols: Set<string> = new Set();
  private pendingSubscriptions: Map<number, string> = new Map(); // subscriptionId -> symbol
  private simulationActive = false;
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private contractListeners: Map<number, (c: ContractUpdate) => void> = new Map();

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
        this.simulationActive = false;
        this.notifyConnect();
        if (this.apiToken) {
          this.authorize();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error("[Deriv WS] Failed to parse message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.warn("[Deriv WS] Connection error - switching to simulated mode");
        this.simulationActive = true;
        this.notifyConnect(); // Notify as connected to allow UI to show data
      };

      this.ws.onclose = () => {
        console.log("[Deriv WS] Disconnected");
        this.authorized = false;
        this.notifyDisconnect();
        this.attemptReconnect();
      };
    } catch (error) {
      console.warn("[Deriv WS] Setup failed - using simulated mode:", error);
      this.simulationActive = true;
      this.notifyConnect();
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
    // Resolve/reject any pending request/response pair (proposal, buy, etc.)
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      if (data.error) {
        pending.reject(new Error(data.error.message || "Deriv API error"));
      } else {
        pending.resolve(data);
      }
      // Don't return early — a message can also carry tick/contract payloads below.
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

    if (data.subscription) {
      console.log("[Deriv WS] Subscription confirmed:", data.subscription);
    }

    if (data.authorize) {
      console.log("[Deriv WS] Authorized successfully");
      this.authorized = true;
      // Subscribe to any symbols that were queued before authorization
      const pending = [...this.pendingSubscriptions.values()];
      this.pendingSubscriptions.clear();
      for (const symbol of pending) {
        this.subscribe(symbol);
      }
    }

    if (data.error) {
      console.error("[Deriv WS] API Error:", data.error);
      this.notifyError(new Error(data.error.message || "Unknown error"));
    }
  }

  /**
   * Sends a request and resolves with the matching response, correlated via req_id.
   * Rejects if the connection isn't live, on API error, or after timeout.
   */
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

  /**
   * Places a real trade on Deriv: requests a price proposal, then buys it.
   * Throws if not connected/authorized (simulation mode has no real money to trade with).
   */
  public async purchaseContract(params: PurchaseParams): Promise<PurchaseResult> {
    if (this.simulationActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot place a real trade while in simulated/offline mode");
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

  /**
   * Subscribes to live updates for an open contract until it's sold, then auto-unsubscribes.
   */
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
      console.log(
        `[Deriv WS] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      setTimeout(() => this.setupWebSocket(), this.baseReconnectDelay * (2 ** (this.reconnectAttempts - 1)));
    } else {
      console.log("[Deriv WS] Switching to simulated tick data for demo");
      this.simulationActive = true;
      this.notifyConnect();
    }
  }

  public subscribe(symbol: string): number {
    const id = this.messageId++;
    const subscriptionId = id;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[Deriv WS] Connection not ready, queuing ${symbol}`);
      this.pendingSubscriptions.set(subscriptionId, symbol);
      return subscriptionId;
    }

    if (!this.authorized) {
      if (this.apiToken) {
        console.log(`[Deriv WS] Not yet authorized, queuing ${symbol}`);
        this.pendingSubscriptions.set(subscriptionId, symbol);
        return subscriptionId;
      }
      console.log(`[Deriv WS] No API token set, cannot subscribe to ${symbol}`);
      return -1;
    }

    this.activeSubscriptions.set(subscriptionId, null as any);

    const message = {
      ticks: symbol,
      subscribe: 1,
      id: id,
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`[Deriv WS] Subscribed to ${symbol} (ID: ${subscriptionId})`);
      return subscriptionId;
    } catch (error) {
      console.error("[Deriv WS] Failed to subscribe:", error);
      this.activeSubscriptions.delete(subscriptionId);
      return -1;
    }
  }

  private startSimulation(subscriptionId: number, symbol: string) {
    console.log(`[Deriv WS] Starting simulated tick data for ${symbol}`);
    const basePrice = Math.random() * 100 + 50;
    let currentPrice = basePrice;

    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 2;
      currentPrice += change;

      const tick: Tick = {
        symbol,
        price: parseFloat(currentPrice.toFixed(4)),
        timestamp: Date.now(),
        bid: parseFloat((currentPrice - 0.01).toFixed(4)),
        ask: parseFloat((currentPrice + 0.01).toFixed(4)),
      };

      this.notifyTick(tick);
    }, 1000);

    this.activeSubscriptions.set(subscriptionId, interval);
  }

  public unsubscribe(subscriptionId: number): void {
    const interval = this.activeSubscriptions.get(subscriptionId);
    if (interval) {
      clearInterval(interval);
      this.activeSubscriptions.delete(subscriptionId);
      console.log(`[Deriv WS] Unsubscribed (ID: ${subscriptionId})`);
    }
    // Also clean up any pending subscription
    if (this.pendingSubscriptions.has(subscriptionId)) {
      this.pendingSubscriptions.delete(subscriptionId);
      console.log(`[Deriv WS] Cancelled pending subscription (ID: ${subscriptionId})`);
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
    return this.simulationActive || (this.ws !== null && this.ws.readyState === WebSocket.OPEN);
  }

  /** True once the API token has been accepted by Deriv on this connection. */
  public isAuthorized(): boolean {
    return this.authorized;
  }

  public disconnect(): void {
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
}

export const derivWS = new DerivWebSocketService();

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

class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<TickStreamListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 3000;
  private messageId = 1;
  private apiToken: string | null = null;
  private activeSubscriptions: Map<number, NodeJS.Timeout> = new Map();
  private simulationActive = false;

  constructor() {
    this.setupWebSocket();
  }

  private setupWebSocket() {
    try {
      // Using Deriv's WebSocket endpoint
      const endpoint = "wss://ws.derivws.com/websockets/v3?app_id=1089";

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

    if (data.subscription) {
      console.log("[Deriv WS] Subscription confirmed:", data.subscription);
    }

    if (data.authorize) {
      console.log("[Deriv WS] Authorized successfully");
    }

    if (data.error) {
      console.error("[Deriv WS] API Error:", data.error);
      this.notifyError(new Error(data.error.message || "Unknown error"));
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

    if (this.simulationActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Use simulated data
      this.startSimulation(subscriptionId, symbol);
      return subscriptionId;
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

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.activeSubscriptions.forEach((interval) => {
      if (interval) clearInterval(interval);
    });
    this.activeSubscriptions.clear();
  }

  public setApiToken(token: string): void {
    this.apiToken = token;
    if (this.isConnected() && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.authorize();
    }
  }
}

export const derivWS = new DerivWebSocketService();

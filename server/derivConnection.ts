import type { IncomingMessage } from "http";
import WebSocket from "ws";
import * as db from "./db";
import { normalizeSymbol } from "./aitools";

const DERIV_APP_ID = Number(process.env.VITE_DERIV_APP_ID) || 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;
const REQUEST_TIMEOUT = 15000;

interface PendingRequest {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Position {
  contractId: number;
  symbol: string;
  contractType: string;
  entryPrice: number;
  currentPrice: number;
  profit: number;
  isOpen: boolean;
  duration: string;
}

interface AccountInfo {
  loginid: string;
  balance: number;
  currency: string;
  accountType: string;
}

interface ConnectionSnapshot {
  connected: boolean;
  authorized: boolean;
  account: AccountInfo | null;
  positions: Position[];
  openPositionCount: number;
  totalUnrealizedPnl: number;
}

class DerivConnection {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, PendingRequest>();
  private _authorized = false;
  private _account: AccountInfo | null = null;
  private _positions: Position[] = [];
  private userId: number;
  private apiToken: string;
  private connectPromise: Promise<void> | null = null;

  constructor(userId: number, apiToken: string) {
    this.userId = userId;
    this.apiToken = apiToken;
  }

  private async connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_URL);
        this.ws.onopen = async () => {
          try {
            await this.sendRaw({ authorize: this.apiToken });
            this._authorized = true;
            await this.refresh();
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        this.ws.onmessage = (event) => {
          let data: any;
          try { data = JSON.parse(event.data as string); } catch { return; }
          this.handleMessage(data);
        };
        this.ws.onerror = () => { this._authorized = false; };
        this.ws.onclose = () => { this._authorized = false; };
      } catch (e) {
        reject(e);
      }
    });
    return this.connectPromise;
  }

  private handleMessage(data: any): void {
    if (data.req_id !== undefined && this.pending.has(data.req_id)) {
      const p = this.pending.get(data.req_id)!;
      this.pending.delete(data.req_id);
      clearTimeout(p.timer);
      if (data.error) p.reject(new Error(data.error.message || "Deriv API error"));
      else p.resolve(data);
    }
    if (data.msg_type === "balance") {
      const list = data.balance?.accounts || [data.balance].filter(Boolean);
      const acct = list[0];
      if (acct) {
        this._account = {
          loginid: acct.loginid || "",
          balance: parseFloat(acct.balance) || 0,
          currency: acct.currency || "USD",
          accountType: (acct.account_type || "").toString().toLowerCase(),
        };
      }
    }
    if (data.msg_type === "proposal_open_contract") {
      const c = data.proposal_open_contract;
      if (c) this.updatePosition(c);
    }
  }

  private updatePosition(c: any): void {
    const idx = this._positions.findIndex(p => p.contractId === c.contract_id);
    const pos: Position = {
      contractId: c.contract_id,
      symbol: c.symbol || "",
      contractType: c.contract_type || "",
      entryPrice: parseFloat(c.entry_tick) || 0,
      currentPrice: parseFloat(c.current_tick) || parseFloat(c.entry_tick) || 0,
      profit: parseFloat(c.profit) || 0,
      isOpen: c.is_sold === 0,
      duration: c.duration || "",
    };
    if (idx >= 0) this._positions[idx] = pos;
    else this._positions.push(pos);
    if (!pos.isOpen) this._positions = this._positions.filter(p => p.isOpen);
  }

  private async sendRaw(msg: Record<string, unknown>): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    const reqId = this.msgId++;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error("Deriv request timed out"));
      }, REQUEST_TIMEOUT);
      this.pending.set(reqId, { resolve, reject, timer });
      try { this.ws!.send(JSON.stringify({ ...msg, req_id: reqId })); }
      catch (e) { clearTimeout(timer); this.pending.delete(reqId); reject(e); }
    });
  }

  async ensureConnected(): Promise<this> {
    if (this.ws?.readyState === WebSocket.OPEN && this._authorized) return this;
    await this.connect();
    return this;
  }

  isAuthorized(): boolean {
    return this._authorized;
  }

  async refresh(): Promise<void> {
    try {
      const [balRes] = await Promise.allSettled([
        this.sendRaw({ balance: 1, account: "all" }),
      ]);
      if (balRes.status === "fulfilled") {
        const d = balRes.value;
        if (d.msg_type === "balance") {
          const list = d.balance?.accounts || [d.balance].filter(Boolean);
          const acct = list[0];
          if (acct) {
            this._account = {
              loginid: acct.loginid || "",
              balance: parseFloat(acct.balance) || 0,
              currency: acct.currency || "USD",
              accountType: (acct.account_type || "").toString().toLowerCase(),
            };
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  async getTickHistory(symbol: string, count = 100): Promise<{ price: number; timestamp: number }[]> {
    await this.ensureConnected();
    const sym = normalizeSymbol(symbol);
    const now = Math.floor(Date.now() / 1000);
    const start = now - count * 3;
    const res = await this.sendRaw({ ticks_history: sym, end: "latest", start, adjust_start_time: 1, count });
    if (res.error) throw new Error(res.error.message);
    const prices: number[] = res.history?.prices || [];
    const times: number[] = res.history?.times || [];
    return prices.map((p, i) => ({ price: p, timestamp: times[i] * 1000 }));
  }

  async closePosition(contractId: number): Promise<any> {
    await this.ensureConnected();
    const res = await this.sendRaw({ sell: contractId, price: 0 });
    if (res.error) throw new Error(res.error.message);
    this._positions = this._positions.filter(p => p.contractId !== contractId);
    return res.sell || res;
  }

  getSnapshot(): ConnectionSnapshot {
    const openPositions = this._positions.filter(p => p.isOpen);
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      authorized: this._authorized,
      account: this._account,
      positions: this._positions,
      openPositionCount: openPositions.length,
      totalUnrealizedPnl: openPositions.reduce((s, p) => s + p.profit, 0),
    };
  }

  disconnect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._authorized = false;
    this._account = null;
    this._positions = [];
    this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error("Disconnected")); });
    this.pending.clear();
  }
}

class DerivManager {
  private connections = new Map<number, DerivConnection>();

  async ensureConnected(userId: number): Promise<DerivConnection | null> {
    let conn = this.connections.get(userId);
    if (conn && conn.isAuthorized()) return conn;
    if (!conn) {
      const token = await db.getDerivTokenByUserId(userId);
      if (!token?.token) return null;
      conn = new DerivConnection(userId, token.token);
      this.connections.set(userId, conn);
    }
    try {
      await conn.ensureConnected();
      return conn;
    } catch {
      this.connections.delete(userId);
      return null;
    }
  }

  async getOrCreate(userId: number): Promise<void> {
    try { await this.ensureConnected(userId); } catch { /* best effort */ }
  }

  remove(userId: number): void {
    const conn = this.connections.get(userId);
    if (conn) {
      conn.disconnect();
      this.connections.delete(userId);
    }
  }
}

export const derivManager = new DerivManager();
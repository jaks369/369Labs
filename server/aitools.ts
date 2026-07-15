import { z } from 'zod';

const DERIV_APP_ID = Number(process.env.VITE_DERIV_APP_ID) || 1089;
let derivConnection: any = null;

async function ensureDerivWS() {
  if (derivConnection?.readyState === 1) return derivConnection;
  const { default: WebSocket } = await import('ws');
  derivConnection = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + DERIV_APP_ID);
  await new Promise<void>((res, rej) => { derivConnection.onopen = () => res(); derivConnection.onerror = rej; });
  return derivConnection;
}

async function sendDeriv(msg: Record<string, unknown>): Promise<any> {
  const ws = await ensureDerivWS();
  const reqId = Date.now();
  return new Promise((res, rej) => {
    const handler = (data: any) => {
      const d = JSON.parse(data.toString());
      if (d.req_id === reqId) { ws.removeListener('message', handler); res(d); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ ...msg, req_id: reqId }));
    setTimeout(() => { ws.removeListener('message', handler); rej(new Error('Timeout')); }, 10000);
  });
}

export async function getTickHistory(symbol: string, count = 100) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * 3;
  const res = await sendDeriv({ ticks_history: symbol, end: 'latest', start, adjust_start_time: 1, count });
  if (res.error) throw new Error(res.error.message);
  const prices: number[] = res.history?.prices || [];
  const times: number[] = res.history?.times || [];
  return prices.map((p, i) => ({ price: p, timestamp: times[i] * 1000 }));
}

export async function getActiveSymbols() {
  const res = await sendDeriv({ active_symbols: 'brief', product_type: 'all' });
  if (res.error) throw new Error(res.error.message);
  return (res.active_symbols || []).map((s: any) => ({ symbol: s.symbol, displayName: s.display_name || s.symbol }));
}

import { z } from 'zod';

const DERIV_APP_ID = Number(process.env.VITE_DERIV_APP_ID) || 1089;
let derivConnection: any = null;

const VALID_SYMBOLS = [
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
];

// Normalize common user inputs like "r10", "R10", "R 10", "1HZ10" -> proper Deriv symbol.
export function normalizeSymbol(input: string): string {
  if (!input) return input;
  let s = input.trim().toUpperCase().replace(/\s+/g, '');
  // R10 / R100 etc -> R_10 / R_100
  const rMatch = s.match(/^R(\d+)$/);
  if (rMatch) {
    const candidate = 'R_' + rMatch[1];
    if (VALID_SYMBOLS.includes(candidate)) return candidate;
  }
  // 1HZ10 / 1HZ100 (missing trailing V) -> add V if valid
  const hzMatch = s.match(/^1HZ(\d+)$/);
  if (hzMatch) {
    const candidate = '1HZ' + hzMatch[1] + 'V';
    if (VALID_SYMBOLS.includes(candidate)) return candidate;
  }
  return s;
}

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
  const sym = normalizeSymbol(symbol);
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * 3;
  const res = await sendDeriv({ ticks_history: sym, end: 'latest', start, adjust_start_time: 1, count });
  if (res.error) throw new Error(res.error.message);
  const prices: number[] = res.history?.prices || [];
  const times: number[] = res.history?.times || [];
  return prices.map((p, i) => ({ price: p, timestamp: times[i] * 1000 }));
}

export async function getActiveSymbols() {
  const res = await sendDeriv({ active_symbols: 'full' });
  if (res.error) throw new Error(res.error.message);
  const all = res.active_symbols || [];
  const mapped = all.map((s: any) => ({ symbol: s.symbol, displayName: s.display_name || s.symbol }));
  const filtered = mapped.filter((s: any) => VALID_SYMBOLS.includes(s.symbol));
  return filtered.length ? filtered : mapped;
}
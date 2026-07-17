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
  const rMatch = s.match(/^R(\d+)$/);
  if (rMatch) {
    const candidate = 'R_' + rMatch[1];
    if (VALID_SYMBOLS.includes(candidate)) return candidate;
  }
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

// --- Analytics tools (read-only, no auth required) ---

// Last-digit distribution + hot/cold digits for a symbol.
export async function getDigitStats(symbol: string, count = 100) {
  const ticks = await getTickHistory(symbol, count);
  if (!ticks.length) return { symbol: normalizeSymbol(symbol), count: 0, digits: {}, hottest: [], coldest: [] };
  const digits: Record<string, number> = {};
  for (const t of ticks) {
    const str = String(t.price).replace('.', '');
    const d = str[str.length - 1];
    digits[d] = (digits[d] || 0) + 1;
  }
  const sorted = Object.entries(digits).sort((a, b) => b[1] - a[1]);
  return {
    symbol: normalizeSymbol(symbol),
    count: ticks.length,
    digits,
    hottest: sorted.slice(0, 3).map(([d, c]) => ({ digit: d, count: c })),
    coldest: sorted.slice(-3).reverse().map(([d, c]) => ({ digit: d, count: c })),
  };
}

// Price trend: direction, change %, recent high/low.
export async function getTrend(symbol: string, count = 100) {
  const ticks = await getTickHistory(symbol, count);
  if (ticks.length < 2) return { symbol: normalizeSymbol(symbol), count: ticks.length };
  const prices = ticks.map(t => Number(t.price));
  const first = prices[0], last = prices[prices.length - 1];
  const high = Math.max(...prices), low = Math.min(...prices);
  const changePct = ((last - first) / first) * 100;
  const direction = changePct > 0.0001 ? 'up' : changePct < -0.0001 ? 'down' : 'flat';
  return {
    symbol: normalizeSymbol(symbol),
    count: ticks.length,
    first, last, high, low,
    changePct: Number(changePct.toFixed(4)),
    direction,
  };
}

// Suggest a strategy rule based on digit stats (over/under on hottest digit).
export async function suggestStrategy(symbol: string, count = 100) {
  const stats = await getDigitStats(symbol, count);
  if (!stats.hottest.length) return { symbol: normalizeSymbol(symbol), suggestion: 'Not enough data to suggest a strategy.' };
  const hot = stats.hottest[0].digit;
  const cold = stats.coldest[0]?.digit;
  return {
    symbol: normalizeSymbol(symbol),
    suggestion: `Based on the last ${stats.count} ticks, digit ${hot} is hottest and ${cold ?? 'n/a'} is coldest. Consider an "even/odd" or "matches/differs" contract targeting digit ${hot}, or fade the cold digit ${cold ?? ''}.`,
    hottest: stats.hottest,
    coldest: stats.coldest,
  };
}

// --- Action-intent tools (return structured intents; client executes + confirms) ---

export function buildActionIntent(action: string, params: Record<string, any>, requiresConfirm = true) {
  return { __action: true, action, params, requiresConfirm };
}

// Detect a natural-language "watch / scan / monitor" intent in free text, tolerating typos
// and loose phrasing. Returns null if no watch intent, else { symbol, durationMinutes, patternType }.
const WATCH_WORDS = ["watch", "scan", "monitor", "keep an eye", "keep eye", "look for", "look out for", "find setup", "find pattern", "track", "observe", "surveil"];
const PATTERN_WORDS: Record<string, string> = {
  streak: "digit_streak", streaky: "digit_streak", consecutive: "digit_streak",
  bias: "digit_bias", digit: "digit_bias", lastdigit: "digit_bias", "last digit": "digit_bias",
  parity: "even_odd_run", even: "even_odd_run", odd: "even_odd_run",
};

export function detectWatchIntent(text: string): { symbol: string; durationMinutes: number; patternType: string } | null {
  const lower = (text || "").toLowerCase();
  const hasWatch = WATCH_WORDS.some(w => lower.includes(w));
  if (!hasWatch) return null;

  // symbol: R50/R_50/volatility 50/1HZ10 etc
  let symbol: string | null = null;
  const rMatch = lower.match(/r\s?_?\s?(\d+)/);
  if (rMatch) { const cand = "R_" + rMatch[1]; if (VALID_SYMBOLS.includes(cand)) symbol = cand; }
  const hzMatch = lower.match(/1\s?hz\s?(\d+)/);
  if (!symbol && hzMatch) { const cand = "1HZ" + hzMatch[1] + "V"; if (VALID_SYMBOLS.includes(cand)) symbol = cand; }
  const volMatch = lower.match(/volatility\s*(\d+)/);
  if (!symbol && volMatch) { const cand = "R_" + volMatch[1]; if (VALID_SYMBOLS.includes(cand)) symbol = cand; }
  if (!symbol) return null;

  // duration: "30 min", "half hour", "1 hour", "for 20 minutes"
  let durationMinutes = 30;
  const numMin = lower.match(/(\d+)\s*(min|mins|minute|minutes)/);
  if (numMin) durationMinutes = Math.min(120, Math.max(5, parseInt(numMin[1], 10)));
  else if (lower.includes("half hour") || lower.includes("half an hour")) durationMinutes = 30;
  else if (lower.includes("hour") || lower.includes("1h") || lower.includes("an hour")) durationMinutes = 60;

  let patternType = "any";
  for (const key of Object.keys(PATTERN_WORDS)) { if (lower.includes(key)) { patternType = PATTERN_WORDS[key]; break; } }

  return { symbol, durationMinutes, patternType };
}
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'getTickHistory',
      description: 'Get recent tick prices for a Deriv symbol (e.g. R_10, R_50, R_100, 1HZ10V).',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, count: { type: 'number' } }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getActiveSymbols',
      description: 'List available Deriv symbols on 369Labs.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getDigitStats',
      description: 'Analyze last-digit distribution (hot/cold digits) for a symbol over recent ticks.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, count: { type: 'number' } }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTrend',
      description: 'Get price trend (direction, change %, high/low) for a symbol.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, count: { type: 'number' } }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggestStrategy',
      description: 'Suggest a trading rule/strategy for a symbol based on digit statistics.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, count: { type: 'number' } }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listStrategies',
      description: 'List the users saved strategies so they can pick one to deploy.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deployBot',
      description: 'Create a DRAFT bot from an insight, or deploy a saved strategy. To turn a plain-language insight into a bot, call with { name, description, rule } (no confirm needed) - this saves a draft the user starts manually. To start an existing saved bot, call with { strategyId, confirm: true } (requires user confirmation).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Bot name when creating from an insight' },
          description: { type: 'string' },
          rule: { type: 'object', description: 'StrategyRule object: { symbol, condition: { indicator: "last_digit" or "parity", comparison: "equals" or "appears_consecutively", count: number, barrier: number }, action: { tradeType: "buy_rise" or "buy_fall" }, params: { stake, stopLoss, takeProfit } }' },
          strategyId: { type: 'number' },
          symbol: { type: 'string' },
          stake: { type: 'number' },
          confirm: { type: 'boolean' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'placeTrade',
      description: 'Place a single manual trade on Deriv. Requires confirm=true, symbol, contractType, stake.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          symbol: { type: 'string' },
          contractType: { type: 'string', description: 'e.g. CALL, PUT, DIGITMATCH, DIGITDIFF' },
          stake: { type: 'number' },
          barrier: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['symbol', 'contractType', 'stake', 'confirm'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runBacktest',
      description: 'Run a backtest for a saved strategy over a date range. Returns an intent the app executes.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          strategyId: { type: 'number' },
          symbol: { type: 'string' },
          start: { type: 'string', description: 'ISO date or epoch seconds' },
          end: { type: 'string', description: 'ISO date or epoch seconds' },
        },
        required: ['strategyId', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'startWatch',
      description: 'Tell 369AI to watch a symbol and discover repeatable trading patterns (signals) with evidence. Use when the user asks to watch, look for patterns, find setups, or scan a market.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          symbol: { type: 'string' },
          durationMinutes: { type: 'number', description: 'How long to watch (minutes). Default 30.' },
          patternType: { type: 'string', description: 'digit_streak | digit_bias | even_odd_run | any' },
          minWinRate: { type: 'number', description: 'Minimum win-rate percent to record a signal (default 62)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listSignals',
      description: 'List AI-discovered trading signals (the Marketplace feed) for the user, optionally filtered by symbol.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { symbol: { type: 'string' } },
      },
    },
  },
];
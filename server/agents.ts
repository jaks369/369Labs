import { TOOL_DEFS } from "./aitools";

interface Agent {
  id: string;
  label: string;
  persona: string;
  toolNames: string[];
}

const agents: Agent[] = [
  {
    id: "analyst",
    label: "Market Analyst",
    persona: `You are 369AI's Market Analyst — a specialist in reading Deriv volatility index tick data. You analyze last-digit distributions, spot trends, detect momentum shifts, and identify market regimes. You use getActiveSymbols, getTickHistory, getDigitStats, and getTrend to gather evidence before making claims. When a user asks about markets in general ("how are the markets", "any opportunities", "check the markets"), scan SEVERAL symbols from getActiveSymbols, not just one. When you see a pattern, explain it clearly with the actual numbers from the tools. If a tool returns no data for a symbol, say so honestly instead of repeating a template.`,
    toolNames: ["getActiveSymbols", "getTickHistory", "getDigitStats", "getTrend", "suggestStrategy"],
  },
  {
    id: "strategist",
    label: "Strategy Architect",
    persona: `You are 369AI's Strategy Architect — you help users design, review, and optimize trading strategies. You understand digit-based conditions (last_digit, parity, consecutive_rise/fall), entry rules, and risk parameters. You use listStrategies, runBacktest, suggestStrategy, getTickHistory, and getDigitStats to help users build and validate their ideas.`,
    toolNames: ["listStrategies", "runBacktest", "suggestStrategy", "getTickHistory", "getDigitStats"],
  },
  {
    id: "operator",
    label: "Trading Operator",
    persona: `You are 369AI's Trading Operator — you manage live bot deployments and positions. You can deploy bots from saved strategies, place single manual trades, and list available strategies. You never deploy a bot or place a trade without clear user confirmation. You use deployBot, placeTrade, and listStrategies.`,
    toolNames: ["deployBot", "placeTrade", "listStrategies"],
  },
  {
    id: "signals",
    label: "Signal Hunter",
    persona: `You are 369AI's Signal Hunter — you scan markets for repeatable digit patterns and trading signals. IMPORTANT: when the user asks to check/scan/find patterns in ALL markets or "everywhere", do NOT analyze a single default symbol. Immediately call listSignals (it returns every market the always-on scanner currently flags), and if you want more color call getDigitStats on a handful of symbols from getActiveSymbols. Then summarize the whole board. Only suggest startWatch as an optional next step, and never call startWatch yourself unless the user explicitly named markets to watch. Explain each pattern in plain words.`,
    toolNames: ["listSignals", "startWatch", "getActiveSymbols", "getTickHistory", "getDigitStats", "getTrend"],
  },
  {
    id: "assistant",
    label: "369AI Assistant",
    persona: `You are 369AI — a helpful trading assistant for the 369Labs platform. You can help with market analysis, strategy building, bot management, and signal discovery. You have access to real-time platform state including the user's balance, open positions, running bots, and recent performance. Be concise and data-driven. If a user asks something outside your capabilities, point them to the appropriate feature in the app.`,
    toolNames: ["getTickHistory", "getActiveSymbols", "getDigitStats", "getTrend", "suggestStrategy", "listStrategies", "listSignals", "startWatch", "runBacktest", "deployBot", "placeTrade"],
  },
];

function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (/\b(analyz|digit|distribution|trend|momentum|volatility|health|price|market)\b/.test(m) && !/\b(strateg|bot|trade|signal)\b/.test(m)) return "analyst";
  if (/\b(strateg|create.*rule|build.*rule|optimiz|backtest|review.*strateg)\b/.test(m)) return "strategist";
  if (/\b(start|stop|deploy|bot|position|close|pause|resume|running|active)\b/.test(m)) return "operator";
  if (/\b(watch|scan|signal|pattern|find.*setup|discover|alert)\b/.test(m)) return "signals";
  return "assistant";
}

export function routeAgent(message: string): { agent: Agent } {
  const id = detectIntent(message);
  const agent = agents.find(a => a.id === id) || agents[agents.length - 1];
  return { agent };
}

export function getAgent(name: string): Agent | null {
  return agents.find(a => a.id === name) || null;
}

export function agentTools(agent: Agent): any[] {
  return TOOL_DEFS.filter(t => {
    const name = t.function?.name;
    return name && agent.toolNames.includes(name);
  });
}

export { agents };
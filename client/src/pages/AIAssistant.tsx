import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Brain, Send, Bot, Sparkles, Code, LineChart, ShieldCheck, Zap, Loader2, ChevronDown, ChevronRight, Wrench, Activity, CandlestickChart } from "lucide-react";
import { useLocation } from "wouter";
import { derivWS } from "@/services/derivWebSocket";

interface Message { role: "user" | "ai"; content: string; steps?: any[]; }
interface PendingAction { action: string; params: any; }

const ACCENT = "text-amber-400";
const ACCENT_BG = "bg-amber-400/10";
const ACCENT_BORDER = "border-amber-400/30";

export default function AIAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "369AI online. I analyze live Deriv ticks, suggest strategies, and can place trades or run backtests on your say-so. What are we trading today?" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingLabel, setTypingLabel] = useState("Analyzing");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const askMutation = trpc.ai.ask.useMutation();
  const strategiesQuery = trpc.strategies.list.useQuery();
  const chatIdRef = useRef("main");

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;
    const userMsg: Message = { role: "user", content: input };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    setTypingLabel("Analyzing");
    try {
      const history = nextMessages
        .slice(1)
        .map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      // light up the thinking label based on likely intent
      if (/trend|digit|hot|cold|price|analy|stat/i.test(input)) setTypingLabel("Reading ticks");
      else if (/strateg|bot|rule|suggest/i.test(input)) setTypingLabel("Forming strategy");
      else if (/trade|buy|sell|place/i.test(input)) setTypingLabel("Preparing order");
      else if (/backtest/i.test(input)) setTypingLabel("Simulating");
      const res = await askMutation.mutateAsync({ message: input, history, chatId: chatIdRef.current });
      const aiMsg: Message = { role: "ai", content: res.reply, steps: res.steps };
      setMessages(prev => [...prev, aiMsg]);
      if (res.action) setPending(res.action);
    } catch {
      setMessages(prev => [...prev, { role: "ai", content: "Connection dropped. Try again." }]);
    } finally { setIsTyping(false); }
  }, [input, isTyping, askMutation, messages]);

  const executeAction = useCallback(async () => {
    if (!pending) return;
    const a = pending;
    setPending(null);
    try {
      if (a.action === "placeTrade") {
        if (!derivWS.isAuthorized()) { setMessages(prev => [...prev, { role: "ai", content: "Not connected to Deriv. Add your API token in Settings first." }]); return; }
        const r = await derivWS.purchaseContract({
          symbol: a.params.symbol,
          contractType: a.params.contractType,
          amount: a.params.stake,
          duration: 1,
          durationUnit: "t",
          barrier: a.params.barrier !== undefined ? Number(a.params.barrier) : undefined,
        });
        setMessages(prev => [...prev, { role: "ai", content: `Order filled: ${a.params.symbol} ${a.params.contractType} (contract ${r.contractId}).` }]);
      } else if (a.action === "deployBot") {
        const strat = strategiesQuery.data?.find((s: any) => s.id === a.params.strategyId);
        setMessages(prev => [...prev, { role: "ai", content: `Bot "${strat?.name ?? a.params.strategyId}" armed for ${a.params.symbol || "default symbol"} @ stake ${a.params.stake}. Open Bots to monitor.` }]);
        navigate("/bots");
      } else if (a.action === "runBacktest") {
        setMessages(prev => [...prev, { role: "ai", content: `Spinning up backtest: strategy ${a.params.strategyId} on ${a.params.symbol}...` }]);
        navigate("/backtesting");
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "ai", content: "Action failed: " + String(e?.message || e) }]);
    }
  }, [pending, strategiesQuery, navigate]);

  const suggestions = [
    "What's the hottest digit on R_50 right now?",
    "Suggest a strategy for R_100 from recent ticks",
    "Show the trend on 1HZ10V",
    "Run a backtest on my strategy",
  ];

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] lg:h-screen bg-[#0D1117]">
      <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-[#0D1117]/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${ACCENT_BG} rounded-xl flex items-center justify-center ${ACCENT_BORDER}`}>
            <CandlestickChart className={`w-6 h-6 ${ACCENT}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">369<span className={ACCENT}>AI</span></h1>
            <p className={`text-xs font-medium flex items-center gap-1.5 ${ACCENT}`}>
              <Activity className="w-3 h-3" /> LIVE DERIV FEED &middot; analyzing ticks
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">System Online</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex gap-4 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${msg.role === "ai" ? `${ACCENT_BG} ${ACCENT_BORDER}` : "bg-slate-800 border-slate-700"}`}>
                  {msg.role === "ai" ? <CandlestickChart className={`w-4 h-4 ${ACCENT}`} /> : <div className="text-[10px] font-bold text-white">{user?.name?.charAt(0)}</div>}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${msg.role === "ai" ? "bg-[#161B22] border border-[#30363D] text-slate-200 border-l-2 border-l-amber-400/60" : "bg-amber-500 text-black font-medium"}`}>
                  {msg.content}
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-3 border-t border-[#30363D] pt-2">
                      <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-amber-400">
                        {expanded[i] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} <Wrench className="w-3 h-3" /> {msg.steps.length} tool step{msg.steps.length > 1 ? "s" : ""}
                      </button>
                      {expanded[i] && (
                        <div className="mt-2 space-y-1 text-[11px] font-mono">
                          {msg.steps.map((s: any, j: number) => (
                            <div key={j} className="rounded bg-black/40 p-2 border border-[#30363D]">
                              <span className="text-emerald-400">{">"} {s.tool}</span>
                              <span className="text-slate-500">({JSON.stringify(s.args)})</span>
                              <span className="text-amber-400"> {"=>"} {s.result?.__action ? "ACTION" : "ok"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-[80%]">
                <div className={`w-8 h-8 rounded-lg ${ACCENT_BG} ${ACCENT_BORDER} flex items-center justify-center`}>
                  <CandlestickChart className={`w-4 h-4 ${ACCENT} animate-pulse`} />
                </div>
                <div className="p-4 rounded-2xl bg-[#161B22] border border-[#30363D] flex items-center gap-2 text-xs text-amber-400 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" /> 369AI is {typingLabel.toLowerCase()}...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="p-4 border-t border-amber-500/30 bg-amber-500/5">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-xs text-amber-300 font-mono">
              <span className="font-bold uppercase">{pending.action}</span> {JSON.stringify(pending.params)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPending(null)} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700">Cancel</button>
              <button onClick={executeAction} className="px-3 py-1.5 rounded bg-amber-500 text-black text-xs font-bold hover:bg-amber-400">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 border-t border-[#30363D] bg-[#0D1117]">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length < 3 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)} className="whitespace-nowrap px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:border-amber-400 hover:text-amber-300 transition-all">{s}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask 369AI to analyze, suggest, or act..."
              className="w-full bg-[#161B22] border-[#30363D] rounded-xl pl-4 pr-12 py-4 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all resize-none h-14"
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            <div className="flex items-center gap-1.5"><Code className="w-3 h-3" /> Strategy Generation</div>
            <div className="flex items-center gap-1.5"><LineChart className="w-3 h-3" /> Market Analysis</div>
            <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Risk Management</div>
          </div>
        </div>
      </div>
    </div>
  );
}
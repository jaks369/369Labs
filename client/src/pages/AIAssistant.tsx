import { useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Brain, Send, Bot, Sparkles, Code, LineChart, ShieldCheck, Zap, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface Message { role: "user" | "ai"; content: string; }

export default function AIAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "Hello! I am 369AI, your personal trading strategist. How can I help you build or optimize your bots today?" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const askMutation = trpc.ai.ask.useMutation();

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;
    const userMsg: Message = { role: "user", content: input };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    try {
      // Build conversation history (skip the initial greeting) for context.
      const history = nextMessages
        .slice(1)
        .map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      const res = await askMutation.mutateAsync({ message: input, history });
      setMessages(prev => [...prev, { role: "ai", content: res.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", content: "Sorry, I encountered an error. Please try again." }]);
    } finally { setIsTyping(false); }
  }, [input, isTyping, askMutation, messages]);

  const suggestions = [
    "Build a Boom & Crash strategy using RSI and EMA",
    "How do I run a backtest?",
    "Explain the Martingale money management system",
    "How to connect my Deriv API token?"
  ];

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] lg:h-screen bg-[#0D1117]">
      <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-[#0D1117]/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-600/20">
            <Brain className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">369AI Assistant</h1>
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" /> Powered by 369Labs Trading Engine
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
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${msg.role === "ai" ? "bg-blue-600/10 border-blue-600/20" : "bg-slate-800 border-slate-700"}`}>
                  {msg.role === "ai" ? <Bot className="w-4 h-4 text-blue-500" /> : <div className="text-[10px] font-bold text-white">{user?.name?.charAt(0)}</div>}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${msg.role === "ai" ? "bg-[#161B22] border border-[#30363D] text-slate-200" : "bg-blue-600 text-white"}`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-[80%]">
                <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                </div>
                <div className="p-4 rounded-2xl bg-[#161B22] border border-[#30363D] flex gap-1">
                  <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" />
                  <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-[#30363D] bg-[#0D1117]">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length < 3 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)} className="whitespace-nowrap px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:border-blue-500 hover:text-white transition-all">{s}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type your trading request..."
              className="w-full bg-[#161B22] border-[#30363D] rounded-xl pl-4 pr-12 py-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none h-14"
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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

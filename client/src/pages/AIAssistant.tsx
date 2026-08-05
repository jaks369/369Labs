import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Send, LineChart, ShieldCheck, Loader2, ChevronDown, ChevronRight, Wrench, Activity, CandlestickChart, BookOpen, Bell, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { derivWS } from "@/services/derivWebSocket";
import { pushTimeline } from "@/components/AITimeline";
import { getSymbolDisplayName } from "@/lib/symbols";
import { toast } from "@/components/Toast";
import MarketAnalysisView from "@/components/MarketAnalysisView";
import RiskManagementView from "@/components/RiskManagementView";

interface Message { role: "user" | "ai"; content: string; steps?: any[]; }
interface PendingAction { action: string; params: any; }

const ACCENT = "text-[var(--accent)]";
const ACCENT_BG = "bg-[var(--accent-soft)]";
const ACCENT_BORDER = "border-[var(--accent-border)]";

export default function AIAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"chat" | "journal" | "alerts" | "schedule" | "analysis" | "risk">("chat");
  const [viewSymbol, setViewSymbol] = useState("R_100");
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "369AI online. I analyze live Deriv ticks, suggest strategies, and can place trades or run backtests on your say-so. What are we trading today?" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingLabel, setTypingLabel] = useState("Analyzing");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [reveal, setReveal] = useState<Record<number, number>>({});
  const askMutation = trpc.ai.ask.useMutation();
  const strategiesQuery = trpc.strategies.list.useQuery();
  const saveStrategyMutation = trpc.strategies.save.useMutation();
  const journalMutation = trpc.ai.journalEntry.useMutation();
  const alertMutation = trpc.ai.aiAlert.useMutation();
  const scheduleMutation = trpc.ai.aiScheduledAnalysis.useMutation();
  const journalListQuery = trpc.ai.aiJournalList.useQuery(undefined, { enabled: tab === "journal" });
  const alertListQuery = trpc.ai.aiAlertList.useQuery(undefined, { enabled: tab === "alerts" });
  const scheduleListQuery = trpc.ai.aiScheduleList.useQuery(undefined, { enabled: tab === "schedule" });
  const chatIdRef = useRef("main");
  const historyQuery = trpc.ai.history.useQuery({ chatId: chatIdRef.current });

  // Seed messages from persisted history on first load.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (historyQuery.isLoading) return;
    seededRef.current = true;
    const hist = historyQuery.data || [];
    if (hist.length > 0) {
      const seeded = hist.map((m: any) => ({ role: m.role, content: m.content, steps: m.steps }));
      setMessages(seeded);
      const full: Record<number, number> = {};
      seeded.forEach((m: any, idx: number) => { full[idx] = m.content.length; });
      setReveal(full);
    }
  }, [historyQuery.data, historyQuery.isLoading]);

  const handleSend = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isTyping) return;
    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    setTypingLabel("Analyzing");
    pushTimeline({ icon: "ai", text: `369AI: ${text.length > 60 ? text.slice(0, 60) + "…" : text}` });
    try {
      const history = nextMessages
        .slice(1)
        .map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      // light up the thinking label based on likely intent
      if (/trend|digit|hot|cold|price|analy|stat/i.test(text)) setTypingLabel("Reading ticks");
      else if (/strateg|bot|rule|suggest/i.test(text)) setTypingLabel("Forming strategy");
      else if (/trade|buy|sell|place/i.test(text)) setTypingLabel("Preparing order");
      else if (/backtest/i.test(text)) setTypingLabel("Simulating");
      const res = await askMutation.mutateAsync({ message: text, history, chatId: chatIdRef.current });
      const aiMsg: Message = { role: "ai", content: res.reply, steps: res.steps };
      setMessages(prev => {
        const next = [...prev, aiMsg];
        const idx = next.length - 1;
        // Progressive (streaming-style) reveal of the reply.
        setReveal(r => ({ ...r, [idx]: 0 }));
        let n = 0;
        const full = aiMsg.content;
        const timer = setInterval(() => {
          n += Math.max(3, Math.round(full.length / 60));
          if (n >= full.length) { clearInterval(timer); setReveal(r => ({ ...r, [idx]: full.length })); }
          else setReveal(r => ({ ...r, [idx]: n }));
        }, 16);
        return next;
      });
      if (res.action) setPending(res.action);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Connection error.';
      let isProviderError = errorMessage.toLowerCase().includes('ai') || errorMessage.toLowerCase().includes('api') || errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('fetch');
      // Store the failed message so user can retry
      const failedMsg = text;
      setMessages(prev => [...prev, {
        role: "ai",
        content: isProviderError
          ? `⚠️ AI provider error: ${errorMessage}\n\nTap "Retry" below to try again.`
          : `⚠️ Error: ${errorMessage}`
      }]);
      // Store the failed attempt for retry
      setInput(failedMsg);
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
        const entrySuffix = r.entrySpot !== undefined ? ` at ${Number(r.entrySpot).toFixed(2)}` : "";
        setMessages(prev => [...prev, { role: "ai", content: `Order filled: ${a.params.symbol} ${a.params.contractType} (contract ${r.contractId})${entrySuffix}.` }]);
      } else if (a.action === "deployBot") {
        try {
          const saved = await saveStrategyMutation.mutateAsync({
            name: a.params.strategyName || `AI Bot - ${a.params.symbol || "default"}`,
            description: `Deployed by AI Assistant on ${a.params.symbol || "default"} @ $${a.params.stake || 1}`,
            config: { rule: { symbol: a.params.symbol || "R_100", params: { stake: a.params.stake || 1 } } },
          });
          setMessages(prev => [...prev, { role: "ai", content: `Bot "${saved.name}" deployed for ${a.params.symbol || "default symbol"} @ stake $${a.params.stake || 1}. Open Bots to monitor.` }]);
        } catch { setMessages(prev => [...prev, { role: "ai", content: "Failed to deploy bot. Check your strategy configuration." }]); }
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
    <div className="flex flex-col h-dvh aurora-glass">
      <div className="p-4 md:p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${ACCENT_BG} rounded-xl flex items-center justify-center ${ACCENT_BORDER}`}>
            <CandlestickChart className={`w-6 h-6 ${ACCENT}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">369<span className={ACCENT}>AI</span></h1>
            <p className={`text-xs font-medium flex items-center gap-1.5 ${ACCENT}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" /> LIVE DERIV FEED &middot; analyzing ticks
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-[var(--green-soft)] border border-[var(--green)]/20 text-micro text-price-up font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" /> System Online</div>
        </div>
      </div>

      {/* Automation Tabs */}
      <div className="flex gap-1 px-4 md:px-6 pt-2 border-b border-[var(--border)]">
        {([
          { id: "chat" as const, label: "Chat", icon: CandlestickChart },
          { id: "analysis" as const, label: "Market Analysis", icon: LineChart },
          { id: "risk" as const, label: "Risk Management", icon: ShieldCheck },
          { id: "journal" as const, label: "Auto Journal", icon: BookOpen },
          { id: "alerts" as const, label: "AI Alerts", icon: Bell },
          { id: "schedule" as const, label: "Scheduler", icon: Clock },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${tab === t.id ? "text-[var(--accent)] border-[var(--accent)]" : "text-[var(--text-muted)] border-transparent hover:text-white"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {tab === "chat" && messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex gap-4 max-w-[90%] md:max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${msg.role === "ai" ? `${ACCENT_BG} ${ACCENT_BORDER}` : "bg-[var(--card)] border-[var(--border)]"}`}>
                  {msg.role === "ai" ? <CandlestickChart className={`w-4 h-4 ${ACCENT}`} /> : <div className="text-caption font-bold text-white">{user?.name?.charAt(0)}</div>}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${msg.role === "ai" ? "bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] border-l-2 border-l-accent/60" : "bg-[var(--accent)] text-black font-medium"}`}>
                  {msg.content.slice(0, reveal[i] ?? msg.content.length)}{reveal[i] !== undefined && reveal[i] < msg.content.length ? <span className="inline-block w-1.5 h-3 bg-[var(--accent)] ml-0.5 align-middle animate-pulse" /> : null}
                  {msg.role === "ai" && msg.content.includes('"Retry"') && input ? (
                    <div className="mt-3">
                      <button onClick={() => handleSend(input)} disabled={isTyping} className="px-3 py-1.5 rounded bg-[var(--accent)] text-black text-xs font-bold hover:bg-[var(--accent)] transition-colors disabled:opacity-50">
                        {isTyping ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Retrying...</> : "Retry"}
                      </button>
                    </div>
                  ) : null}
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-3 border-t border-[var(--border)] pt-2">
                      <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))} className="flex items-center gap-1 text-micro hover:text-[var(--accent)]">
                        {expanded[i] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} <Wrench className="w-3 h-3" /> {msg.steps.length} tool step{msg.steps.length > 1 ? "s" : ""}
                      </button>
                      {expanded[i] && (
                        <div className="mt-2 space-y-1 text-caption text-mono">
                          {msg.steps.map((s: any, j: number) => (
                            <div key={j} className="rounded bg-black/40 p-2 border border-[var(--border)]">
                              <span className="text-[var(--green)]">{">"} {s.tool}</span>
                              <span className="text-[var(--text-muted)]">({JSON.stringify(s.args)})</span>
                              <span className="text-[var(--accent)]"> {"=>"} {s.result?.__action ? "ACTION" : "ok"}</span>
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
          {tab === "chat" && isTyping && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-[90%] md:max-w-[80%]">
                <div className={`w-8 h-8 rounded-lg ${ACCENT_BG} ${ACCENT_BORDER} flex items-center justify-center`}>
                  <CandlestickChart className={`w-4 h-4 ${ACCENT} animate-pulse`} />
                </div>
                <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] flex items-center gap-2 text-xs text-[var(--accent)] font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" /> 369AI is {typingLabel.toLowerCase()}...
                </div>
              </div>
            </div>
          )}

          {tab === "analysis" && (
            <MarketAnalysisView symbol={viewSymbol} onSymbolChange={setViewSymbol} />
          )}

          {tab === "risk" && (
            <RiskManagementView symbol={viewSymbol} onSymbolChange={setViewSymbol} />
          )}

          {tab === "journal" && (
            <div className="space-y-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--accent)]" /> Automated Journal Entry</h3>
                <button onClick={() => journalMutation.mutateAsync({ strategyId: undefined }).then(() => { toast("Journal entry generated", "success"); journalListQuery.refetch(); }).catch(() => toast("Failed", "error"))} disabled={journalMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold">
                  {journalMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Generating...</> : "Generate AI Journal Entry"}
                </button>
              </div>
              <div className="space-y-2">
                {(journalListQuery.data?.entries || []).map((entry: any) => (
                  <div key={entry.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-xs">
                    <p className="text-caption mb-1">{new Date(entry.createdAt).toLocaleString()}</p>
                    <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{entry.content}</p>
                  </div>
                ))}
                {journalListQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] mx-auto" />}
              </div>
            </div>
          )}

          {tab === "alerts" && (
            <div className="space-y-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Bell className="w-4 h-4 text-[var(--accent)]" /> AI-Triggered Alert</h3>
                <button onClick={() => alertMutation.mutateAsync({ message: "Market alert from 369AI", symbol: "R_100", type: "volatility" }).then(() => { toast("Alert triggered", "success"); alertListQuery.refetch(); }).catch(() => toast("Failed", "error"))} disabled={alertMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold">
                  {alertMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Sending...</> : "Trigger AI Alert"}
                </button>
              </div>
              <div className="space-y-2">
                {(alertListQuery.data?.alerts || []).map((alert: any) => (
                  <div key={alert.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${alert.type === "volatility" ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{alert.type}</span>
                      <span className="text-[var(--text-muted)]">{getSymbolDisplayName(alert.symbol)}</span>
                      <span className="ml-auto text-caption">{new Date(alert.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-[var(--text-secondary)]">{alert.message}</p>
                  </div>
                ))}
                {alertListQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] mx-auto" />}
              </div>
            </div>
          )}

          {tab === "schedule" && (
            <div className="space-y-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-[var(--accent)]" /> Scheduled Analysis</h3>
                <button onClick={() => scheduleMutation.mutateAsync({ symbol: "R_100", interval: "1h", prompt: "Market overview" }).then(() => { toast("Scheduled analysis created", "success"); scheduleListQuery.refetch(); }).catch(() => toast("Failed", "error"))} disabled={scheduleMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-bold">
                  {scheduleMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Creating...</> : "Schedule Hourly Analysis"}
                </button>
              </div>
              <div className="space-y-2">
                {(scheduleListQuery.data?.schedules || []).map((sched: any) => (
                  <div key={sched.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[var(--accent)] font-bold uppercase text-caption">{sched.interval}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${sched.status === "active" ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--text-muted)] text-white"}`}>{sched.status}</span>
                    </div>
                    <p className="text-[var(--text-secondary)]">{sched.query}</p>
                  </div>
                ))}
                {scheduleListQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] mx-auto" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="p-4 border-t border-[var(--accent-border)] bg-[var(--accent)]/5">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-xs text-[var(--accent)] font-mono">
              <span className="font-bold uppercase">{pending.action}</span> {JSON.stringify(pending.params)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPending(null)} className="px-3 py-1.5 rounded bg-[var(--card)] text-[var(--text-secondary)] text-xs hover:bg-[var(--border)]">Cancel</button>
              <button onClick={executeAction} className="px-3 py-1.5 rounded bg-[var(--accent)] text-black text-xs font-bold hover:bg-[var(--accent)]">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 md:p-6 border-t border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-4xl mx-auto space-y-4">
          {tab === "chat" && messages.length < 3 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)} className="whitespace-nowrap px-4 py-2 rounded-full bg-[var(--card)] border border-[var(--card)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">{s}</button>
              ))}
            </div>
          )}
          {tab === "chat" && (
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask 369AI to analyze, suggest, or act..."
              className="w-full bg-[var(--card)] border-[var(--border)] rounded-xl pl-4 pr-12 py-4 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all resize-none h-14"
            />
            <button onClick={() => handleSend()} disabled={!input.trim() || isTyping} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 text-micro">
            <button onClick={() => setTab("analysis")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${tab === "analysis" ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--card)] border-[var(--card)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
              <LineChart className="w-3 h-3" /> Market Analysis
            </button>
            <button onClick={() => setTab("risk")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${tab === "risk" ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--card)] border-[var(--card)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
              <ShieldCheck className="w-3 h-3" /> Risk Management
            </button>
          </div>
          <p className="text-[9px] text-[var(--text-muted)] text-center leading-relaxed">
            369AI responses are model estimates, not financial advice. Any trade placed by the assistant is based on your explicit confirmation and your settings.
          </p>
        </div>
      </div>
    </div>
  );
}

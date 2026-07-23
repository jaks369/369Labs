import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sparkles, MessageSquare, Trash2, BrainCircuit, Settings2 } from "lucide-react";
import AIChatMessage from "./AIChatMessage";
import AIChatInput from "./AIChatInput";
import AIQuickQuestions from "./AIQuickQuestions";
import type { ChatMessage, ChatResponse } from "../../../server/ai/AIChatEngine";

export default function AIChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickQuestionsQuery = trpc.aiChat.quickQuestions.useQuery();
  const historyQuery = trpc.aiChat.conversationHistory.useQuery();
  const sendMessageMutation = trpc.aiChat.sendMessage.useMutation();
  const clearConversationMutation = trpc.aiChat.clearConversation.useMutation();
  const memoryQuery = trpc.aiChat.memory.useQuery({}, { enabled: false });
  const knowledgeTypesQuery = trpc.aiChat.knowledgeTypes.useQuery();
  const modelConfigQuery = trpc.aiChat.modelConfig.useQuery();
  const setModelConfigMutation = trpc.aiChat.setModelConfig.useMutation();

  const [showMemory, setShowMemory] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [memoryType, setMemoryType] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const memorySearchQuery = trpc.aiChat.memory.useQuery({ type: memoryType || undefined, search: memorySearch || undefined, limit: 50 }, { enabled: showMemory });
  const [modelProvider, setModelProvider] = useState("");
  const [modelName, setModelName] = useState("");

  useEffect(() => {
    if (historyQuery.data) setMessages(historyQuery.data);
  }, [historyQuery.data]);

  useEffect(() => {
    if (modelConfigQuery.data) {
      setModelProvider(modelConfigQuery.data.provider);
      setModelName(modelConfigQuery.data.model);
    }
  }, [modelConfigQuery.data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (message: string) => {
    const userMsg: ChatMessage = { role: "user", content: message, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const response: ChatResponse = await sendMessageMutation.mutateAsync({ message });
      const aiMsg: ChatMessage = { role: "assistant", content: response.answer, response, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = { role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: Date.now() };
      setMessages((prev) => [...prev, errorMsg]);
    }
    setLoading(false);
  };

  const clearConversation = async () => {
    await clearConversationMutation.mutateAsync();
    setMessages([]);
  };

  const saveModelConfig = async () => {
    await setModelConfigMutation.mutateAsync({ provider: modelProvider, model: modelName });
    setShowModelConfig(false);
  };

  return (
    <div className="surface-elevated flex flex-col h-[600px]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="text-xs font-bold text-white">369AI Chat</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">Conversational Copilot</span>
        <button onClick={() => { setShowMemory(true); memoryQuery.refetch(); }} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[var(--text-secondary)] hover:text-white border border-[var(--border)] hover:border-[var(--cyan)]/50 transition-all">
          <BrainCircuit className="w-3 h-3" /> Memory
        </button>
        <button onClick={() => setShowModelConfig(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[var(--text-secondary)] hover:text-white border border-[var(--border)] hover:border-[var(--cyan)]/50 transition-all">
          <Settings2 className="w-3 h-3" /> Model
        </button>
        {messages.length > 0 && (
          <button onClick={clearConversation} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[var(--text-secondary)] hover:text-red-400 border border-[var(--border)] hover:border-red-400/50 transition-all">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <AIQuickQuestions questions={quickQuestionsQuery.data || []} onSelect={handleSend} loading={loading} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="w-8 h-8 text-[var(--border)] mb-2" />
            <p className="text-[10px] text-[var(--text-muted)] max-w-xs">
              Ask me anything about your trading — trades, strategies, market conditions, AI performance, or your current session.
            </p>
          </div>
        )}
        {messages.map((msg, i) => <AIChatMessage key={i} {...msg} />)}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--cyan-soft)] border-[var(--cyan)]/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[var(--cyan)]" />
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl rounded-tl-sm px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[var(--cyan)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-[var(--cyan)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-[var(--cyan)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <AIChatInput onSend={handleSend} loading={loading} />

      {showMemory && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowMemory(false)}>
          <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-[var(--cyan)]" /> AI Memory</h3>
              <button onClick={() => setShowMemory(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-3 border-b border-[var(--border)] flex gap-2">
              <select value={memoryType} onChange={(e) => setMemoryType(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white outline-none">
                <option value="">All Types</option>
                {(knowledgeTypesQuery.data?.types || []).map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input value={memorySearch} onChange={(e) => setMemorySearch(e.target.value)} placeholder="Search memory..." className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white outline-none placeholder-[var(--text-muted)]" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {memorySearchQuery.isLoading ? (
                <div className="flex justify-center py-4"><Sparkles className="w-4 h-4 text-[var(--amber)] animate-spin" /></div>
              ) : (memorySearchQuery.data?.entries || []).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-4">No memory entries found.</p>
              ) : (
                (memorySearchQuery.data?.entries || []).map((entry: any) => (
                  <div key={entry.id} className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[10px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--amber)] font-bold">{entry.knowledgeType}</span>
                      {entry.symbol && <span className="text-[var(--cyan)]">{entry.symbol}</span>}
                      <span className="ml-auto text-[var(--text-muted)]">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <pre className="text-[var(--text-secondary)] whitespace-pre-wrap font-mono text-[9px]">{JSON.stringify(entry.data, null, 1).slice(0, 300)}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showModelConfig && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModelConfig(false)}>
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Settings2 className="w-4 h-4 text-[var(--cyan)]" /> AI Model Configuration</h3>
              <button onClick={() => setShowModelConfig(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Provider</label>
                <select value={modelProvider} onChange={(e) => setModelProvider(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white mt-1 outline-none">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google AI</option>
                  <option value="mistral">Mistral</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Model Name</label>
                <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g. gpt-4o-mini, claude-3-haiku" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white mt-1 outline-none" />
              </div>
              <p className="text-[9px] text-[var(--text-muted)]">Set AI_API_KEY and AI_API_BASE_URL in your environment. Model config is saved per-user.</p>
              <button onClick={saveModelConfig} className="w-full py-2 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold hover:bg-[var(--cyan)]">
                Save Model Config
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

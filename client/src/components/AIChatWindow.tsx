import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sparkles, MessageSquare } from "lucide-react";
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

  useEffect(() => {
    if (historyQuery.data) setMessages(historyQuery.data);
  }, [historyQuery.data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (message: string) => {
    const userMsg: ChatMessage = { role: "user", content: message, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response: ChatResponse = await sendMessageMutation.mutateAsync({ message });
      const aiMsg: ChatMessage = {
        role: "assistant",
        content: response.answer,
        response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setLoading(false);
  };

  return (
    <div className="surface-elevated flex flex-col h-[600px]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="text-xs font-bold text-white">369AI Chat</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">Conversational Copilot</span>
      </div>

      <AIQuickQuestions
        questions={quickQuestionsQuery.data || []}
        onSelect={handleSend}
        loading={loading}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="w-8 h-8 text-[var(--border)] mb-2" />
            <p className="text-[10px] text-[var(--text-muted)] max-w-xs">
              Ask me anything about your trading ΓÇö trades, strategies, market conditions, AI performance, or your current session.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <AIChatMessage key={i} {...msg} />
        ))}
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
    </div>
  );
}

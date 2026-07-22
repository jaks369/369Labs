import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface AIChatInputProps {
  onSend: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
}

export default function AIChatInput({ onSend, loading, disabled }: AIChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
  }, [loading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  return (
    <div className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--bg)] p-3">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your trades, strategies, market..."
        rows={1}
        disabled={loading || disabled}
        className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[var(--text-muted)] outline-none resize-none focus:border-[var(--amber)]/40 transition-colors disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={!input.trim() || loading || disabled}
        className="w-8 h-8 rounded-lg bg-[var(--amber)] hover:bg-[var(--amber-hover)] disabled:bg-[var(--border)] disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <Send className="w-4 h-4 text-[var(--bg)]" />
        )}
      </button>
    </div>
  );
}

import { User, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import AIEvidenceCard from "./AIEvidenceCard";
import type { ChatResponse } from "../../../server/ai/AIChatEngine";

interface AIChatMessageProps {
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  timestamp: number;
}

export default function AIChatMessage({ role, content, response, timestamp }: AIChatMessageProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="bg-[var(--amber-soft)] border border-[var(--amber-border)] rounded-xl rounded-br-sm px-3.5 py-2.5 max-w-[80%]">
          <p className="text-xs text-white leading-relaxed">{content}</p>
          <span className="text-[9px] text-[var(--text-muted)] mt-1 block text-right">{time}</span>
        </div>
        <div className="w-7 h-7 rounded-full bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3.5 h-3.5 text-[var(--amber)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-[var(--cyan-soft)] border border-[var(--cyan-border)] flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-[var(--cyan)]" />
      </div>
      <div className="space-y-1.5 max-w-[80%]">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl rounded-tl-sm px-3.5 py-2.5">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{content}</p>
          <span className="text-[9px] text-[var(--text-muted)] mt-1 block">{time}</span>
        </div>
        {response && (
          <div>
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--cyan)] transition-colors"
            >
              {showEvidence ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Evidence & Confidence
            </button>
            {showEvidence && <AIEvidenceCard response={response} />}
          </div>
        )}
      </div>
    </div>
  );
}

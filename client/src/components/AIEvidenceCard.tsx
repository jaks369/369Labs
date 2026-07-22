import { BarChart3, CheckCircle2, Database, Cpu } from "lucide-react";
import type { ChatResponse } from "../../../server/ai/AIChatEngine";

interface AIEvidenceCardProps {
  response: ChatResponse;
}

export default function AIEvidenceCard({ response }: AIEvidenceCardProps) {
  const confidenceColor = response.confidence >= 80 ? "text-[var(--green)]" : response.confidence >= 50 ? "text-[var(--amber)]" : "text-[var(--red)]";

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 space-y-2 mt-1">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3 h-3 text-[var(--cyan)]" />
        <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Confidence</span>
        <span className={`text-[11px] font-bold font-mono ${confidenceColor} ml-auto`}>{response.confidence}%</span>
      </div>

      <div className="flex items-start gap-2">
        <BarChart3 className="w-3 h-3 text-[var(--cyan)] mt-0.5" />
        <div>
          <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-0.5">Evidence</span>
          {response.evidence.length > 0 ? (
            <ul className="space-y-0.5">
              {response.evidence.map((item, i) => (
                <li key={i} className="text-[9px] text-[var(--text-muted)] leading-relaxed">ΓÇó {item}</li>
              ))}
            </ul>
          ) : (
            <span className="text-[9px] text-[var(--text-muted)] italic">No evidence data available</span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <Cpu className="w-3 h-3 text-[var(--cyan)] mt-0.5" />
        <div>
          <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-0.5">Engines Used</span>
          <div className="flex flex-wrap gap-1">
            {response.enginesUsed.map((engine, i) => (
              <span key={i} className="text-[8px] bg-[var(--cyan-soft)] text-[var(--cyan)] border border-[var(--cyan-border)] rounded px-1.5 py-0.5">{engine}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

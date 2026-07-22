import { Lightbulb } from "lucide-react";

interface AIQuickQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  loading: boolean;
}

export default function AIQuickQuestions({ questions, onSelect, loading }: AIQuickQuestionsProps) {
  if (loading) return null;

  return (
    <div className="p-3 border-b border-[var(--border)]">
      <div className="flex items-center gap-1.5 mb-2">
        <Lightbulb className="w-3 h-3 text-[var(--amber)]" />
        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Try Asking</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-[9px] bg-[var(--card)] hover:bg-[var(--border)] text-[var(--text-secondary)] hover:text-white border border-[var(--border)] rounded-lg px-2.5 py-1.5 transition-all"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

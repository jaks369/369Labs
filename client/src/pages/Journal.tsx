import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, BookOpen, Sparkles } from "lucide-react";

export default function Journal() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [strategyId, setStrategyId] = useState<number | undefined>();
  const strategiesQuery = trpc.strategies.list.useQuery();
  const journalMutation = trpc.ai.journal.useMutation();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const runJournal = () => {
    journalMutation.mutate({ strategyId: strategyId || undefined, limit: 50 });
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-amber-400" /> Trading Journal
          </h1>
          <p className="text-slate-400 text-sm mt-1">369AI explains WHY your trades won or lost — educational, data-driven.</p>
        </div>

        <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Focus on a strategy (optional)</label>
            <select
              value={strategyId ?? ""}
              onChange={(e) => setStrategyId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full mt-1 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">All strategies</option>
              {(strategiesQuery.data || []).filter((s: any) => s.config?.rule).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={runJournal}
            disabled={journalMutation.isPending}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
          >
            {journalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {journalMutation.isPending ? "Analyzing trades…" : "Generate AI Journal"}
          </button>
        </div>

        {journalMutation.data?.analysis && (
          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6">
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {journalMutation.data.analysis}
            </div>
          </div>
        )}
        {journalMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
            Could not generate journal. Make sure you have trades and AI is configured.
          </div>
        )}
      </div>
    </div>
  );
}

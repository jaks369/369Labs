import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Search, Loader2, CandlestickChart, Zap, Bot, Brain, X } from "lucide-react";
import { useLocation } from "wouter";

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = trpc.globalSearch.useQuery({ query, limit: 8 }, { enabled: query.length >= 2 });

  useEffect(() => {
    if (open && inputRef.current) { inputRef.current.focus(); setQuery(""); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const data = searchQuery.data;
  const hasResults = data && (data.trades?.length > 0 || data.strategies?.length > 0 || data.botRuns?.length > 0 || data.aiKnowledge?.length > 0);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trades, strategies, bots, symbols..." className="flex-1 bg-transparent text-sm text-white outline-none placeholder-[var(--text-muted)]" />
          {searchQuery.isFetching && <Loader2 className="w-4 h-4 text-[var(--amber)] animate-spin shrink-0" />}
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white p-1 rounded hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        {query.length >= 2 && (
          <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
            {searchQuery.isLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-[var(--amber)] animate-spin" /></div>
            ) : !hasResults ? (
              <div className="text-center py-6 text-xs text-[var(--text-muted)]">No results found for "{query}"</div>
            ) : (
              <>
                {data.trades?.length > 0 && <ResultGroup title="Trades" icon={CandlestickChart} results={data.trades.map((t: any) => ({ label: `${t.symbol} ${t.contractType || ""} ${t.result === "win" ? "✓" : t.result === "loss" ? "✗" : ""} ${Number(t.profitLoss || 0).toFixed(2)}`, onClick: () => { setLocation("/trade-history"); onClose(); } }))} />}
                {data.strategies?.length > 0 && <ResultGroup title="Strategies" icon={Zap} results={data.strategies.map((s: any) => ({ label: s.name, onClick: () => { setLocation("/strategy-builder"); onClose(); } }))} />}
                {data.botRuns?.length > 0 && <ResultGroup title="Bot Runs" icon={Bot} results={data.botRuns.map((b: any) => ({ label: `${b.strategyName || "Unknown"} - ${b.status}`, onClick: () => { setLocation("/bots"); onClose(); } }))} />}
                {data.aiKnowledge?.length > 0 && <ResultGroup title="AI Knowledge" icon={Brain} results={data.aiKnowledge.map((k: any) => ({ label: `[${k.knowledgeType}] ${k.symbol || ""} ${JSON.stringify(k.data).slice(0, 60)}`, onClick: () => onClose() }))} />}
              </>
            )}
          </div>
        )}
        {query.length < 2 && (
          <div className="p-4 text-center text-[10px] text-[var(--text-muted)]">Type at least 2 characters to search across all your data</div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({ title, icon: Icon, results }: { title: string; icon: React.ComponentType<{ className?: string }>; results: { label: string; onClick: () => void }[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Icon className="w-3 h-3 text-[var(--amber)]" />
        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{title} ({results.length})</span>
      </div>
      {results.map((r, i) => (
        <button key={i} onClick={r.onClick} className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-white/5 hover:text-white transition-all truncate">
          {r.label}
        </button>
      ))}
    </div>
  );
}

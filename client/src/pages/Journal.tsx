import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, BookOpen, Sparkles, Search, Clock, Plus, Upload, Image, Link2, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "@/components/Toast";

export default function Journal() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [strategyId, setStrategyId] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [showLinkTrade, setShowLinkTrade] = useState(false);
  const [linkTradeId, setLinkTradeId] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const strategiesQuery = trpc.strategies.list.useQuery();
  const journalMutation = trpc.ai.journal.useMutation();
  const journalSearchQuery = trpc.ai.journalSearch.useQuery({ query: searchQuery, limit: 20 }, { enabled: searchQuery.length >= 0 });
  const saveManualMutation = trpc.ai.journalSaveManual.useMutation();
  const importCsvMutation = trpc.trades.importCsv.useMutation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 100 }, { enabled: showStats });
  const uploadImageMutation = trpc.ai.journalUploadImage.useMutation();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const runJournal = () => { journalMutation.mutate({ strategyId: strategyId || undefined, limit: 50 }); };

  const saveManual = async () => {
    if (!manualNote.trim()) return;
    await saveManualMutation.mutateAsync({ note: manualNote.trim() });
    setManualNote("");
    setShowManual(false);
    toast("Journal entry saved", "success");
    journalSearchQuery.refetch();
  };

  const importCsv = async () => {
    if (!csvText.trim()) return;
    try {
      const result = await importCsvMutation.mutateAsync({ csv: csvText.trim() });
      toast(`Imported ${result.imported} trades`, "success");
      setShowImport(false);
      setCsvText("");
    } catch { toast("Import failed. Check CSV format.", "error"); }
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-[var(--amber)]" /> Trading Journal
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">369AI explains WHY your trades won or lost — educational, data-driven.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowManual(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Plus className="w-3.5 h-3.5" /> Add Note</button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Upload className="w-3.5 h-3.5" /> Import Trades</button>
          <button onClick={() => { setShowScreenshot(true); setTimeout(() => fileInputRef.current?.click(), 100); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Image className="w-3.5 h-3.5" /> Screenshot</button>
          <button onClick={() => setShowLinkTrade(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Link2 className="w-3.5 h-3.5" /> Link Trade</button>
          <button onClick={() => setShowStats(!showStats)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${showStats ? "bg-[var(--cyan)]/20 text-[var(--cyan)] border-[var(--cyan)]/30" : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-white"}`}><BarChart3 className="w-3.5 h-3.5" /> Stats</button>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-4">
          <div>
            <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Focus on a strategy (optional)</label>
            <select value={strategyId ?? ""} onChange={(e) => setStrategyId(e.target.value ? Number(e.target.value) : undefined)} className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm">
              <option value="">{strategiesQuery.isLoading ? "Loading..." : strategiesQuery.isError ? "Failed to load" : "All strategies"}</option>
              {(strategiesQuery.data || []).filter((s: any) => s.config?.rule).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={runJournal} disabled={journalMutation.isPending} className="w-full bg-[var(--amber)] hover:bg-[var(--amber)] text-black text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2">
            {journalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {journalMutation.isPending ? "Analyzing trades..." : "Generate AI Journal"}
          </button>
        </div>

        {journalMutation.data?.analysis && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[var(--amber)]" />
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">{(journalMutation.data as any).sampleSize} trades · {(journalMutation.data as any).wins}W / {(journalMutation.data as any).losses}L · Net ${(journalMutation.data as any).net?.toFixed(2) ?? "0.00"}</span>
            </div>
            <div className="prose prose-invert max-w-none text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{journalMutation.data.analysis}</div>
          </div>
        )}
        {journalMutation.isError && <div className="bg-[var(--red-soft)] border border-[var(--red)]/30 rounded-xl p-4 text-sm text-[var(--red)]">Could not generate journal. Make sure you have trades and AI is configured.</div>}

        {showStats && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--cyan)]" /> Trade Statistics</h2>
            {(() => {
              const allTrades = (tradesQuery.data || []) as any[];
              const wins = allTrades.filter((t) => t.result === "win").length;
              const losses = allTrades.filter((t) => t.result === "loss").length;
              const total = wins + losses;
              const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0";
              const totalPnl = allTrades.reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0);
              const avgWin = wins > 0 ? allTrades.filter((t) => t.result === "win").reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0) / wins : 0;
              const avgLoss = losses > 0 ? Math.abs(allTrades.filter((t) => t.result === "loss").reduce((s, t) => s + parseFloat(t.profitLoss?.toString() || "0"), 0)) / losses : 0;
              const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;
              const bySym: Record<string, { wins: number; losses: number; pnl: number }> = {};
              allTrades.forEach((t) => {
                const sym = t.symbol || "Unknown";
                if (!bySym[sym]) bySym[sym] = { wins: 0, losses: 0, pnl: 0 };
                if (t.result === "win") bySym[sym].wins++;
                else if (t.result === "loss") bySym[sym].losses++;
                bySym[sym].pnl += parseFloat(t.profitLoss?.toString() || "0");
              });
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-black/20 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Total Trades</p>
                      <p className="text-lg font-bold text-white">{total}</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Win Rate</p>
                      <p className="text-lg font-bold text-[var(--green)]">{winRate}%</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Net P&L</p>
                      <p className={`text-lg font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${totalPnl.toFixed(2)}</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Profit Factor</p>
                      <p className={`text-lg font-bold ${profitFactor >= 1.5 ? "text-[var(--green)]" : profitFactor >= 1 ? "text-[var(--amber)]" : "text-[var(--red)]"}`}>{profitFactor.toFixed(2)}</p>
                    </div>
                  </div>
                  {Object.keys(bySym).length > 0 && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] font-bold mb-2">By Symbol</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {Object.entries(bySym).sort((a, b) => b[1].pnl - a[1].pnl).map(([sym, d]) => (
                          <div key={sym} className="flex justify-between text-xs p-2 bg-black/20 rounded-lg">
                            <span className="text-[var(--text-secondary)] font-bold">{sym}</span>
                            <span className="text-[var(--text-muted)]">{d.wins}W / {d.losses}L</span>
                            <span className={d.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{d.pnl >= 0 ? "+" : ""}${d.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            <h2 className="text-sm font-bold text-white">Past Journal Entries</h2>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search past journal entries..." className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder:text-[var(--text-muted)]" />
          </div>
          <div className="space-y-3">
            {journalSearchQuery.isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /></div>
            ) : journalSearchQuery.isError ? (
              <p className="text-xs text-[var(--red)] italic text-center py-4">Failed to load journal history.</p>
            ) : (journalSearchQuery.data || []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic text-center py-4">{searchQuery ? "No journal entries match your search." : "No journal entries yet. Generate one above."}</p>
            ) : (
              (journalSearchQuery.data || []).map((entry: any) => {
                const d = entry.data as any;
                const isManual = d?.manual;
                return (
                  <div key={entry.id} className={`bg-[var(--card)] border ${isManual ? "border-[var(--cyan)]/30" : "border-[var(--border)]"} rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      {isManual && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--cyan-soft)] text-[var(--cyan)] font-bold">NOTE</span>}
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}</span>
                      {!isManual && d?.sampleSize && <span className="text-[10px] text-[var(--text-secondary)]">{d.sampleSize} trades · {d.wins}W / {d.losses}L</span>}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap line-clamp-6">{d?.analysis || ""}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showManual && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowManual(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4" /> Add Manual Journal Note</h3>
              <button onClick={() => setShowManual(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <textarea value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Write your observations, thoughts on recent trades..." rows={5} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder-[var(--text-muted)] outline-none resize-none" />
              <button onClick={saveManual} disabled={saveManualMutation.isPending || !manualNote.trim()} className="w-full py-2 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold hover:bg-[var(--cyan)] disabled:opacity-40">
                {saveManualMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScreenshot && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScreenshot(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Image className="w-4 h-4" /> Upload Screenshot</h3>
              <button onClick={() => setShowScreenshot(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const dataUrl = ev.target?.result as string;
                  setScreenshots((prev) => [...prev, dataUrl]);
                  try {
                    await uploadImageMutation.mutateAsync({ image: dataUrl });
                    toast("Screenshot uploaded", "success");
                  } catch { toast("Upload failed", "error"); }
                };
                reader.readAsDataURL(file);
              }} />
              <p className="text-xs text-[var(--text-muted)]">Select a screenshot file (PNG/JPG) to attach to your journal.</p>
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-2 rounded-lg bg-[var(--amber)] text-black text-xs font-bold">Choose File</button>
              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {screenshots.map((s, i) => (
                    <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)]">
                      <img src={s} alt={`Screenshot ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLinkTrade && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLinkTrade(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Link2 className="w-4 h-4" /> Link Trade to Journal</h3>
              <button onClick={() => setShowLinkTrade(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-[var(--text-muted)]">Enter a trade ID or contract ID to link a specific trade to a journal entry.</p>
              <input value={linkTradeId} onChange={(e) => setLinkTradeId(e.target.value)} placeholder="Trade / Contract ID" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white" />
              <button onClick={() => {
                if (!linkTradeId.trim()) return;
                toast(`Trade ${linkTradeId} linked to journal`, "success");
                setLinkTradeId("");
                setShowLinkTrade(false);
              }} disabled={!linkTradeId.trim()} className="w-full py-2 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold disabled:opacity-40">Link Trade</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4" /> Import Trades (CSV)</h3>
              <button onClick={() => setShowImport(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[10px] text-[var(--text-muted)]">CSV must have at least: <code className="text-[var(--amber)]">symbol, result (win/loss), stake</code>. Optional: <code className="text-[var(--text-secondary)]">profitLoss, entryTime, exitTime, contractType, contractId</code>.</p>
              <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={`symbol,result,stake,profitLoss,entryTime\nR_100,win,10,5.2,2024-01-01\nR_100,loss,10,-3.1,2024-01-02`} rows={6} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 text-xs font-mono text-white placeholder-[var(--text-muted)] outline-none resize-none" />
              <button onClick={importCsv} disabled={importCsvMutation.isPending || !csvText.trim()} className="w-full py-2 rounded-lg bg-[var(--amber)] text-black text-xs font-bold hover:bg-[var(--amber)] disabled:opacity-40">
                {importCsvMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Import Trades`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

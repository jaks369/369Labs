import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Plus,
  Trash2,
  Play,
  Settings2,
  Layers,
  Activity,
  ChevronRight,
  Database,
  Copy,
  Zap,
  ShieldCheck,
  GitCompare,
  History,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import RuleBuilder, { StrategyRule, DEFAULT_RULE, summarizeRule } from "@/components/RuleBuilder";

interface StrategyBlock {
  id: string;
  type: "market" | "condition" | "indicator" | "risk" | "trade" | "exit";
  value: string;
}

interface StrategyBuilderContentProps {
  // When embedded (e.g. inside the Bots page), the builder doesn't navigate on
  // its own - it calls these callbacks instead.
  embedded?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
}

const summarizeRuleSafe = (r: any): string => {
  try { return summarizeRule(r as StrategyRule); } catch { return "â€”"; }
};

export function StrategyBuilderContent({ embedded = false, onClose, onSaved }: StrategyBuilderContentProps) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [strategyName, setStrategyName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<StrategyBlock[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [diffA, setDiffA] = useState<number | null>(null);
  const [diffB, setDiffB] = useState<number | null>(null);
  const [rule, setRule] = useState<StrategyRule>(DEFAULT_RULE);
  const [builderMode, setBuilderMode] = useState<"visual" | "blocks" | "ensemble">("blocks");
  const [publishToMarketplace, setPublishToMarketplace] = useState(false);
  const [ensembleVote, setEnsembleVote] = useState<"all" | "majority" | "any">("majority");
  const [ensembleIds, setEnsembleIds] = useState<number[]>([]);
  const [versions, setVersions] = useState<{ savedAt: string; rule: any }[]>([]);
  const [compareIdx, setCompareIdx] = useState<[number, number] | null>(null);

  const saveStrategyMutation = trpc.strategies.save.useMutation();
  const duplicateMutation = trpc.strategies.duplicate.useMutation({
    onSuccess: () => strategiesQuery.refetch(),
  });
  const critiqueMutation = trpc.ai.critique.useMutation();
  const strategiesQuery = trpc.strategies.list.useQuery();

  const search = useSearch();
  const editId = new URLSearchParams(search).get("edit");
  const editQuery = trpc.strategies.getById.useQuery({ id: Number(editId) }, { enabled: !!editId });

  useEffect(() => {
    if (editQuery.data) {
      setStrategyName(editQuery.data.name);
      setDescription(editQuery.data.description || "");
      const config = editQuery.data.config as any;
      if (config?.rule) { setRule(config.rule); setBuilderMode("visual"); }
      if (Array.isArray(config?.versions)) setVersions(config.versions);
    }
  }, [editQuery.data]);
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const addBlock = (type: StrategyBlock["type"]) => {
    const newBlock: StrategyBlock = {
      id: Date.now().toString(),
      type,
      value: "",
    };
    setBlocks([...blocks, newBlock]);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const updateBlock = (id: string, value: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, value } : b));
  };

  const buildEnsembleRule = (): any => {
    const all = (strategiesQuery.data || []) as any[];
    const rules = ensembleIds
      .map((id) => all.find((s) => s.id === id)?.config?.rule)
      .filter(Boolean) as StrategyRule[];
    const firstSym = rules[0]?.symbol || "R_100";
    return {
      symbol: firstSym,
      condition: DEFAULT_RULE.condition,
      action: rules[0]?.action || DEFAULT_RULE.action,
      params: rules[0]?.params || DEFAULT_RULE.params,
      ensemble: { vote: ensembleVote, rules },
    };
  };

  const buildConfig = () => {
    const base = (builderMode === "visual")
      ? { rule: rule as any, summary: summarizeRule(rule) }
      : builderMode === "ensemble"
        ? { rule: buildEnsembleRule(), summary: `Ensemble (${ensembleVote}) of ${ensembleIds.length} strategies` }
        : { blocks };
    const prevRule = (editQuery.data?.config as any)?.rule;
    const nextVersions = prevRule ? [...versions, { savedAt: new Date().toISOString(), rule: prevRule }] : versions;
    return { ...base, versions: nextVersions };
  };

  const handleSaveAndDeploy = async () => {
    if (!strategyName) { toast("Please enter a strategy name", "error"); return; }
    if (builderMode === "ensemble" && ensembleIds.length < 2) { toast("Select at least 2 strategies for an ensemble.", "error"); return; }
    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: buildConfig(),
        published: publishToMarketplace,
      });
      toast("Strategy saved and deployed successfully!", "success");
      if (embedded) { onSaved?.(); } else { navigate("/bots"); }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save strategy", "error");
    }
  };

  const handleSaveStrategy = async () => {
    if (!strategyName) {
      toast("Please enter a strategy name", "error");
      return;
    }
    if (builderMode === "ensemble" && ensembleIds.length < 2) { toast("Select at least 2 strategies for an ensemble.", "error"); return; }

    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: buildConfig(),
        published: publishToMarketplace,
      });
      toast("Strategy saved successfully!", "success");
      setStrategyName("");
      setDescription("");
      setBlocks([]);
      setRule(DEFAULT_RULE);
      if (embedded) { onSaved?.(); }
    } catch (error) {
      toast("Failed to save strategy", "error");
    }
  };

  const blockTypes: { type: StrategyBlock["type"]; icon: any; color: string }[] = [
    { type: "market", icon: Database, color: "text-[var(--amber)]" },
    { type: "condition", icon: Activity, color: "text-[var(--green)]" },
    { type: "indicator", icon: Layers, color: "text-[var(--amber)]" },
    { type: "risk", icon: ShieldCheck, color: "text-[var(--amber)]" },
    { type: "trade", icon: Zap, color: "text-[var(--amber)]" },
    { type: "exit", icon: ChevronRight, color: "text-[var(--red)]" },
  ];

  return (
    <div className="p-6 lg:p-10 bg-[var(--card)] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Strategy Builder</h1>
            <p className="text-[var(--text-muted)] text-sm font-medium">Design professional trading algorithms without code.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={publishToMarketplace} onChange={e => setPublishToMarketplace(e.target.checked)} className="rounded" />
              Publish to Marketplace
            </label>
            {embedded && (
              <Button onClick={onClose} variant="ghost" className="btn btn-secondary flex items-center gap-2">
                <ChevronRight className="w-4 h-4 rotate-180" /> Back to Bots
              </Button>
            )}
            <Button onClick={handleSaveStrategy} disabled={saveStrategyMutation.isPending} className="btn btn-secondary">
              {saveStrategyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
            </Button>
            <Button onClick={() => setShowHistory(true)} variant="ghost" className="btn btn-secondary flex items-center gap-2">
              <History className="w-4 h-4" /> History
            </Button>
            <Button onClick={handleSaveAndDeploy} disabled={saveStrategyMutation.isPending} className="btn btn-primary flex items-center gap-2">
              <Play className="w-4 h-4" /> {embedded ? "Save & Add Bot" : "Deploy to Cloud"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Panel - Library */}
          <div className="space-y-6">
            <div className="panel p-6">
              <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">Execution Blocks</h3>
              <div className="grid grid-cols-1 gap-2">
                {blockTypes.map(bt => (
                  <button
                    key={bt.type}
                    onClick={() => addBlock(bt.type)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--amber)] transition-all text-left group"
                  >
                    <bt.icon className={`w-4 h-4 ${bt.color}`} />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] group-hover:text-white capitalize">{bt.type}</span>
                    <Plus className="w-3 h-3 ml-auto text-[var(--text-muted)] group-hover:text-[var(--amber)]" />
                  </button>
                ))}
              </div>
            </div>

            <div className="panel p-6">
              <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">Saved Strategies</h3>
              <div className="space-y-3">
                {strategiesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" />
                  </div>
                ) : strategiesQuery.isError ? (
                  <p className="text-xs text-[var(--red)] italic">Failed to load strategies.</p>
                ) : strategiesQuery.data?.slice(0, 5).map(s => (
                  <div key={s.id} className="p-3 rounded-lg bg-black/20 border border-white/5 hover:border-[var(--amber)]/50 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{s.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                          {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "Not saved yet"}
                        </p>
                      </div>
                      <button
                        onClick={() => duplicateMutation.mutate({ id: s.id })}
                        disabled={duplicateMutation.isPending}
                        title="Duplicate strategy"
                        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--amber)] hover:bg-[var(--amber-soft)] transition-colors disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {(!strategiesQuery.isLoading && !strategiesQuery.isError && (!strategiesQuery.data || strategiesQuery.data.length === 0)) && (
                  <p className="text-xs text-[var(--text-muted)] italic">No strategies saved yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Main Canvas */}
          <div className="lg:col-span-3 space-y-6">
            {/* Strategy Meta */}
            <div className="panel p-6 flex flex-col md:flex-row gap-6">
               <div className="flex-1 space-y-2">
                 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Strategy Name</label>
                 <Input 
                   value={strategyName}
                   onChange={e => setStrategyName(e.target.value)}
                   placeholder="e.g., Mean Reversion V1" 
                   className="bg-transparent border-none text-xl font-bold p-0 focus-visible:ring-0 h-auto"
                 />
               </div>
               <div className="w-px bg-[var(--border)] hidden md:block" />
               <div className="flex-1 space-y-2">
                 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Description</label>
                 <Input 
                   value={description}
                   onChange={e => setDescription(e.target.value)}
                   placeholder="Briefly explain your logic..." 
                   className="bg-transparent border-none text-sm p-0 focus-visible:ring-0 h-auto"
                 />
               </div>
            </div>

            {/* Canvas */}
            <div className="panel min-h-[500px] flex flex-col">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Workflow Canvas</span>
                </div>
                <div className="flex bg-[var(--card)] rounded-lg p-1">
                   <button onClick={() => setBuilderMode("blocks")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "blocks" ? "bg-[var(--amber)] text-white" : "text-[var(--text-muted)]"}`}>BLOCKS</button>
                   <button onClick={() => setBuilderMode("visual")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "visual" ? "bg-[var(--amber)] text-white" : "text-[var(--text-muted)]"}`}>IF/THEN</button>
                   <button onClick={() => setBuilderMode("ensemble")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "ensemble" ? "bg-[var(--amber)] text-white" : "text-[var(--text-muted)]"}`}>ENSEMBLE</button>
                   <button onClick={() => setShowHistory((v) => !v)} className={`px-3 py-1 text-[10px] font-bold rounded ${showHistory ? "bg-[var(--amber)] text-white" : "text-[var(--text-muted)]"}`}><GitCompare className="w-3 h-3 inline mr-1" />HISTORY</button>
                   <button onClick={() => critiqueMutation.mutate({ rule: buildConfig().rule })} className={`px-3 py-1 text-[10px] font-bold rounded ${critiqueMutation.isPending ? "opacity-50" : "hover:bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/30"}`}><ShieldCheck className="w-3 h-3 inline mr-1" />AI REVIEW</button>
                 </div>
               </div>

               {showHistory && (
                 <div className="border-b border-[var(--border)] p-4 bg-black/20 space-y-3">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Version History ({versions.length})</span>
                     {versions.length >= 2 && compareIdx === null && (
                       <button onClick={() => setCompareIdx([versions.length - 2, versions.length - 1])} className="text-[10px] text-[var(--amber)] hover:underline">Compare last two</button>
                     )}
                   </div>
                   {versions.length === 0 && <p className="text-xs text-[var(--text-muted)]">No saved versions yet. Save this strategy to start tracking history.</p>}
                   <div className="space-y-1">
                     {versions.map((v, i) => (
                       <div key={i} className="flex items-center gap-3 text-xs">
                         <span className="text-[var(--text-muted)] w-40">{new Date(v.savedAt).toLocaleString()}</span>
                         <span className="text-[var(--text-secondary)]">{summarizeRuleSafe(v.rule)}</span>
                       </div>
                     ))}
                   </div>
                   {compareIdx && versions[compareIdx[0]] && versions[compareIdx[1]] && (
                     <div className="grid grid-cols-2 gap-4 pt-2">
                       <div className="bg-[var(--card)] border border-[var(--border)] rounded p-3">
                         <p className="text-[10px] text-[var(--text-muted)] mb-1">{new Date(versions[compareIdx[0]].savedAt).toLocaleString()}</p>
                         <p className="text-xs text-white whitespace-pre-wrap">{summarizeRuleSafe(versions[compareIdx[0]].rule)}</p>
                       </div>
                       <div className="bg-[var(--card)] border border-[var(--border)] rounded p-3">
                         <p className="text-[10px] text-[var(--text-muted)] mb-1">{new Date(versions[compareIdx[1]].savedAt).toLocaleString()}</p>
                         <p className="text-xs text-white whitespace-pre-wrap">{summarizeRuleSafe(versions[compareIdx[1]].rule)}</p>
                       </div>
                     </div>
                    )}
                  </div>
                )}

                {critiqueMutation.data && (
                  <div className="border-b border-[var(--border)] p-4 bg-black/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-[var(--green)]" />
                      <span className="text-[10px] font-bold text-[var(--green)] uppercase tracking-widest">Risk Reviewer Agent</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-3">{critiqueMutation.data.summary}</p>
                    <div className="space-y-2">
                      {((critiqueMutation.data.findings as any[]) || []).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${f.severity === "high" ? "bg-[var(--red)]/30 text-[var(--red)]" : f.severity === "medium" ? "bg-[var(--amber)]/30 text-[var(--amber-hover)]" : "bg-[var(--text-muted)]/30 text-[var(--text-secondary)]"}`}>{f.severity}</span>
                          <div><b className="text-white">{f.title}</b> <span className="text-[var(--text-secondary)]">â€” {f.detail}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex-1 p-8 space-y-4">
                {builderMode === "visual" ? (
                  <div className="max-w-2xl mx-auto py-10">
                    <RuleBuilder rule={rule} onChange={setRule} />
                  </div>
                ) : builderMode === "ensemble" ? (
                  <div className="max-w-2xl mx-auto space-y-5">
                    <p className="text-xs text-[var(--text-muted)]">Combine 2â€“3 saved strategies into one bot. A trade fires only when the chosen number of sub-strategies agree (vote).</p>
                    <div>
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Vote rule</label>
                      <div className="flex gap-2 mt-2">
                        {(["all", "majority", "any"] as const).map((v) => (
                          <button key={v} onClick={() => setEnsembleVote(v)} className={`px-3 py-1 text-[10px] font-bold rounded ${ensembleVote === v ? "bg-[var(--amber)] text-white" : "bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]"}`}>{v === "all" ? "ALL agree" : v === "majority" ? "MAJORITY" : "ANY"}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Select strategies</label>
                      {((strategiesQuery.data || []) as any[]).filter((s) => s.config?.rule).map((s) => {
                        const checked = ensembleIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:border-[var(--amber)]/50">
                            <input type="checkbox" checked={checked} onChange={(e) => setEnsembleIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id))} className="rounded" />
                            <span className="text-sm text-white">{s.name}</span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{(s.config.rule.symbol) || "R_100"}</span>
                          </label>
                        );
                      })}
                      {(strategiesQuery.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">No saved strategies yet. Build a few in IF/THEN mode first.</p>}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto space-y-6">
                    {blocks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-[var(--border)] rounded-2xl">
                        <Plus className="w-8 h-8 text-[var(--border)] mb-4" />
                        <p className="text-[var(--text-muted)] text-sm">Add blocks from the library to start building your workflow.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 relative">
                        {blocks.map((block, index) => {
                          const typeInfo = blockTypes.find(bt => bt.type === block.type)!;
                          return (
                            <div key={block.id} className="relative group">
                              {index < blocks.length - 1 && (
                                <div className="absolute left-6 top-12 w-0.5 h-8 bg-[var(--border)]" />
                              )}
                              <div className="flex gap-4 items-start bg-[var(--card)] border border-[var(--border)] p-4 rounded-xl group-hover:border-[var(--amber)]/50 transition-all">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-[var(--card)] border border-white/5`}>
                                  <typeInfo.icon className={`w-6 h-6 ${typeInfo.color}`} />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{block.type}</span>
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => moveBlock(block.id, -1)} disabled={index === 0} className="text-[var(--text-muted)] hover:text-[var(--cyan)] disabled:opacity-25 transition-colors" aria-label="Move up"><ArrowUp className="w-3 h-3" /></button>
                                      <button onClick={() => moveBlock(block.id, 1)} disabled={index === blocks.length - 1} className="text-[var(--text-muted)] hover:text-[var(--cyan)] disabled:opacity-25 transition-colors" aria-label="Move down"><ArrowDown className="w-3 h-3" /></button>
                                      <button onClick={() => removeBlock(block.id)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                  </div>
                                  <Input 
                                    value={block.value}
                                    onChange={e => updateBlock(block.id, e.target.value)}
                                    placeholder={`Configure ${block.type} parameters...`}
                                    className="bg-transparent border-none p-0 text-sm focus-visible:ring-0 h-auto text-white placeholder:text-[var(--border)]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHistory(false)}>
          <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><History className="w-4 h-4" /> Version History</h3>
              <button onClick={() => setShowHistory(false)} className="text-[var(--text-muted)] hover:text-white">âœ•</button>
            </div>
            <div className="p-4 space-y-2">
              {(() => {
                const versions: any[] = (editQuery.data?.config as any)?.versions || [];
                if (!versions.length) return <p className="text-sm text-[var(--text-muted)]">No saved versions yet. Save the strategy to start tracking history.</p>;
                const a = diffA != null ? versions[diffA] : null;
                const b = diffB != null ? versions[diffB] : null;
                const diffLines = (() => {
                  if (!a || !b) return [];
                  const sa = JSON.stringify(a.rule, null, 2).split("\n");
                  const sb = JSON.stringify(b.rule, null, 2).split("\n");
                  const max = Math.max(sa.length, sb.length);
                  const out: { kind: "same" | "add" | "del"; text: string }[] = [];
                  for (let i = 0; i < max; i++) {
                    const la = sa[i] ?? "";
                    const lb = sb[i] ?? "";
                    if (la === lb) out.push({ kind: "same", text: la });
                    else { if (la) out.push({ kind: "del", text: la }); if (lb) out.push({ kind: "add", text: lb }); }
                  }
                  return out;
                })();
                return (
                  <>
                    <div className="space-y-1">
                      {versions.map((v, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-black/20 rounded-lg">
                          <span className="text-xs text-[var(--text-secondary)] w-24 shrink-0">{new Date(v.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <code className="text-[11px] text-[var(--text-muted)] flex-1 truncate">{summarizeRule(v.rule)}</code>
                          <button onClick={() => setDiffA(i)} className={`text-[10px] px-2 py-0.5 rounded ${diffA === i ? "bg-[var(--amber)] text-white" : "bg-white/5 text-[var(--text-secondary)]"}`}>A</button>
                          <button onClick={() => setDiffB(i)} className={`text-[10px] px-2 py-0.5 rounded ${diffB === i ? "bg-[var(--amber)] text-white" : "bg-white/5 text-[var(--text-secondary)]"}`}>B</button>
                        </div>
                      ))}
                    </div>
                    {diffLines.length > 0 && (
                      <div className="mt-3 p-3 bg-black/40 rounded-lg font-mono text-[11px] overflow-x-auto">
                        <p className="text-[var(--text-muted)] mb-2">Diff: v{(diffA ?? 0) + 1} â†’ v{(diffB ?? 0) + 1}</p>
                        {diffLines.map((l, i) => (
                          <div key={i} className={l.kind === "add" ? "text-[var(--green)]" : l.kind === "del" ? "text-[var(--red)]" : "text-[var(--text-muted)]"}>
                            {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}{l.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyBuilder() {
  const [, navigate] = useLocation();
  return <StrategyBuilderContent embedded={false} onClose={() => navigate("/bots")} onSaved={() => navigate("/bots")} />;
}




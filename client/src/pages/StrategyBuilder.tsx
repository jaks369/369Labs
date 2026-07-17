import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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
  Search,
  Zap,
  ShieldCheck,
  GitCompare,
  History
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

  const publishMutation = trpc.strategies.publish.useMutation();
  const saveStrategyMutation = trpc.strategies.save.useMutation();
  const critiqueMutation = trpc.ai.critique.useMutation();
  const strategiesQuery = trpc.strategies.list.useQuery();

  const search = useSearch();
  const editId = new URLSearchParams(search).get("edit");
  const editQuery = trpc.strategies.getById.useQuery(Number(editId), { enabled: !!editId });

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
    if (!strategyName) { alert("Please enter a strategy name"); return; }
    if (builderMode === "ensemble" && ensembleIds.length < 2) { alert("Select at least 2 strategies for an ensemble."); return; }
    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: buildConfig(),
        published: publishToMarketplace,
      });
      if (embedded) { onSaved?.(); } else { navigate("/bots"); }
    } catch { alert("Failed to save strategy"); }
  };

  const handleSaveStrategy = async () => {
    if (!strategyName) {
      alert("Please enter a strategy name");
      return;
    }
    if (builderMode === "ensemble" && ensembleIds.length < 2) { alert("Select at least 2 strategies for an ensemble."); return; }

    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: buildConfig(),
        published: publishToMarketplace,
      });
      alert("Strategy saved successfully!");
      setStrategyName("");
      setDescription("");
      setBlocks([]);
      setRule(DEFAULT_RULE);
      if (embedded) { onSaved?.(); }
    } catch (error) {
      alert("Failed to save strategy");
    }
  };

  const blockTypes: { type: StrategyBlock["type"]; icon: any; color: string }[] = [
    { type: "market", icon: Database, color: "text-blue-500" },
    { type: "condition", icon: Activity, color: "text-emerald-500" },
    { type: "indicator", icon: Layers, color: "text-purple-500" },
    { type: "risk", icon: ShieldCheck, color: "text-orange-500" },
    { type: "trade", icon: Zap, color: "text-yellow-500" },
    { type: "exit", icon: ChevronRight, color: "text-red-500" },
  ];

  return (
    <div className="p-6 lg:p-10 bg-[#0D1117] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Strategy Builder</h1>
            <p className="text-slate-500 text-sm font-medium">Design professional trading algorithms without code.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={publishToMarketplace} onChange={e => setPublishToMarketplace(e.target.checked)} className="rounded" />
              Publish to Marketplace
            </label>
            {embedded && (
              <Button onClick={onClose} variant="ghost" className="btn-secondary flex items-center gap-2">
                <ChevronRight className="w-4 h-4 rotate-180" /> Back to Bots
              </Button>
            )}
            <Button onClick={handleSaveStrategy} disabled={saveStrategyMutation.isPending} className="btn-secondary">
              {saveStrategyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
            </Button>
            <Button onClick={() => setShowHistory(true)} variant="ghost" className="btn-secondary flex items-center gap-2">
              <History className="w-4 h-4" /> History
            </Button>
            <Button onClick={handleSaveAndDeploy} disabled={saveStrategyMutation.isPending} className="btn-primary flex items-center gap-2">
              <Play className="w-4 h-4" /> {embedded ? "Save & Add Bot" : "Deploy to Cloud"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Panel - Library */}
          <div className="space-y-6">
            <div className="bloomberg-panel p-6">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Execution Blocks</h3>
              <div className="grid grid-cols-1 gap-2">
                {blockTypes.map(bt => (
                  <button
                    key={bt.type}
                    onClick={() => addBlock(bt.type)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#161B22] border border-[#30363D] hover:border-blue-500 transition-all text-left group"
                  >
                    <bt.icon className={`w-4 h-4 ${bt.color}`} />
                    <span className="text-xs font-semibold text-slate-300 group-hover:text-white capitalize">{bt.type}</span>
                    <Plus className="w-3 h-3 ml-auto text-slate-600 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </div>

            <div className="bloomberg-panel p-6">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Saved Strategies</h3>
              <div className="space-y-3">
                {strategiesQuery.data?.slice(0, 5).map(s => (
                  <div key={s.id} className="p-3 rounded-lg bg-black/20 border border-white/5 hover:border-blue-500/50 cursor-pointer transition-all">
                    <p className="text-xs font-bold text-white truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Last edited 2h ago</p>
                  </div>
                ))}
                {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                  <p className="text-xs text-slate-600 italic">No strategies saved yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Main Canvas */}
          <div className="lg:col-span-3 space-y-6">
            {/* Strategy Meta */}
            <div className="bloomberg-panel p-6 flex flex-col md:flex-row gap-6">
               <div className="flex-1 space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Strategy Name</label>
                 <Input 
                   value={strategyName}
                   onChange={e => setStrategyName(e.target.value)}
                   placeholder="e.g., Mean Reversion V1" 
                   className="bg-transparent border-none text-xl font-bold p-0 focus-visible:ring-0 h-auto"
                 />
               </div>
               <div className="w-px bg-[#30363D] hidden md:block" />
               <div className="flex-1 space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                 <Input 
                   value={description}
                   onChange={e => setDescription(e.target.value)}
                   placeholder="Briefly explain your logic..." 
                   className="bg-transparent border-none text-sm p-0 focus-visible:ring-0 h-auto"
                 />
               </div>
            </div>

            {/* Canvas */}
            <div className="bloomberg-panel min-h-[500px] flex flex-col">
              <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workflow Canvas</span>
                </div>
                <div className="flex bg-[#161B22] rounded-lg p-1">
                   <button onClick={() => setBuilderMode("blocks")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "blocks" ? "bg-blue-600 text-white" : "text-slate-500"}`}>BLOCKS</button>
                   <button onClick={() => setBuilderMode("visual")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "visual" ? "bg-blue-600 text-white" : "text-slate-500"}`}>IF/THEN</button>
                   <button onClick={() => setBuilderMode("ensemble")} className={`px-3 py-1 text-[10px] font-bold rounded ${builderMode === "ensemble" ? "bg-purple-600 text-white" : "text-slate-500"}`}>ENSEMBLE</button>
                   <button onClick={() => setShowHistory((v) => !v)} className={`px-3 py-1 text-[10px] font-bold rounded ${showHistory ? "bg-amber-600 text-white" : "text-slate-500"}`}><GitCompare className="w-3 h-3 inline mr-1" />HISTORY</button>
                   <button onClick={() => critiqueMutation.mutate({ rule: buildConfig().rule })} className={`px-3 py-1 text-[10px] font-bold rounded ${critiqueMutation.isPending ? "opacity-50" : "hover:bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"}`}><ShieldCheck className="w-3 h-3 inline mr-1" />AI REVIEW</button>
                 </div>
               </div>

               {showHistory && (
                 <div className="border-b border-[#30363D] p-4 bg-black/20 space-y-3">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Version History ({versions.length})</span>
                     {versions.length >= 2 && compareIdx === null && (
                       <button onClick={() => setCompareIdx([versions.length - 2, versions.length - 1])} className="text-[10px] text-amber-400 hover:underline">Compare last two</button>
                     )}
                   </div>
                   {versions.length === 0 && <p className="text-xs text-slate-600">No saved versions yet. Save this strategy to start tracking history.</p>}
                   <div className="space-y-1">
                     {versions.map((v, i) => (
                       <div key={i} className="flex items-center gap-3 text-xs">
                         <span className="text-slate-500 w-40">{new Date(v.savedAt).toLocaleString()}</span>
                         <span className="text-slate-300">{summarizeRuleSafe(v.rule)}</span>
                       </div>
                     ))}
                   </div>
                   {compareIdx && versions[compareIdx[0]] && versions[compareIdx[1]] && (
                     <div className="grid grid-cols-2 gap-4 pt-2">
                       <div className="bg-[#161B22] border border-[#30363D] rounded p-3">
                         <p className="text-[10px] text-slate-500 mb-1">{new Date(versions[compareIdx[0]].savedAt).toLocaleString()}</p>
                         <p className="text-xs text-white whitespace-pre-wrap">{summarizeRuleSafe(versions[compareIdx[0]].rule)}</p>
                       </div>
                       <div className="bg-[#161B22] border border-[#30363D] rounded p-3">
                         <p className="text-[10px] text-slate-500 mb-1">{new Date(versions[compareIdx[1]].savedAt).toLocaleString()}</p>
                         <p className="text-xs text-white whitespace-pre-wrap">{summarizeRuleSafe(versions[compareIdx[1]].rule)}</p>
                       </div>
                     </div>
                    )}
                  </div>
                )}

                {critiqueMutation.data && (
                  <div className="border-b border-[#30363D] p-4 bg-black/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Risk Reviewer Agent</span>
                    </div>
                    <p className="text-xs text-slate-300 mb-3">{critiqueMutation.data.summary}</p>
                    <div className="space-y-2">
                      {((critiqueMutation.data.findings as any[]) || []).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${f.severity === "high" ? "bg-red-600/30 text-red-300" : f.severity === "medium" ? "bg-amber-600/30 text-amber-300" : "bg-slate-600/30 text-slate-300"}`}>{f.severity}</span>
                          <div><b className="text-white">{f.title}</b> <span className="text-slate-400">â€” {f.detail}</span></div>
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
                    <p className="text-xs text-slate-500">Combine 2â€“3 saved strategies into one bot. A trade fires only when the chosen number of sub-strategies agree (vote).</p>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vote rule</label>
                      <div className="flex gap-2 mt-2">
                        {(["all", "majority", "any"] as const).map((v) => (
                          <button key={v} onClick={() => setEnsembleVote(v)} className={`px-3 py-1 text-[10px] font-bold rounded ${ensembleVote === v ? "bg-purple-600 text-white" : "bg-[#161B22] text-slate-500 border border-[#30363D]"}`}>{v === "all" ? "ALL agree" : v === "majority" ? "MAJORITY" : "ANY"}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select strategies</label>
                      {((strategiesQuery.data || []) as any[]).filter((s) => s.config?.rule).map((s) => {
                        const checked = ensembleIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-3 bg-[#161B22] border border-[#30363D] rounded-lg p-3 cursor-pointer hover:border-purple-500/50">
                            <input type="checkbox" checked={checked} onChange={(e) => setEnsembleIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id))} className="rounded" />
                            <span className="text-sm text-white">{s.name}</span>
                            <span className="text-[10px] text-slate-500 ml-auto">{(s.config.rule.symbol) || "R_100"}</span>
                          </label>
                        );
                      })}
                      {(strategiesQuery.data || []).length === 0 && <p className="text-xs text-slate-600">No saved strategies yet. Build a few in IF/THEN mode first.</p>}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto space-y-6">
                    {blocks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-[#30363D] rounded-2xl">
                        <Plus className="w-8 h-8 text-slate-700 mb-4" />
                        <p className="text-slate-500 text-sm">Add blocks from the library to start building your workflow.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 relative">
                        {blocks.map((block, index) => {
                          const typeInfo = blockTypes.find(bt => bt.type === block.type)!;
                          return (
                            <div key={block.id} className="relative group">
                              {index < blocks.length - 1 && (
                                <div className="absolute left-6 top-12 w-0.5 h-8 bg-[#30363D]" />
                              )}
                              <div className="flex gap-4 items-start bg-[#161B22] border border-[#30363D] p-4 rounded-xl group-hover:border-blue-500/50 transition-all">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-slate-900 border border-white/5`}>
                                  <typeInfo.icon className={`w-6 h-6 ${typeInfo.color}`} />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{block.type}</span>
                                    <button onClick={() => removeBlock(block.id)} className="text-slate-600 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                  <Input 
                                    value={block.value}
                                    onChange={e => updateBlock(block.id, e.target.value)}
                                    placeholder={`Configure ${block.type} parameters...`}
                                    className="bg-transparent border-none p-0 text-sm focus-visible:ring-0 h-auto text-white placeholder:text-slate-700"
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
          <div className="w-full max-w-2xl bg-[#0D1117] border border-[#30363D] rounded-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#30363D]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><History className="w-4 h-4" /> Version History</h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white">âœ•</button>
            </div>
            <div className="p-4 space-y-2">
              {(() => {
                const versions: any[] = (editQuery.data?.config as any)?.versions || [];
                if (!versions.length) return <p className="text-sm text-slate-500">No saved versions yet. Save the strategy to start tracking history.</p>;
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
                          <span className="text-xs text-slate-400 w-24 shrink-0">{new Date(v.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <code className="text-[11px] text-slate-500 flex-1 truncate">{summarizeRule(v.rule)}</code>
                          <button onClick={() => setDiffA(i)} className={`text-[10px] px-2 py-0.5 rounded ${diffA === i ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400"}`}>A</button>
                          <button onClick={() => setDiffB(i)} className={`text-[10px] px-2 py-0.5 rounded ${diffB === i ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400"}`}>B</button>
                        </div>
                      ))}
                    </div>
                    {diffLines.length > 0 && (
                      <div className="mt-3 p-3 bg-black/40 rounded-lg font-mono text-[11px] overflow-x-auto">
                        <p className="text-slate-500 mb-2">Diff: v{(diffA ?? 0) + 1} â†’ v{(diffB ?? 0) + 1}</p>
                        {diffLines.map((l, i) => (
                          <div key={i} className={l.kind === "add" ? "text-emerald-400" : l.kind === "del" ? "text-red-400" : "text-slate-500"}>
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




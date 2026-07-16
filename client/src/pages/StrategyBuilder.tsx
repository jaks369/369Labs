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
  ShieldCheck
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

export function StrategyBuilderContent({ embedded = false, onClose, onSaved }: StrategyBuilderContentProps) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [strategyName, setStrategyName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<StrategyBlock[]>([]);
  const [rule, setRule] = useState<StrategyRule>(DEFAULT_RULE);
  const [builderMode, setBuilderMode] = useState<"visual" | "blocks">("blocks");
  const [publishToMarketplace, setPublishToMarketplace] = useState(false);

  const publishMutation = trpc.strategies.publish.useMutation();
  const saveStrategyMutation = trpc.strategies.save.useMutation();
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

  const handleSaveAndDeploy = async () => {
    if (!strategyName) { alert("Please enter a strategy name"); return; }
    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: builderMode === "visual" ? { rule: rule as any, summary: summarizeRule(rule) } : { blocks },
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

    try {
      await saveStrategyMutation.mutateAsync({
        name: strategyName,
        description,
        config: builderMode === "visual" ? { rule: rule as any, summary: summarizeRule(rule) } : { blocks },
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
                </div>
              </div>

              <div className="flex-1 p-8 space-y-4">
                {builderMode === "visual" ? (
                  <div className="max-w-2xl mx-auto py-10">
                    <RuleBuilder rule={rule} onChange={setRule} />
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
    </div>
  );
}

export default function StrategyBuilder() {
  const [, navigate] = useLocation();
  return <StrategyBuilderContent embedded={false} onClose={() => navigate("/bots")} onSaved={() => navigate("/bots")} />;
}

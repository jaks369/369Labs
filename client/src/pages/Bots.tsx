import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { 
  Bot, 
  Play, 
  Square, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  Zap,
  Settings,
  Plus
} from "lucide-react";
import { useLocation } from "wouter";

export default function Bots() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [activeBots, setActiveBots] = useState<any[]>([]);
  
  const strategiesQuery = trpc.strategies.list.useQuery();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Automated Bots</h1>
          <p className="text-slate-500 text-sm font-medium">Manage and monitor your 24/7 trading instances.</p>
        </div>
        <Button onClick={() => navigate("/strategy-builder")} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create New Bot
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Bots List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bloomberg-panel">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-black/20">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Running Instances</h2>
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold text-emerald-500">{activeBots.length} Active</span>
              </div>
            </div>
            
            <div className="p-0">
              {activeBots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-[#30363D]">
                    <Bot className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm mb-6">No bots are currently running.</p>
                  <Button variant="outline" className="btn-outline text-xs" onClick={() => navigate("/strategy-builder")}>
                    Deploy your first strategy
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[#30363D]">
                  {activeBots.map(bot => (
                    <div key={bot.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-600/10 rounded-lg flex items-center justify-center border border-blue-600/20">
                          <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{bot.symbol} • {bot.strategy}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Profit/Loss</p>
                          <p className="text-sm font-bold text-emerald-500">+$12.40</p>
                        </div>
                        <Button size="sm" variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white">
                          <Square className="w-3 h-3 mr-2 fill-current" /> Stop
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Stats & Available Strategies */}
        <div className="space-y-8">
          <div className="bloomberg-panel p-6">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">System Health</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                   <span className="text-xs text-slate-400">Cloud Status</span>
                   <span className="text-[10px] font-bold text-emerald-500 uppercase">Operational</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-xs text-slate-400">API Latency</span>
                   <span className="text-[10px] font-bold text-emerald-500 uppercase">24ms</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-xs text-slate-400">Total Uptime</span>
                   <span className="text-[10px] font-bold text-slate-300 uppercase">99.9%</span>
                </div>
             </div>
          </div>

          <div className="bloomberg-panel p-6">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Ready to Deploy</h3>
            <div className="space-y-3">
              {strategiesQuery.data?.map(s => (
                <div key={s.id} className="p-4 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-blue-500/50 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-xs font-bold text-white">{s.name}</h4>
                    <Zap className="w-3 h-3 text-blue-500" />
                  </div>
                  <Button className="w-full h-8 text-[10px] font-bold bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white border border-blue-600/20">
                    <Play className="w-3 h-3 mr-2 fill-current" /> Deploy Bot
                  </Button>
                </div>
              ))}
              {(!strategiesQuery.data || strategiesQuery.data.length === 0) && (
                <p className="text-xs text-slate-600 italic text-center py-4">No strategies found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

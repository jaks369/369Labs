import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ShoppingBag, Star, TrendingUp, Clock, ArrowUpRight, Bot, BarChart3, Sparkles, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const marketplaceQuery = trpc.strategies.marketplace.useQuery();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const strategies = marketplaceQuery.data || [];
  const filtered = strategies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Strategy Marketplace</h1>
            <p className="text-slate-400 text-sm mt-1">Browse and deploy community-vetted trading strategies</p>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-amber-500 font-bold text-sm">{strategies.length} Strategies Available</span>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search strategies by name or tag..."
            className="w-full bg-[#161B22] border-[#30363D] pl-12 py-6 text-base rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {marketplaceQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.length > 0 ? filtered.map(s => (
              <div key={s.id} className="bg-[#161B22] border border-[#30363D] rounded-xl p-6 hover:border-blue-500/50 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{s.name}</h3>
                    <p className="text-xs text-slate-500 mt-1"><Bot className="w-3 h-3 inline" /> Published</p>
                  </div>
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">{s.description || "No description"}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#30363D]">
                  <span className="text-xs text-slate-500"><Clock className="w-3 h-3 inline" /> {new Date(s.createdAt).toLocaleDateString()}</span>
                  <Button onClick={() => navigate("/strategy-builder")} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg flex items-center gap-1">
                    Use Strategy <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )) : (
              <div className="col-span-2 text-center py-20">
                <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500">No published strategies yet. Build one and publish it from the Strategy Builder!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

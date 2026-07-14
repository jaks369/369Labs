import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ShoppingBag, Star, TrendingUp, Clock, ArrowUpRight, Bot, BarChart3, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

const strategies = [
  {
    name: "Volatility 75 Scalper",
    author: "369Quant",
    rating: 4.9,
    trades: 15230,
    winRate: 73.2,
    profit: "+$12,450",
    minAmount: "$50",
    tags: ["Volatility", "Scalping", "Low Risk"],
    description: "Scalping strategy optimized for Volatility 75 index. Uses EMA crossover with dynamic position sizing.",
  },
  {
    name: "Boom & Crash Guardian",
    author: "AlphaTrades",
    rating: 4.7,
    trades: 8740,
    winRate: 68.5,
    profit: "+$8,230",
    minAmount: "$100",
    tags: ["Boom & Crash", "Trend Following", "Medium Risk"],
    description: "Captures explosive moves on Boom and Crash indices with tight stop-loss management.",
  },
  {
    name: "Step Index Arbitrage",
    author: "MarketMaker",
    rating: 4.8,
    trades: 21500,
    winRate: 81.1,
    profit: "+$18,900",
    minAmount: "$200",
    tags: ["Step Index", "Arbitrage", "High Frequency"],
    description: "High-frequency arbitrage strategy exploiting micro-patterns in Step Index movements.",
  },
  {
    name: "Digital Options Pro",
    author: "OptionKing",
    rating: 4.6,
    trades: 6320,
    winRate: 65.8,
    profit: "+$5,670",
    minAmount: "$25",
    tags: ["Digital Options", "Digit Predictor", "All Risk"],
    description: "Predicts digit outcomes using advanced statistical models on tick history.",
  },
];

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const filtered = strategies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strategies by name or tag..."
            className="w-full bg-[#161B22] border-[#30363D] pl-12 py-6 text-base rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((s) => (
            <div key={s.name} className="bg-[#161B22] border border-[#30363D] rounded-xl p-6 hover:border-blue-500/50 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{s.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <Bot className="w-3 h-3" /> by {s.author}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-bold text-sm">{s.rating}</span>
                </div>
              </div>

              <p className="text-slate-400 text-sm leading-relaxed mb-4">{s.description}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {s.tags.map((t) => (
                  <span key={t} className="px-2.5 py-1 bg-slate-800 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-wider border border-slate-700">
                    {t}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 py-3 border-t border-[#30363D]">
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Trades</p>
                  <p className="text-sm font-bold text-white flex items-center gap-1"><BarChart3 className="w-3 h-3 text-blue-500" /> {(s.trades / 1000).toFixed(1)}k</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Win Rate</p>
                  <p className="text-sm font-bold text-emerald-500">{s.winRate}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Profit</p>
                  <p className="text-sm font-bold text-emerald-400">{s.profit}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" /> Min: {s.minAmount}
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg flex items-center gap-1">
                  Deploy Strategy <ArrowUpRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No strategies match your search</p>
          </div>
        )}
      </div>
    </div>
  );
}

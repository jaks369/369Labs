import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  Search,
  LayoutGrid,
  List,
  Zap,
  Brain
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(0);
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("R_50");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (tradesQuery.data) {
      const totalPnl = tradesQuery.data.reduce((sum, trade) => {
        const pnlValue = parseFloat(trade.profitLoss?.toString() || "0");
        return sum + pnlValue;
      }, 0);
      setPnl(totalPnl);
    }
  }, [tradesQuery.data]);

  useEffect(() => {
    if (botRunsQuery.data) {
      const running = botRunsQuery.data.some(run => run.status === "running");
      setBotRunning(running);
    }
  }, [botRunsQuery.data]);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Market Overview</h1>
          <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search markets..." 
                className="bg-[#161B22] border-[#30363D] pl-10 pr-4 py-2 rounded-lg text-sm focus:border-blue-500 transition-colors w-64"
              />
           </div>
           <Button className="btn-primary">Connect Account</Button>
        </div>
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bloomberg-panel p-5 border-l-4 border-l-blue-600">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Balance</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-white">${balance.toFixed(2)}</span>
            <span className="text-xs text-slate-500 mb-1">USD</span>
          </div>
        </div>
        <div className={`bloomberg-panel p-5 border-l-4 ${pnl >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Net Profit/Loss</p>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </span>
            {pnl >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <div className="bloomberg-panel p-5 border-l-4 border-l-slate-700">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Bots</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">
              {botRunsQuery.data?.filter(r => r.status === "running").length || 0}
            </span>
            <div className={`status-dot ${botRunning ? "status-dot-success" : "bg-slate-700"}`} />
          </div>
        </div>
        <div className="bloomberg-panel p-5 border-l-4 border-l-slate-700">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Win Rate</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-white">
              {tradesQuery.data && tradesQuery.data.length > 0 
                ? ((tradesQuery.data.filter(t => t.result === "win").length / tradesQuery.data.length) * 100).toFixed(1)
                : "0.0"}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bloomberg-panel overflow-hidden">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-white">Live Market Feed</h2>
                <div className="flex gap-1">
                  {["R_50", "R_100", "EURUSD"].map(s => (
                    <button 
                      key={s}
                      onClick={() => setSelectedSymbol(s)}
                      className={`px-3 py-1 text-[10px] font-bold rounded ${selectedSymbol === s ? "bg-blue-600 text-white" : "text-slate-500 hover:text-white"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
            </div>
            <div className="p-6 bg-black/40 h-[400px]">
              <TickChart symbol={selectedSymbol} maxDataPoints={50} />
            </div>
          </div>

          {/* Recent Trades Table */}
          <div className="bloomberg-panel">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
              <h2 className="font-bold text-white uppercase text-xs tracking-widest">Recent Executions</h2>
              <div className="flex gap-2">
                <button onClick={() => setViewMode("grid")} className={`p-1 ${viewMode === "grid" ? "text-blue-500" : "text-slate-600"}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setViewMode("list")} className={`p-1 ${viewMode === "list" ? "text-blue-500" : "text-slate-600"}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-[#30363D]">
                    <th className="p-4 font-bold">SYMBOL</th>
                    <th className="p-4 font-bold">TYPE</th>
                    <th className="p-4 font-bold">STAKE</th>
                    <th className="p-4 font-bold">ENTRY</th>
                    <th className="p-4 font-bold">RESULT</th>
                    <th className="p-4 font-bold text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D]">
                  {tradesQuery.data?.slice(0, 8).map(trade => (
                    <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-semibold text-white">R_50</td>
                      <td className="p-4 text-slate-400">RISE</td>
                      <td className="p-4 text-slate-400">${trade.stake}</td>
                      <td className="p-4 text-slate-400">{trade.entryPrice}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-sm font-bold text-[10px] ${
                          trade.result === "win" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        }`}>
                          {trade.result.toUpperCase()}
                        </span>
                      </td>
                      <td className={`p-4 text-right font-bold ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${trade.profitLoss}
                      </td>
                    </tr>
                  ))}
                  {(!tradesQuery.data || tradesQuery.data.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-600 italic">No recent trades found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar Section */}
        <div className="space-y-8">
          {/* Quick Actions */}
          <div className="bloomberg-panel p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Quick Launch</h3>
            <div className="space-y-3">
              <Button onClick={() => navigate("/strategy-builder")} className="w-full btn-primary justify-start gap-3">
                <Zap className="w-4 h-4" /> New Strategy
              </Button>
              <Button onClick={() => navigate("/ai-assistant")} className="w-full btn-secondary justify-start gap-3">
                <Brain className="w-4 h-4" /> Ask 369AI
              </Button>
              <Button onClick={() => navigate("/marketplace")} className="w-full btn-outline justify-start gap-3">
                <LayoutGrid className="w-4 h-4" /> Browse Marketplace
              </Button>
            </div>
          </div>

          {/* Market Status */}
          <div className="bloomberg-panel p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Market Status</h3>
            <div className="space-y-4">
              {[
                { name: "Volatility 50", status: "Open", trend: "up" },
                { name: "Volatility 100", status: "Open", trend: "down" },
                { name: "EUR/USD", status: "Open", trend: "up" },
                { name: "GBP/USD", status: "Open", trend: "up" },
              ].map(m => (
                <div key={m.name} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{m.name}</span>
                  <div className="flex items-center gap-3">
                    {m.trend === "up" ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights */}
          <div className="bloomberg-panel p-6 bg-blue-600/5 border-blue-600/20">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest">369AI Insight</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic">
              "Volatility 50 index is showing a strong bullish divergence on the 15m RSI. 
              Consider a Mean Reversion strategy for the next 10 ticks."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

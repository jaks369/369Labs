import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BarChart4, TrendingUp, DollarSign, Activity, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 500 });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const trades = tradesQuery.data || [];
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === "win").length;
  const losses = trades.filter(t => t.result === "loss").length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;

  const stats = [
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, icon: DollarSign, color: totalPnl >= 0 ? "text-emerald-500" : "text-red-500" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-blue-500" },
    { label: "Total Trades", value: totalTrades.toString(), icon: Activity, color: "text-purple-500" },
    { label: "Avg. Trade", value: `${avgTrade >= 0 ? "+" : ""}$${avgTrade.toFixed(2)}`, icon: BarChart4, color: avgTrade >= 0 ? "text-emerald-500" : "text-red-500" },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Performance overview of all your trading bots</p>
        </div>

        {tradesQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => (
                <div key={s.label} className="bg-[#161B22] border border-[#30363D] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{s.label}</span>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Recent Trades</h2>
                {trades.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trades.slice(0, 20).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${t.result === "win" ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span className="text-sm text-slate-300">${t.stake} {t.result}</span>
                        </div>
                        <span className={`text-sm font-bold ${parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${t.profitLoss}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-slate-500">No trades yet — deploy a bot</div>
                )}
              </div>
              <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Summary</h2>
                <div className="space-y-4">
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-slate-400">Wins</span>
                    <span className="text-emerald-500 font-bold">{wins}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-slate-400">Losses</span>
                    <span className="text-red-500 font-bold">{losses}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-slate-400">Win Rate</span>
                    <span className="text-blue-500 font-bold">{winRate}%</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg border border-[#30363D]">
                    <span className="text-white font-bold">Total P&L</span>
                    <span className={`font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

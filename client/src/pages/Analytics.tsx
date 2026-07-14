import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart4, TrendingUp, DollarSign, Activity, ArrowUp, ArrowDown } from "lucide-react";
import { useLocation } from "wouter";

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const stats = [
    { label: "Total P&L", value: "+$2,450", icon: DollarSign, color: "text-emerald-500" },
    { label: "Win Rate", value: "68.3%", icon: TrendingUp, color: "text-blue-500" },
    { label: "Total Trades", value: "847", icon: Activity, color: "text-purple-500" },
    { label: "Avg. Trade", value: "+$2.89", icon: BarChart4, color: "text-amber-500" },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Performance overview of all your trading bots</p>
        </div>

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
            <h2 className="text-lg font-bold text-white mb-4">Daily P&L</h2>
            <div className="flex items-center justify-center h-64 text-slate-500">
              <p>Chart coming soon — connect more data to populate</p>
            </div>
          </div>
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Recent Activity</h2>
            <div className="flex items-center justify-center h-64 text-slate-500">
              <p>No trades yet — deploy a bot to see activity</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

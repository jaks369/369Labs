import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Play, BarChart3, TrendingUp, Clock, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Backtesting() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState("R_100");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [running, setRunning] = useState(false);

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Backtesting Engine</h1>
            <p className="text-slate-400 text-sm mt-1">Test your strategies against historical market data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-[#161B22] border border-[#30363D] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Parameters</h2>
            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Symbol</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm">
                <option>R_100</option><option>R_50</option><option>R_75</option><option>R_25</option>
                <option>BOOM1000</option><option>CRASH1000</option><option>EURUSD</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <Button onClick={() => setRunning(true)} disabled={running} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</> : <><Play className="w-4 h-4 mr-2" /> Run Backtest</>}
            </Button>
          </div>

          <div className="lg:col-span-2 bg-[#161B22] border border-[#30363D] rounded-xl p-6">
            <div className="flex items-center justify-center h-64 text-slate-500">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-slate-700" />
                <p>Configure parameters and run a backtest to see results</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

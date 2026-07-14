import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Cloud, Server, Power, PowerOff, Globe, Clock, Activity } from "lucide-react";
import { useLocation } from "wouter";

export default function CloudBots() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const [bots] = useState([
    { id: 1, name: "Volatility Scalper", region: "us-east", status: "running", uptime: "3d 12h", trades: 342, pnl: "+$124.50" },
    { id: 2, name: "Boom Guard", region: "eu-west", status: "stopped", uptime: "0d 0h", trades: 0, pnl: "$0.00" },
  ]);

  return (
    <div className="min-h-screen bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Cloud Bots</h1>
            <p className="text-slate-400 text-sm mt-1">Manage bots running on 369Labs cloud infrastructure</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
            <Cloud className="w-4 h-4" /> Deploy New Cloud Bot
          </Button>
        </div>

        <div className="space-y-4">
          {bots.map(bot => (
            <div key={bot.id} className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bot.status === "running" ? "bg-emerald-500/10" : "bg-slate-800"}`}>
                  <Server className={`w-5 h-5 ${bot.status === "running" ? "text-emerald-500" : "text-slate-600"}`} />
                </div>
                <div>
                  <h3 className="font-bold text-white">{bot.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {bot.region}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {bot.uptime}</span>
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {bot.trades} trades</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`font-bold ${bot.pnl.startsWith("+") ? "text-emerald-500" : "text-slate-400"}`}>{bot.pnl}</span>
                <Button className={bot.status === "running" ? "bg-red-600/10 text-red-500 hover:bg-red-600/20" : "bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20"}>
                  {bot.status === "running" ? <><PowerOff className="w-4 h-4" /> Stop</> : <><Power className="w-4 h-4" /> Start</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

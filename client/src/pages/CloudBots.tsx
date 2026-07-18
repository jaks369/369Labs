import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Cloud, Server, Power, PowerOff, Globe, Clock, Activity, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function CloudBots() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const stopRunMutation = trpc.bot.stopRun.useMutation();
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const bots = botRunsQuery.data || [];

  return (
    <div className="min-h-screen bg-[#151B23] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Cloud Bots</h1>
            <p className="text-[#94A3B8] text-sm mt-1">Manage bots running on 369Labs cloud infrastructure</p>
          </div>
        </div>

        {botRunsQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#F59E0B]" /></div>
        ) : bots.length === 0 ? (
          <div className="text-center py-20">
            <Cloud className="w-12 h-12 text-[#252B35] mx-auto mb-4" />
            <p className="text-[#64748B]">No bots deployed yet. Create a strategy and deploy it from the Bots page.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bots.map(bot => (
              <div key={bot.id} className="bg-[#151B23] border border-[#252B35] rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bot.status === "running" ? "bg-[#22C55E]/10" : "bg-[#151B23]"}`}>
                    <Server className={`w-5 h-5 ${bot.status === "running" ? "text-[#22C55E]" : "text-[#64748B]"}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Bot Run #{bot.id}</h3>
                    <div className="flex items-center gap-3 text-xs text-[#64748B] mt-1">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(bot.startTime).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {bot.totalTrades} trades</span>
                      <span className={`font-bold ${parseFloat(bot.totalProfitLoss?.toString() || "0") >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                        ${bot.totalProfitLoss}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold uppercase ${bot.status === "running" ? "text-[#22C55E]" : "text-[#64748B]"}`}>
                    {bot.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

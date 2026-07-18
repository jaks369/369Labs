import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Cloud, Server, PowerOff, Clock, Activity, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function CloudBots() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const stopRunMutation = trpc.bot.stopRun.useMutation({
    onSuccess: () => botRunsQuery.refetch(),
  });
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const bots = botRunsQuery.data || [];

  const handleStop = async (id: number) => {
    setStoppingId(id);
    try {
      await stopRunMutation.mutateAsync({ id, status: "stopped" });
    } catch {
      // Non-fatal — refresh to reflect current state.
      botRunsQuery.refetch();
    } finally {
      setStoppingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#151B23] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Cloud Bots</h1>
            <p className="text-[#94A3B8] text-sm mt-1">Manage bots running on 369Labs cloud infrastructure</p>
          </div>
          <button onClick={() => navigate("/bots")} className="btn-outline text-xs flex items-center gap-2">
            <Server className="w-3.5 h-3.5" /> Manage Live Bots
          </button>
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
                  {bot.status === "running" && (
                    <button
                      onClick={() => handleStop(bot.id)}
                      disabled={stoppingId === bot.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {stoppingId === bot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                      Stop
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

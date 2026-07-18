import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Terminal, Activity, Bot, Brain, ShieldCheck } from "lucide-react";
import AITimeline from "@/components/AITimeline";

const ACTION_ICON: Record<string, any> = {
  "bot.start": Bot,
  "bot.stop": Bot,
  "token.add": ShieldCheck,
  "memory.update": Brain,
};

export default function Logs() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const logsQuery = trpc.logs.recent.useQuery({ limit: 100 });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const logs = logsQuery.data?.logs || [];

  return (
    <div className="min-h-screen bg-[#151515] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Terminal className="w-7 h-7 text-[#22C55E]" /> Observability
          </h1>
          <p className="text-[#A8A8A8] text-sm mt-1">Live agent activity, audit trail, and system events.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E89A2A]" /> Live Agent Activity
            </h2>
            <AITimeline />
          </div>

          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4">Audit Trail</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-[#6F6F6F]">No recorded actions yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs">
                {logs.map((l: any, i: number) => {
                  const Icon = ACTION_ICON[l.action] || Activity;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2 bg-black/20 rounded-lg">
                      <Icon className="w-3.5 h-3.5 text-[#A8A8A8] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[#22C55E]">{l.action}</span>
                        {l.target && <span className="text-[#6F6F6F]"> · {l.target}</span>}
                      </div>
                      <span className="text-[#6F6F6F] tabular-nums shrink-0">
                        {new Date(l.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

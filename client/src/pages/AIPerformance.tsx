import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { BarChart3, TrendingUp, TrendingDown, Target, Brain, ShieldCheck, Zap, Award, AlertCircle, Loader2 } from "lucide-react";

export default function AIPerformance() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"overview" | "accuracy" | "intelligence" | "risk" | "rankings" | "recommendations">("overview");

  const overview = trpc.aiPerformance.overview.useQuery(undefined, { enabled: isAuthenticated && tab === "overview" });
  const accuracy = trpc.aiPerformance.accuracyDetail.useQuery(undefined, { enabled: isAuthenticated && tab === "accuracy" });
  const intelligence = trpc.aiPerformance.tradeIntelligence.useQuery(undefined, { enabled: isAuthenticated && tab === "intelligence" });
  const risk = trpc.aiPerformance.riskBehaviour.useQuery(undefined, { enabled: isAuthenticated && tab === "risk" });
  const rankings = trpc.aiPerformance.strategyRankings.useQuery(undefined, { enabled: isAuthenticated && tab === "rankings" });
  const recommendations = trpc.aiPerformance.recommendations.useQuery(undefined, { enabled: isAuthenticated && tab === "recommendations" });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: BarChart3 },
    { key: "accuracy" as const, label: "Accuracy", icon: Target },
    { key: "intelligence" as const, label: "Intelligence", icon: Brain },
    { key: "risk" as const, label: "Risk", icon: ShieldCheck },
    { key: "rankings" as const, label: "Rankings", icon: Award },
    { key: "recommendations" as const, label: "Recommendations", icon: Zap },
  ];

  const queries = { overview, accuracy, intelligence, risk, rankings, recommendations };
  const currentQuery = queries[tab];
  const data = currentQuery.data;

  const renderMetricCard = (label: string, value: string | number, icon: any, color: string) => (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${color}`}>{icon}</div>
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">AI Performance</h1>
            <p className="text-xs text-[var(--text-muted)]">Performance analytics for AI-driven trading decisions</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === t.key ? "bg-[var(--amber)] text-black" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {currentQuery.isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--amber)]" /></div>
        ) : currentQuery.error ? (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400 text-sm">Failed to load data: {currentQuery.error.message}</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(data).slice(0, 8).map(([key, val]) => (
                <div key={key} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <p className="text-xs text-[var(--text-muted)] mb-1 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                  <p className="text-lg font-bold text-white font-mono">{typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val)}</p>
                </div>
              ))}
            </div>
            <pre className="bg-black/30 rounded-xl p-4 text-xs text-[var(--text-secondary)] font-mono overflow-auto max-h-[400px]">{JSON.stringify(data, null, 2)}</pre>
          </div>
        ) : (
          <div className="text-center py-20 text-[var(--text-muted)] text-sm">No data available. AI performance metrics will populate as the AI analyzes trades.</div>
        )}
      </div>
    </div>
  );
}

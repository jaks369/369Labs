import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { BarChart3, Target, Brain, ShieldCheck, Zap, Award, AlertCircle, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

type Tab = "overview" | "accuracy" | "intelligence" | "risk" | "rankings" | "recommendations";

const isPlain = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);

function fmtCell(v: any): string {
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (isPlain(v) || Array.isArray(v)) return JSON.stringify(v);
  return String(v ?? "—");
}

function Table({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No data available.</p>;
  }
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-base)]">
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] capitalize whitespace-nowrap">
                {c.replace(/([A-Z])/g, " $1").trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border)]">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-[var(--text-secondary)] font-mono tabular-nums whitespace-nowrap">{fmtCell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: any[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
      <Table rows={rows} />
    </div>
  );
}

function StringList({ title, icon, items }: { title: string; icon: any; items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">{icon} {title}</h3>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
            <span>{typeof it === "string" ? it : JSON.stringify(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricGrid({ data }: { data: any }) {
  if (!data || (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0)) {
    return <p className="text-sm text-[var(--text-muted)]">No data available.</p>;
  }
  const entries = Array.isArray(data) ? [] : Object.entries(data);
  const scalars = entries.filter(([, v]) => typeof v !== "object" || v === null);
  if (scalars.length === 0) return <Table rows={Array.isArray(data) ? data : []} />;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {scalars.map(([key, val]) => (
        <div key={key} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-medium mb-1 capitalize" style={{ color: "var(--text-muted)" }}>
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          <p className="text-xl font-bold text-white font-mono tabular-nums break-words">{fmtCell(val)}</p>
        </div>
      ))}
    </div>
  );
}

function TabBody({ tab, data }: { tab: Tab; data: any }) {
  if (tab === "accuracy") {
    return (
      <div className="space-y-6">
        <Section title="Accuracy by Symbol" rows={data?.bySymbol} />
        <Section title="Accuracy by Contract Type" rows={data?.byContractType} />
        <Section title="Accuracy Over Time" rows={data?.overTime} />
        <Section title="Confidence vs Outcome" rows={data?.confidenceVsOutcome} />
      </div>
    );
  }
  if (tab === "intelligence") {
    return (
      <div className="space-y-6">
        <StringList title="Common Strengths" icon={<TrendingUp className="w-4 h-4 text-[var(--green)]" />} items={data?.commonStrengths} />
        <StringList title="Common Weaknesses" icon={<TrendingDown className="w-4 h-4 text-[var(--red)]" />} items={data?.commonWeaknesses} />
        <StringList title="Common Loss Reasons" icon={<AlertTriangle className="w-4 h-4 text-[var(--red)]" />} items={data?.commonLossReasons} />
        <Section title="Successful Setups" rows={data?.successfulSetups} />
        <Section title="Failed Setups" rows={data?.failedSetups} />
      </div>
    );
  }
  if (tab === "rankings") {
    return <Section title="Strategy Rankings" rows={Array.isArray(data) ? data : []} />;
  }
  if (tab === "recommendations") {
    return <StringList title="Recommendations" icon={<CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />} items={Array.isArray(data) ? data : []} />;
  }
  return <MetricGrid data={data} />;
}

export default function AIPerformance() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");

  const overview = trpc.aiPerformance.overview.useQuery(undefined, { enabled: isAuthenticated && tab === "overview" });
  const accuracy = trpc.aiPerformance.accuracyDetail.useQuery(undefined, { enabled: isAuthenticated && tab === "accuracy" });
  const intelligence = trpc.aiPerformance.tradeIntelligence.useQuery(undefined, { enabled: isAuthenticated && tab === "intelligence" });
  const risk = trpc.aiPerformance.riskBehaviour.useQuery(undefined, { enabled: isAuthenticated && tab === "risk" });
  const rankings = trpc.aiPerformance.strategyRankings.useQuery(undefined, { enabled: isAuthenticated && tab === "rankings" });
  const recommendations = trpc.aiPerformance.recommendations.useQuery(undefined, { enabled: isAuthenticated && tab === "recommendations" });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const tabs = [
    { key: "overview" as Tab, label: "Overview", icon: BarChart3 },
    { key: "accuracy" as Tab, label: "Accuracy", icon: Target },
    { key: "intelligence" as Tab, label: "Intelligence", icon: Brain },
    { key: "risk" as Tab, label: "Risk", icon: ShieldCheck },
    { key: "rankings" as Tab, label: "Rankings", icon: Award },
    { key: "recommendations" as Tab, label: "Recommendations", icon: Zap },
  ];

  const queries: Record<Tab, any> = { overview, accuracy, intelligence, risk, rankings, recommendations };
  const currentQuery = queries[tab];
  const data = currentQuery.data;

  return (
    <div className="h-full p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">AI Performance</h1>
            <p className="text-xs text-[var(--text-muted)]">Performance analytics for AI-driven trading decisions</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-[var(--accent)] text-black font-semibold" : "bg-transparent border border-[var(--border)] text-[var(--text-muted)] hover:text-white"}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {currentQuery.isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
        ) : currentQuery.error ? (
          <div className="bg-[var(--red-soft)] border border-[var(--red)]/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-[var(--red)] mx-auto mb-2" />
            <p className="text-[var(--red)] text-sm">Failed to load data: {currentQuery.error.message}</p>
          </div>
        ) : (
          <TabBody tab={tab} data={data} />
        )}
      </div>
    </div>
  );
}

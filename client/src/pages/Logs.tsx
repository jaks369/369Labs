import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Terminal, Activity, Bot, Brain, ShieldCheck, Loader2, AlertCircle, AlertTriangle, X } from "lucide-react";
import AITimeline from "@/components/AITimeline";
import { getErrors, clearErrors, ErrorLogEntry } from "@/lib/errorLog";

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
  const [appErrors, setAppErrors] = useState<ErrorLogEntry[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setAppErrors(getErrors()), 1000);
    setAppErrors(getErrors());
    return () => clearInterval(interval);
  }, []);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const logs = logsQuery.data?.logs || [];

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Terminal className="w-7 h-7 text-[var(--green)]" /> Observability
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Live agent activity, audit trail, and system events.</p>
        </div>

        {appErrors.length > 0 && (
          <div className="bg-[var(--card)] border border-red-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Application Errors ({appErrors.length})
              </h2>
              <button onClick={() => { clearErrors(); setAppErrors([]); }} className="text-[var(--text-muted)] hover:text-white text-xs flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
              {[...appErrors].reverse().slice(0, 100).map((e) => (
                <div key={e.id} className="flex items-start gap-2 p-2 bg-red-900/10 rounded-lg border border-red-500/10">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-300 flex-1">{e.message}</span>
                  <span className="text-[var(--text-muted)] tabular-nums shrink-0">{new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--cyan)]" /> Live Agent Activity
            </h2>
            <AITimeline />
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4">Audit Trail</h2>
            {logsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--amber)]" /></div>
            ) : logsQuery.isError ? (
              <div className="flex items-center justify-center py-12 text-center">
                <div>
                  <AlertCircle className="w-8 h-8 text-[var(--red)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--red)]">Failed to load audit log</p>
                </div>
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No recorded actions yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs">
                {logs.map((l: any, i: number) => {
                  const Icon = ACTION_ICON[l.action] || Activity;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2 bg-black/20 rounded-lg">
                      <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[var(--green)]">{l.action}</span>
                        {l.target && <span className="text-[var(--text-muted)]"> Â· {l.target}</span>}
                      </div>
                      <span className="text-[var(--text-muted)] tabular-nums shrink-0">
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

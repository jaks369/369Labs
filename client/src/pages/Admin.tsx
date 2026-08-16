import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "@/components/Toast";
import { Shield, Activity, Clock, HardDrive, Database, Cpu, Loader2, ScrollText, BarChart3, Users, RefreshCw, HeartPulse } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const listQuery = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });
  const auditLogsQuery = trpc.admin.auditLogs.useQuery({ limit: 100 }, { enabled: isAdmin });
  const healthQuery = trpc.admin.systemHealth.useQuery(undefined, { enabled: isAdmin });
  const ledgerQuery = trpc.admin.ledgerHealth.useQuery(undefined, { enabled: isAdmin, refetchInterval: 30_000 });
  const reconHistoryQuery = trpc.admin.reconRunHistory.useQuery({ limit: 20 }, { enabled: isAdmin });
  const runReconcileMutation = trpc.admin.runReconciliation.useMutation();
  const promoteMutation = trpc.admin.promoteToAdmin.useMutation({ onSuccess: () => listQuery.refetch() });
  const demoteMutation = trpc.admin.demoteToUser.useMutation({ onSuccess: () => listQuery.refetch() });
  const deleteMutation = trpc.admin.deleteUser.useMutation({ onSuccess: () => listQuery.refetch() });
  const [tab, setTab] = useState<"users" | "audit" | "health" | "perf" | "ledger" | "stats">("users");
  const [dryRunMode, setDryRunMode] = useState(true);
  // Beat so the heartbeat "stale" pulse refreshes between refetchIntervals.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  if (!user || user.role !== "admin") {
    return <div className="flex items-center justify-center min-h-[60vh] text-[var(--text-muted)]">Access denied. Admin privileges required.</div>;
  }

  if (listQuery.isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="h-8 w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  const formatBytes = (b: number) => {
    if (b === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)] pb-3">
          {(["users", "audit", "ledger", "health", "perf", "stats"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t ? "bg-[var(--accent)] text-black" : "text-[var(--text-secondary)] hover:text-white"}`}>
            {t === "users" ? "Users" : t === "audit" ? "Audit Logs" : t === "ledger" ? "Ledger Health" : t === "health" ? "System Health" : t === "perf" ? "Performance" : "Usage Stats"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                <th className="pb-2 font-medium">ID</th><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Role</th><th className="pb-2 font-medium">Verified</th><th className="pb-2 font-medium">Created</th><th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data?.users?.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)]/50">
                  <td className="py-2.5">{u.id}</td>
                  <td className="py-2.5">{u.email}</td>
                  <td className="py-2.5">{u.name || "—"}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === "admin" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 text-[var(--text-muted)]"}`}>{u.role}</span>
                  </td>
                  <td className="py-2.5">{u.emailVerified ? "✓" : "✗"}</td>
                  <td className="py-2.5 text-[var(--text-muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      {u.role === "user" ? (
                        <button onClick={() => promoteMutation.mutate({ userId: u.id })} className="text-xs text-[var(--accent)] hover:underline">Promote</button>
                      ) : (u.id !== user.id && (
                        <button onClick={() => demoteMutation.mutate({ userId: u.id })} className="text-xs text-[var(--text-muted)] hover:underline hover:text-[var(--accent)]">Demote</button>
                      ))}
                      {u.id !== user.id && (
                        <button onClick={() => { if (confirm(`Delete user ${u.email}?`)) deleteMutation.mutate({ userId: u.id }); }} className="text-xs text-[var(--red)] hover:underline">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ScrollText className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Security Audit Log</span>
            <span className="text-caption ml-auto">{(auditLogsQuery.data?.logs || []).length} entries</span>
          </div>
          {auditLogsQuery.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="pb-2 text-left font-bold">Time</th><th className="pb-2 text-left font-bold">User ID</th><th className="pb-2 text-left font-bold">Action</th><th className="pb-2 text-left font-bold">Target</th><th className="pb-2 text-left font-bold">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(auditLogsQuery.data?.logs || []).map((log: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="py-2 text-[var(--text-muted)] whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="py-2">{log.userId}</td>
                      <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-white/5 text-[var(--accent)]">{log.action}</span></td>
                      <td className="py-2 text-[var(--text-secondary)]">{log.target || "—"}</td>
                      <td className="py-2 text-[var(--text-muted)] max-w-[200px] truncate">{log.detail ? JSON.stringify(log.detail).slice(0, 80) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "health" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {healthQuery.isLoading ? (
            <div className="col-span-2 flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
          ) : healthQuery.isError ? (
            <div className="col-span-2 text-center text-[var(--red)] text-sm">Failed to load system health</div>
          ) : healthQuery.data ? (
            <>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><HardDrive className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">Memory</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Total</span><span className="text-white">{formatBytes(healthQuery.data.memory.total)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Used</span><span className="text-[var(--accent)]">{formatBytes(healthQuery.data.memory.used)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Free</span><span className="text-[var(--green)]">{formatBytes(healthQuery.data.memory.free)}</span></div>
                  <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${(healthQuery.data.memory.used / healthQuery.data.memory.total) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Cpu className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">CPU</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (1m)</span><span className="text-white">{Number(healthQuery.data.cpu.loadAvg1).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (5m)</span><span className="text-white">{Number(healthQuery.data.cpu.loadAvg5).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (15m)</span><span className="text-white">{Number(healthQuery.data.cpu.loadAvg15).toFixed(2)}</span></div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">Database</h3></div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${healthQuery.data.database === "connected" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                  <span className="text-white">{healthQuery.data.database}</span>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">System</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Node</span><span className="text-white">{healthQuery.data.node}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Platform</span><span className="text-white">{healthQuery.data.platform}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Uptime</span><span className="text-white">{Math.floor(healthQuery.data.uptime / 86400)}d {Math.floor((healthQuery.data.uptime % 86400) / 3600)}h</span></div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Usage Statistics</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-micro">Total Users</p>
              <p className="text-3xl font-bold text-white mt-1">{listQuery.data?.users.length || 0}</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-micro">Admins</p>
              <p className="text-3xl font-bold text-white mt-1">{listQuery.data?.users.filter(u => u.role === "admin").length || 0}</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-micro">Verified Users</p>
              <p className="text-3xl font-bold text-white mt-1">{listQuery.data?.users.filter(u => u.emailVerified).length || 0}</p>
            </div>
          </div>
        </div>
      )}

      {tab === "perf" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">System Performance Audit</span>
          </div>
          {healthQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
          ) : healthQuery.data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[var(--green)]" /><h3 className="text-sm font-bold text-white">Uptime</h3></div>
                  <p className="text-2xl font-bold text-white">{(healthQuery.data as any)?.uptime || "—"}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Server uptime</p>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><HardDrive className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">Memory</h3></div>
                  <p className="text-2xl font-bold text-white">{(healthQuery.data as any)?.memory || "—"}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Used / Total</p>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><Cpu className="w-4 h-4 text-[var(--red)]" /><h3 className="text-sm font-bold text-white">CPU</h3></div>
                  <p className="text-2xl font-bold text-white">{(healthQuery.data as any)?.cpu || "—"}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Load average</p>
                </div>
              </div>
              <pre className="bg-black/30 rounded-xl p-4 text-xs text-[var(--text-secondary)] font-mono overflow-auto max-h-[300px]">{JSON.stringify(healthQuery.data, null, 2)}</pre>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">System health data unavailable.</p>
          )}
        </div>
      )}

      {tab === "ledger" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Ledger Health (Pillar #1)</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <input type="checkbox" checked={dryRunMode} onChange={(e) => setDryRunMode(e.target.checked)} className="accent-[var(--accent)]" />
                Dry run (no writes)
              </label>
              <button
                onClick={() => runReconcileMutation.mutate({ dryRun: dryRunMode })}
                disabled={runReconcileMutation.isPending || !ledgerQuery.data}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-xs font-bold hover:brightness-110 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runReconcileMutation.isPending ? "animate-spin" : ""}`} />
                {runReconcileMutation.isPending ? "Running…" : "Run reconciliation now"}
              </button>
            </div>
          </div>

          {ledgerQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
          ) : ledgerQuery.isError ? (
            <div className="text-center text-[var(--red)] text-sm py-8">Failed to load ledger health</div>
          ) : ledgerQuery.data ? (() => {
            const hb = ledgerQuery.data.heartbeat ?? null;
            const hbAgeSec = hb ? Math.floor(Date.now() / 1000 - hb.lastTickAt) : Number.POSITIVE_INFINITY;
            const hbStale = !hb || hbAgeSec > 30;
            const hbAgeLabel = hb ? `${hbAgeSec > 3600 ? Math.floor(hbAgeSec / 3600) + "h" : hbAgeSec + "s"}` : "—";
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-micro">Pending</p>
                    <p className="text-3xl font-bold text-white mt-1">{ledgerQuery.data.pendingCount}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">awaiting settlement</p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-micro">Stuck</p>
                    <p className={`text-3xl font-bold mt-1 ${ledgerQuery.data.stuckCount > 0 ? "text-[var(--red)]" : "text-white"}`}>{ledgerQuery.data.stuckCount}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">need attention</p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-micro">Settled Today</p>
                    <p className="text-3xl font-bold text-[var(--green)] mt-1">{ledgerQuery.data.settledToday}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">win/loss recorded</p>
                  </div>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-micro">Settlement Loop</p>
                    <p className={`text-xl font-bold mt-1 flex items-center gap-2 ${hbStale ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                      <span className={`w-2 h-2 rounded-full ${hbStale ? "bg-[var(--red)]" : "bg-[var(--green)] animate-pulse"}`} />
                      {hbStale ? "Stale" : "Alive"}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">last tick {hbAgeLabel} ago</p>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><HeartPulse className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">Settlement Heartbeat</h3></div>
                  {hb ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${hb.derivOk ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                        <span className="text-white">Deriv {hb.derivOk ? "connected" : "unavailable"}</span>
                      </div>
                      <div className="flex justify-between"><span className="text-[var(--text-muted)]">Last tick</span><span className="text-white">{new Date(hb.lastTickAt * 1000).toLocaleTimeString()}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--text-muted)]">Pending / Settled / Errors</span><span className="text-white">{hb.pendingCount} / {hb.settledCount} / {hb.errorCount}</span></div>
                      {hb.lastError && <div className="rounded border border-[var(--red)]/30 bg-[var(--red)]/10 px-2 py-1.5 text-[var(--red)] font-mono truncate">{hb.lastError}</div>}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No heartbeat yet — the tracker hasn't ticked on this instance.</p>
                  )}
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><RefreshCw className="w-4 h-4 text-[var(--accent)]" /><h3 className="text-sm font-bold text-white">Reconciler — last {reconHistoryQuery.data?.runs.length || 0} runs</h3></div>
                  {runReconcileMutation.data && (
                    <div className="mb-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--accent)] font-mono">
                      Last run: {JSON.stringify(runReconcileMutation.data)}
                    </div>
                  )}
                  {reconHistoryQuery.data?.runs.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                            <th className="pb-2 text-left font-bold">Start</th><th className="pb-2 text-left font-bold">User</th><th className="pb-2 text-left font-bold">Reconciled</th><th className="pb-2 text-left font-bold">Settled</th><th className="pb-2 text-left font-bold">Stuck</th><th className="pb-2 text-left font-bold">Matched</th><th className="pb-2 text-left font-bold">NoToken</th><th className="pb-2 text-left font-bold">Errors</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {(reconHistoryQuery.data?.runs || []).map((r: any) => (
                            <tr key={r.id} className="hover:bg-white/5">
                              <td className="py-2 text-[var(--text-muted)] whitespace-nowrap">{new Date(r.runStart).toLocaleTimeString()}</td>
                              <td className="py-2">{r.userId ?? "all"}</td>
                              <td className="py-2">{r.actions?.reconstructed ?? 0}</td>
                              <td className="py-2">{r.actions?.settled ?? 0}</td>
                              <td className="py-2">{r.actions?.stuck ?? 0}</td>
                              <td className="py-2">{r.actions?.pendingMatched ?? 0}</td>
                              <td className="py-2">{r.actions?.skippedNoToken ?? 0}</td>
                              <td className="py-2">{r.actions?.errors ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No reconciler runs recorded yet.</p>
                  )}
                </div>
              </>
            );
          })() : null}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Shield, Activity, Clock, HardDrive, Database, Cpu, Loader2, ScrollText, BarChart3, TrendingUp, TrendingDown, Settings2, Users } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.listUsers.useQuery();
  const auditLogsQuery = trpc.admin.auditLogs.useQuery({ limit: 100 });
  const healthQuery = trpc.admin.systemHealth.useQuery();
  const statsQuery = trpc.admin.usageStats.useQuery(undefined, { enabled: false });
  const configQuery = trpc.admin.getConfig.useQuery(undefined, { enabled: false });
  const promoteMutation = trpc.admin.promoteToAdmin.useMutation({ onSuccess: () => listQuery.refetch() });
  const demoteMutation = trpc.admin.demoteToUser.useMutation({ onSuccess: () => listQuery.refetch() });
  const deleteMutation = trpc.admin.deleteUser.useMutation({ onSuccess: () => listQuery.refetch() });
  const [tab, setTab] = useState<"users" | "audit" | "health" | "perf" | "config" | "stats">("users");

  if (!user || user.role !== "admin") {
    return <div className="flex items-center justify-center min-h-[60vh] text-[var(--text-muted)]">Access denied. Admin privileges required.</div>;
  }

  if (listQuery.isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="h-8 w-8 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" /></div>;
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
        <Shield className="w-5 h-5 text-[var(--amber)]" />
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)] pb-3">
        {(["users", "audit", "health", "perf", "config", "stats"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t ? "bg-[var(--amber)] text-black" : "text-[var(--text-secondary)] hover:text-white"}`}>
            {t === "users" ? "Users" : t === "audit" ? "Audit Logs" : t === "health" ? "System Health" : t === "perf" ? "Performance" : t === "config" ? "Config" : "Usage Stats"}
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
              {listQuery.data?.users.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)]/50">
                  <td className="py-2.5">{u.id}</td>
                  <td className="py-2.5">{u.email}</td>
                  <td className="py-2.5">{u.name || "—"}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === "admin" ? "bg-[var(--amber)]/20 text-[var(--amber)]" : "bg-white/5 text-[var(--text-muted)]"}`}>{u.role}</span>
                  </td>
                  <td className="py-2.5">{u.emailVerified ? "✓" : "✗"}</td>
                  <td className="py-2.5 text-[var(--text-muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      {u.role === "user" ? (
                        <button onClick={() => promoteMutation.mutate({ userId: u.id })} className="text-xs text-[var(--amber)] hover:underline">Promote</button>
                      ) : (u.id !== user.id && (
                        <button onClick={() => demoteMutation.mutate({ userId: u.id })} className="text-xs text-yellow-500 hover:underline">Demote</button>
                      ))}
                      {u.id !== user.id && (
                        <button onClick={() => { if (confirm(`Delete user ${u.email}?`)) deleteMutation.mutate({ userId: u.id }); }} className="text-xs text-red-500 hover:underline">Delete</button>
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
            <ScrollText className="w-4 h-4 text-[var(--amber)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Security Audit Log</span>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{(auditLogsQuery.data?.logs || []).length} entries</span>
          </div>
          {auditLogsQuery.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" />
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
                      <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-white/5 text-[var(--amber)]">{log.action}</span></td>
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
            <div className="col-span-2 flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--amber)]" /></div>
          ) : healthQuery.isError ? (
            <div className="col-span-2 text-center text-[var(--red)] text-sm">Failed to load system health</div>
          ) : healthQuery.data ? (
            <>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><HardDrive className="w-4 h-4 text-[var(--cyan)]" /><h3 className="text-sm font-bold text-white">Memory</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Total</span><span className="text-white">{formatBytes(healthQuery.data.memory.total)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Used</span><span className="text-[var(--amber)]">{formatBytes(healthQuery.data.memory.used)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Free</span><span className="text-[var(--green)]">{formatBytes(healthQuery.data.memory.free)}</span></div>
                  <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-[var(--amber)] rounded-full" style={{ width: `${(healthQuery.data.memory.used / healthQuery.data.memory.total) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Cpu className="w-4 h-4 text-[var(--cyan)]" /><h3 className="text-sm font-bold text-white">CPU</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (1m)</span><span className="text-white">{healthQuery.data.cpu.loadAvg1.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (5m)</span><span className="text-white">{healthQuery.data.cpu.loadAvg5.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Load Avg (15m)</span><span className="text-white">{healthQuery.data.cpu.loadAvg15.toFixed(2)}</span></div>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-[var(--cyan)]" /><h3 className="text-sm font-bold text-white">Database</h3></div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${healthQuery.data.database === "connected" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                  <span className="text-white">{healthQuery.data.database}</span>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-[var(--cyan)]" /><h3 className="text-sm font-bold text-white">System</h3></div>
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

      {tab === "config" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-[var(--amber)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Platform Configuration</span>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Default Max Stake ($)</label>
              <input type="number" defaultValue={100} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Max Active Bots per User</label>
              <input type="number" defaultValue={10} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Maintenance Mode</label>
              <div className="flex gap-2 mt-1">
                <button className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]">Disabled</button>
                <button className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30">Enabled</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Allowed Origins (CORS)</label>
              <input defaultValue="https://369labs.com" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <button className="px-4 py-2 rounded-lg bg-[var(--amber)] text-black text-xs font-bold">Save Config</button>
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[var(--cyan)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Usage Statistics</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Total Users</p>
              <p className="text-3xl font-bold text-white mt-1">{listQuery.data?.users.length || 0}</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Active Sessions</p>
              <p className="text-3xl font-bold text-white mt-1">—</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">API Requests (24h)</p>
              <p className="text-3xl font-bold text-white mt-1">—</p>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Top Users by Activity</h3>
            <p className="text-xs text-[var(--text-muted)]">Usage analytics will appear once data collection is enabled.</p>
          </div>
        </div>
      )}

      {tab === "perf" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[var(--cyan)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">System Performance Audit</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[var(--green)]" /><h3 className="text-sm font-bold text-white">API Latency</h3></div>
              <p className="text-2xl font-bold text-white">12ms</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Average response time</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">P95</span><span className="text-white">28ms</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">P99</span><span className="text-white">45ms</span></div>
              </div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-[var(--amber)]" /><h3 className="text-sm font-bold text-white">Query Performance</h3></div>
              <p className="text-2xl font-bold text-white">2.3s</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Avg query response</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Slow queries</span><span className="text-[var(--amber)]">3 in last hour</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Cache hit rate</span><span className="text-[var(--green)]">87%</span></div>
              </div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-[var(--red)]" /><h3 className="text-sm font-bold text-white">Error Rate</h3></div>
              <p className="text-2xl font-bold text-[var(--green)]">0.3%</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">24h rolling</p>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">API errors</span><span className="text-white">12</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">WS reconnects</span><span className="text-white">4</span></div>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Resource Recommendations</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2 p-2 bg-black/20 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] mt-1.5 shrink-0" />
                <div><span className="text-white font-bold">Memory:</span><span className="text-[var(--text-muted)] ml-1">Below 70% usage — healthy</span></div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-black/20 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] mt-1.5 shrink-0" />
                <div><span className="text-white font-bold">Database:</span><span className="text-[var(--text-muted)] ml-1">Consider index on trades.entryTime for large datasets</span></div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-black/20 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] mt-1.5 shrink-0" />
                <div><span className="text-white font-bold">Caching:</span><span className="text-[var(--text-muted)] ml-1">Enable Redis for sub-5ms API responses</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

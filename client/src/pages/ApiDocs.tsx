import { useAuth } from "@/_core/hooks/useAuth";
import { BookText, Terminal, Search, Loader2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function ApiDocs() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("");
  const endpointsQuery = trpc.docs.endpoints.useQuery();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const allEndpoints = endpointsQuery.data || [];
  const filtered = filter.trim()
    ? allEndpoints.map((g: any) => ({ ...g, items: g.items.filter((e: any) => e.path.toLowerCase().includes(filter.toLowerCase())) })).filter((g: any) => g.items.length > 0)
    : allEndpoints;

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BookText className="w-7 h-7 text-[var(--accent)]" /> API Documentation
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">tRPC endpoints available in the 369Labs API. All endpoints require authentication unless noted.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter endpoints..." className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2 text-sm text-white outline-none placeholder-[var(--text-muted)]" />
        </div>

        {endpointsQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle className="w-10 h-10 text-[var(--border)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">{filter ? "No endpoints match your filter." : "No endpoints loaded."}</p>
          </div>
        ) : (
          filtered.map((group: any) => (
            <div key={group.group}>
              <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[var(--accent)]" /> {group.group}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--card)] text-[var(--text-muted)] border-b border-[var(--border)]">
                      <th className="p-3 text-left font-bold w-20">Type</th>
                      <th className="p-3 text-left font-bold">Endpoint</th>
                      <th className="p-3 text-left font-bold">Input</th>
                      <th className="p-3 text-left font-bold">Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {group.items.map((ep: any) => (
                      <tr key={ep.path} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${ep.method === "query" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
                            {ep.method}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-white">{ep.path}</td>
                        <td className="p-3 text-[var(--text-secondary)] font-mono">{ep.input}</td>
                        <td className="p-3 text-[var(--text-secondary)] font-mono">{ep.output}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

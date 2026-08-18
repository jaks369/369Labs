import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Users,
  Loader2,
  Plus,
  Trash2,
  Power,
  History,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSymbolDisplayName } from "@/lib/symbols";

export default function CopyTrading() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [selectedLeader, setSelectedLeader] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [maxStake, setMaxStake] = useState("");

  const relations = trpc.copy.list.useQuery(undefined, { enabled: isAuthenticated });
  const peers = trpc.copy.peers.useQuery(undefined, { enabled: isAuthenticated });
  const mirrors = trpc.copy.mirrors.useQuery(undefined, { enabled: isAuthenticated });

  const addRel = trpc.copy.add.useMutation();
  const removeRel = trpc.copy.remove.useMutation();
  const setActive = trpc.copy.setActive.useMutation();

  const refresh = () => { relations.refetch(); peers.refetch(); mirrors.refetch(); };

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="h-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Copy Trading</h1>
            <p className="text-xs text-[var(--text-muted)]">Follow proven traders, get their fills mirrored with your own sizing rules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Peers leaderboard */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--accent)]" /> Trader leaderboard</h2>
            {peers.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="space-y-2">
                {(peers.data || []).map((p: any) => (
                  <div key={p.userId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{p.tradeCount} settled · {p.winRate}% win rate · P&L <span className={p.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{p.pnl >= 0 ? "+" : ""}${p.pnl}</span></p>
                      </div>
                      <Button
                        onClick={() => setSelectedLeader(p.userId)}
                        className={`btn gap-1.5 ${selectedLeader === p.userId ? "btn-primary" : "btn-outline"}`}
                        size="sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Follow
                      </Button>
                    </div>
                    {selectedLeader === p.userId && (
                      <div className="mt-3 flex items-end gap-2 flex-wrap border-t border-[var(--border)] pt-3">
                        <label className="block">
                          <span className="text-[11px] text-[var(--text-muted)]">Stake multiplier</span>
                          <input type="number" min={0.1} step={0.1} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} className="mt-1 w-24 bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white" />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-[var(--text-muted)]">Max stake ($, optional)</span>
                          <input type="number" min={0.35} step={0.5} value={maxStake} onChange={(e) => setMaxStake(e.target.value)} className="mt-1 w-32 bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white" placeholder="e.g. 25" />
                        </label>
                        <Button
                          className="btn btn-primary"
                          size="sm"
                          disabled={addRel.isPending}
                          onClick={() => addRel.mutate({
                            leaderUserId: p.userId,
                            stakeMultiplier: Number(multiplier) || 1,
                            ...(maxStake ? { maxStake: Number(maxStake) } : {}),
                          }, { onSuccess: () => { setSelectedLeader(null); refresh(); } })}
                        >
                          {addRel.isPending ? "Adding…" : "Add"} 
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {(peers.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">No other traders with settled history yet.</p>}
              </div>
            )}
          </div>

          {/* Following list */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-[var(--accent)]" /> Traders you follow</h2>
            {relations.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="space-y-2">
                {(relations.data || []).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{r.leaderName}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">×{r.stakeMultiplier} multiplier{r.maxStake ? ` · cap $${r.maxStake}` : ""}</p>
                    </div>
                    <button
                      onClick={() => setActive.mutate({ id: r.id, active: !r.active }, { onSuccess: refresh })}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold ${r.active ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/10" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}
                    >
                      <Power className="w-3 h-3" /> {r.active ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => removeRel.mutate({ id: r.id }, { onSuccess: refresh })}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--red)]/30 text-[11px] font-semibold text-[var(--red)] bg-[var(--red)]/5 hover:bg-[var(--red)]/10"
                    >
                      <Trash2 className="w-3 h-3" /> Unfollow
                    </button>
                  </div>
                ))}
                {(relations.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">You're not following anyone yet. Use the leaderboard to copy a trader.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Mirror audit trail */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><History className="w-4 h-4 text-[var(--accent)]" /> Mirror audit trail</h2>
          {mirrors.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg-base)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Time</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Symbol</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Contract</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Stake</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(mirrors.data || []).map((m: any) => (
                    <tr key={m.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-white font-medium">{getSymbolDisplayName(m.symbol)}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{m.contractType}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)] font-mono">${Number(m.stake).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${m.status === "mirrored" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/15"}`}>{m.status}</span>
                        {m.reason && <span className="text-[10px] text-[var(--text-muted)] ml-1">({m.reason})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(mirrors.data || []).length === 0 && (
                <div className="p-6 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  No mirrors yet. When a trader you follow records a fill, the mirrored record appears (execute on your own account via the terminal).
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
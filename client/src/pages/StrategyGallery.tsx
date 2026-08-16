import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Layers, Loader2, Trophy, Repeat, TrendingUp } from "lucide-react";

function stat(label: string, value: string | number, accent?: string) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-2.5">
      <p className="text-[10px] text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className={`text-base font-bold font-mono tabular-nums ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}

export default function StrategyGallery() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const gallery = trpc.strategies.publishedGallery.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const rows = gallery.data || [];
  const sorted = [...rows].sort((a: any, b: any) => (b.stats?.usageCount || 0) - (a.stats?.usageCount || 0));

  return (
    <div className="h-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Layers className="w-7 h-7 text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Strategy Gallery</h1>
            <p className="text-xs text-[var(--text-muted)]">Community-published strategies ranked by their audited trade ledger — real usage, real outcomes</p>
          </div>
        </div>

        {gallery.isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {sorted.map((s: any) => {
              const st = s.stats || { usageCount: 0, wins: 0, losses: 0, totalPnl: 0, winRatePct: 0 };
              return (
                <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white">{s.name}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{s.description || "Published strategy"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[var(--amber)]" />
                      <span className="text-[11px] text-[var(--text-muted)]">Used {st.usageCount}× in the live ledger</span>
                    </div>
                    {stat("Win rate", `${st.winRatePct}%`, st.winRatePct >= 50 ? "text-[var(--green)]" : "text-[var(--red)]")}
                    {stat("Net P&L", `${st.totalPnl >= 0 ? "+" : ""}$${Math.round(st.totalPnl * 100) / 100}`, st.totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]")}
                    {stat("Wins", st.wins, "text-[var(--green)]")}
                    {stat("Losses", st.losses, "text-[var(--red)]")}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-auto">
                    <Repeat className="w-3.5 h-3.5" /> Clone it in the Strategy Builder to trade this yourself
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="col-span-full text-center py-16 text-sm text-[var(--text-muted)] flex flex-col items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                No published strategies yet — publish one from the Strategy Builder to seed the gallery.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
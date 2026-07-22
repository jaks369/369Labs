import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BarChart4, TrendingUp, DollarSign, Activity, Loader2, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 500 });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const trades = tradesQuery.data || [];
  const totalTrades = trades.length;
  const wins = trades.filter(t => (t as any).result === "win").length;
  const losses = trades.filter(t => (t as any).result === "loss").length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;

  // ---- Risk metrics ----
  // Build an equity curve from trades in time order, then derive drawdowns.
  const ordered = [...trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  let peak = 0;
  let cur = 0;
  let maxDD = 0;
  const dailyPnl: Record<string, number> = {};
  const weeklyPnl: Record<string, number> = {};
  let largestLoss = 0;
  let winsSum = 0;
  let lossesSum = 0;
  for (const t of ordered) {
    const pnl = parseFloat(t.profitLoss?.toString() || "0");
    cur += pnl;
    if (cur > peak) peak = cur;
    const dd = peak - cur;
    if (dd > maxDD) maxDD = dd;
    if (pnl < 0) { largestLoss = Math.min(largestLoss, pnl); lossesSum += -pnl; }
    else winsSum += pnl;
    const d = new Date(t.entryTime);
    const day = d.toISOString().slice(0, 10);
    const wk = (() => { const x = new Date(d); const onejan = new Date(x.getFullYear(), 0, 1); const wkNum = Math.ceil(((+x - +onejan) / 86400000 + onejan.getDay() + 1) / 7); return `${x.getFullYear()}-W${wkNum}`; })();
    dailyPnl[day] = (dailyPnl[day] || 0) + pnl;
    weeklyPnl[wk] = (weeklyPnl[wk] || 0) + pnl;
  }
  const dailyDD = Math.min(0, ...Object.values(dailyPnl));
  const weeklyDD = Math.min(0, ...Object.values(weeklyPnl));
  const exposure = totalTrades > 0 ? (trades.reduce((s, t) => s + parseFloat(t.stake?.toString() || "0"), 0) / totalTrades) : 0;
  const rr = lossesSum > 0 ? (winsSum / lossesSum) : 0;
  const currentDD = peak - cur;

  const riskStats = [
    { label: "Current Drawdown", value: `$${currentDD.toFixed(2)}`, sub: "peak-to-now", color: currentDD > 0 ? "text-[var(--cyan)]" : "text-[var(--text-secondary)]" },
    { label: "Max Drawdown", value: `$${maxDD.toFixed(2)}`, sub: "all-time", color: maxDD > 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Daily Drawdown", value: `$${dailyDD.toFixed(2)}`, sub: "worst day", color: dailyDD < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Weekly Drawdown", value: `$${weeklyDD.toFixed(2)}`, sub: "worst week", color: weeklyDD < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Largest Loss", value: `$${largestLoss.toFixed(2)}`, sub: "single trade", color: largestLoss < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Risk : Reward", value: rr.toFixed(2), sub: "gross win/loss", color: rr >= 1 ? "text-[var(--green)]" : "text-[var(--cyan)]" },
    { label: "Avg Exposure", value: `$${exposure.toFixed(2)}`, sub: "per trade stake", color: "text-[var(--text-secondary)]" },
    { label: "Open Risk", value: "â€”", sub: "live bots", color: "text-[var(--text-muted)]" },
  ];

  const stats = [
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, icon: DollarSign, color: totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-[var(--green)]" },
    { label: "Total Trades", value: totalTrades.toString(), icon: Activity, color: "text-[var(--cyan)]" },
    { label: "Avg. Trade", value: `${avgTrade >= 0 ? "+" : ""}$${avgTrade.toFixed(2)}`, icon: BarChart4, color: avgTrade >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
  ];

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Performance overview of all your trading bots</p>
        </div>

        {tradesQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--cyan)]" /></div>
        ) : tradesQuery.isError ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <ShieldAlert className="w-10 h-10 text-[var(--red)] mx-auto mb-3" />
              <p className="text-[var(--red)] font-semibold">Failed to load analytics data</p>
              <p className="text-[var(--text-muted)] text-sm mt-1">{(tradesQuery.error as any)?.message || "Please try again later."}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => (
                <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">{s.label}</span>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[var(--cyan)]" /> Risk Dashboard
              </h2>
              <p className="text-xs text-[var(--text-muted)] mb-4">Drawdown, exposure and risk:reward across all closed trades.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {riskStats.map(s => (
                  <div key={s.label} className="bg-black/20 border border-[var(--border)] rounded-lg p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{s.label}</p>
                    <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Recent Trades</h2>
                {trades.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trades.slice(0, 20).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${(t as any).result === "win" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                          <span className="text-sm text-[var(--text-secondary)]">${t.stake} {(t as any).result}</span>
                        </div>
                        <span className={`text-sm font-bold ${parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${t.profitLoss}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-[var(--text-muted)]">No trades yet â€” deploy a bot</div>
                )}
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Summary</h2>
                <div className="space-y-4">
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Wins</span>
                    <span className="text-[var(--green)] font-bold">{wins}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Losses</span>
                    <span className="text-[var(--red)] font-bold">{losses}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Win Rate</span>
                    <span className="text-[var(--green)] font-bold">{winRate}%</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                    <span className="text-white font-bold">Total P&L</span>
                    <span className={`font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


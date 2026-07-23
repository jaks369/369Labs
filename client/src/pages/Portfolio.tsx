import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { derivWS } from "@/services/derivWebSocket";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Wallet, AlertCircle, XCircle, Scale, FileText, Download } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Portfolio() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 500 });
  const positionsQuery = trpc.deriv.getPositions.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const closePositionMutation = trpc.deriv.closePosition.useMutation();
  const [balance, setBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<{ currency: string; accountType: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { navigate("/login"); return; }
    const unsub = derivWS.onBalance((b: any) => {
      const list = Array.isArray(b.balance) ? b.balance : (b.accounts || [b]);
      const acct = list.find((a: any) => a.loginid === b.loginid) || list[0];
      setBalance(parseFloat(acct?.balance != null ? acct.balance : (acct?.display_balance || "0")) || 0);
      setBalanceInfo({
        currency: acct?.currency || b.currency || "USD",
        accountType: (acct?.account_type || b.account_type || "").toString().toLowerCase(),
      });
    });
    if (derivWS.isAuthorized()) derivWS.fetchBalance();
    return () => {};
  }, [isAuthenticated, navigate]);

  const positions = (positionsQuery.data || []) as any[];
  const openPositions = positions.filter((p: any) => p.isOpen);

  if (tradesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[var(--card)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" />
      </div>
    );
  }

  const trades = (tradesQuery.data || []) as any[];
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === "win").length;
  const losses = trades.filter(t => t.result === "loss").length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => parseFloat(t.profitLoss?.toString() || "0"))) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => parseFloat(t.profitLoss?.toString() || "0"))) : 0;

  // Equity curve
  const ordered = [...trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  let runningPnl = 0;
  const equityData = ordered.map((t, i) => {
    runningPnl += parseFloat(t.profitLoss?.toString() || "0");
    return { name: `#${i + 1}`, equity: parseFloat(runningPnl.toFixed(2)) };
  });

  // Per-symbol breakdown
  const bySymbol: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of trades) {
    const sym = t.symbol || "UNKNOWN";
    if (!bySymbol[sym]) bySymbol[sym] = { trades: 0, wins: 0, pnl: 0 };
    bySymbol[sym].trades++;
    if (t.result === "win") bySymbol[sym].wins++;
    bySymbol[sym].pnl += parseFloat(t.profitLoss?.toString() || "0");
  }

  const summaryCards = [
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, icon: DollarSign, color: totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-[var(--green)]" },
    { label: "Total Trades", value: totalTrades.toString(), icon: Activity, color: "text-[var(--amber)]" },
    { label: "Avg Trade", value: `${avgTrade >= 0 ? "+" : ""}$${avgTrade.toFixed(2)}`, icon: BarChart3, color: avgTrade >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
  ];

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Portfolio</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Overall performance across all bots and symbols</p>
          </div>
          {balanceInfo && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-black/20">
              <Wallet className="w-4 h-4 text-[var(--green)]" />
              <span className="text-sm font-bold text-white">{balance.toFixed(2)} {balanceInfo.currency}</span>
              <span className={`badge ${balanceInfo.accountType === "demo" ? "badge-amber" : "badge-red"}`}>{balanceInfo.accountType}</span>
            </div>
          )}
        </div>

        {tradesQuery.isError && (
          <div className="p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0" />
            <p className="text-xs text-[var(--red)]">Failed to load portfolio data. Please try again.</p>
          </div>
        )}

        {totalTrades === 0 && !tradesQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="w-12 h-12 text-[var(--border)] mx-auto mb-4" />
            <p className="text-[var(--text-muted)] text-sm mb-2">No trades yet</p>
            <p className="text-[var(--text-muted)] text-xs">Deploy a bot or make a trade to see your portfolio.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {summaryCards.map(s => (
                <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{s.label}</span>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Best Trade</span>
                <p className="text-lg font-bold text-[var(--green)] mt-1">+${bestTrade.toFixed(2)}</p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Worst Trade</span>
                <p className="text-lg font-bold text-[var(--red)] mt-1">${worstTrade.toFixed(2)}</p>
              </div>
            </div>

            {equityData.length > 1 && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Equity Curve</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                      <Tooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "var(--text-secondary)" }}
                      />
                      <Line type="monotone" dataKey="equity" stroke="var(--amber-hover)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {openPositions.length > 0 && (
              <div className="bg-[var(--card)] border border-[var(--red)]/30 rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--red)]" />
                  Active Positions ({openPositions.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Symbol</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Type</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Stake</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Buy Price</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Current</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">P&L</th>
                        <th className="text-center py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map((p: any) => {
                        const pnl = parseFloat(p.profitLoss?.toString() || "0");
                        return (
                          <tr key={p.contractId || p.id} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 font-bold text-white">{p.symbol || p.display_name || "-"}</td>
                            <td className="py-3 px-4 text-right text-xs">{p.contractType || p.contract_type || "CALL"}</td>
                            <td className="py-3 px-4 text-right">${p.stake || "0"}</td>
                            <td className="py-3 px-4 text-right">{p.buyPrice || p.entryPrice || "-"}</td>
                            <td className="py-3 px-4 text-right">{p.currentPrice || "-"}</td>
                            <td className={`py-3 px-4 text-right font-bold ${pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={async () => {
                                  try {
                                    await closePositionMutation.mutateAsync({ contractId: p.contractId || p.id });
                                    positionsQuery.refetch();
                                  } catch {}
                                }}
                                disabled={closePositionMutation.isPending}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 disabled:opacity-50"
                              >
                                <XCircle className="w-3 h-3 inline mr-1" />
                                CLOSE
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4">Performance by Symbol</h2>
              {Object.keys(bySymbol).length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No trades yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Symbol</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Trades</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Wins</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Win Rate</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bySymbol).sort(([, a], [, b]) => b.pnl - a.pnl).map(([sym, stats]) => (
                        <tr key={sym} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 font-bold text-white">{sym}</td>
                          <td className="py-3 px-4 text-right">{stats.trades}</td>
                          <td className="py-3 px-4 text-right text-[var(--green)]">{stats.wins}</td>
                          <td className="py-3 px-4 text-right">{stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : "0.0"}%</td>
                          <td className={`py-3 px-4 text-right font-bold ${stats.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {Object.keys(bySymbol).length > 1 && (
              <div className="bg-[var(--card)] border border-[var(--cyan)]/30 rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Scale className="w-4 h-4 text-[var(--cyan)]" /> Rebalancing Proposal</h2>
                <p className="text-xs text-[var(--text-muted)] mb-3">Suggested allocation to equal-weight across symbols:</p>
                <div className="space-y-2">
                  {Object.entries(bySymbol).map(([sym, stats]) => {
                    const currentWeight = stats.pnl / totalPnl || 0;
                    const targetWeight = 1 / Object.keys(bySymbol).length;
                    const diff = ((targetWeight - currentWeight) * 100).toFixed(1);
                    return (
                      <div key={sym} className="flex items-center justify-between text-xs p-2 bg-black/20 rounded-lg">
                        <span className="font-bold text-white">{sym}</span>
                        <span className="text-[var(--text-muted)]">Current: {(currentWeight * 100).toFixed(1)}%</span>
                        <span className="text-[var(--text-muted)]">Target: {(targetWeight * 100).toFixed(1)}%</span>
                        <span className={Number(diff) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{diff.startsWith("-") ? "" : "+"}{diff}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {totalTrades > 0 && (
              <div className="bg-[var(--card)] border border-[var(--amber)]/30 rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--amber)]" /> Tax Report</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Total Trades</p>
                    <p className="text-lg font-bold text-white">{totalTrades}</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Realized P&L</p>
                    <p className={`text-lg font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${totalPnl.toFixed(2)}</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Wins / Losses</p>
                    <p className="text-lg font-bold text-white">{wins}W / {losses}L</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Tax Lots</p>
                    <p className="text-lg font-bold text-white">{totalTrades}</p>
                  </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/30 hover:bg-[var(--amber)]/30">
                  <Download className="w-3.5 h-3.5" /> Export Tax Report (CSV)
                </button>
              </div>
            )}

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4">Recent Trades</h2>
              {trades.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No trades yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Time</th>
                        <th className="text-left py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Symbol</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Stake</th>
                        <th className="text-right py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">P&L</th>
                        <th className="text-center py-3 px-4 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 20).map((t: any) => (
                        <tr key={t.id} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-xs text-[var(--text-muted)]">{new Date(t.entryTime).toLocaleDateString()}</td>
                          <td className="py-3 px-4 font-bold text-white">{t.symbol || "-"}</td>
                          <td className="py-3 px-4 text-right">${t.stake}</td>
                          <td className={`py-3 px-4 text-right font-bold ${parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${t.profitLoss || "0"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                              t.result === "win" ? "bg-[var(--green)]/20 text-[var(--green)]" :
                              t.result === "loss" ? "bg-[var(--red)]/20 text-[var(--red)]" :
                              "bg-[var(--amber)]/20 text-[var(--amber)]"
                            }`}>
                              {(t.result || "OPEN").toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
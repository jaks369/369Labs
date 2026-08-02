import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { derivWS } from "@/services/derivWebSocket";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Wallet, AlertCircle, XCircle, Scale, FileText, Download } from "lucide-react";
import { toast } from "@/components/Toast";
import { CurrencyStat, PercentStat, IntegerStat, SignedCurrencyStat } from "@/components/LiveStat";
import { PageContainer, PageSection } from "@/components/PageSection";
import { getSymbolDisplayName } from "@/lib/symbols";
import { formatMoney, formatNumber } from "@/lib/format";
import PriceChart from "@/components/PriceChart";

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
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const trades = (tradesQuery.data || []) as any[];
  // Filter only settled trades (exclude pending) for accurate P&L and stats
  const settledTrades = trades.filter(t => t.result !== "pending" && t.profitLoss != null);
  const totalTrades = settledTrades.length;
  const wins = settledTrades.filter(t => t.result === "win").length;
  const losses = settledTrades.filter(t => t.result === "loss").length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
  const totalPnl = settledTrades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;
  const bestTrade = totalTrades > 0 ? Math.max(...settledTrades.map(t => parseFloat(t.profitLoss?.toString() || "0"))) : 0;
  const worstTrade = totalTrades > 0 ? Math.min(...settledTrades.map(t => parseFloat(t.profitLoss?.toString() || "0"))) : 0;

  // Equity curve
  const ordered = [...settledTrades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityData = ordered.map((t, i) => {
    runningPnl += parseFloat(t.profitLoss?.toString() || "0");
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak - runningPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
    return { name: `#${i + 1}`, equity: parseFloat(runningPnl.toFixed(2)) };
  });

  // Per-symbol breakdown
  const bySymbol: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of settledTrades) {
    const sym = t.symbol || "UNKNOWN";
    if (!bySymbol[sym]) bySymbol[sym] = { trades: 0, wins: 0, pnl: 0 };
    bySymbol[sym].trades++;
    if (t.result === "win") bySymbol[sym].wins++;
    bySymbol[sym].pnl += parseFloat(t.profitLoss?.toString() || "0");
  }

  return (
    <PageContainer className="page-container">
      <div className="space-y-8">
        <PageSection>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Portfolio</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Overall performance across all bots and symbols</p>
          </div>
          {balanceInfo && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-black/20">
              <Wallet className="w-4 h-4 text-[var(--green)]" />
              <span className="text-sm font-bold text-white"><CurrencyStat value={balance} currency={balanceInfo.currency} /> {balanceInfo.currency}</span>
              <span className={`badge ${balanceInfo.accountType === "demo" ? "badge-accent" : "badge-gray"}`}>{balanceInfo.accountType}</span>
            </div>
          )}
        </div>
        </PageSection>

        {tradesQuery.isError && (
        <PageSection>
          <div className="p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0" />
            <p className="text-xs text-[var(--red)]">Failed to load portfolio data. Please try again.</p>
          </div>
        </PageSection>
        )}

        {totalTrades === 0 && !tradesQuery.isError ? (
        <PageSection>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="w-12 h-12 text-[var(--border)] mx-auto mb-4" />
            <div className="empty-state"><p className="empty-state-desc">No trades yet.</p></div>
          </div>
          </PageSection>
        ) : (
          <PageSection>
            <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-micro">Total P&L</span>
                  <DollarSign className={`w-5 h-5 ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`} />
                </div>
                <p className={`text-2xl font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                  <SignedCurrencyStat value={totalPnl} currency={balanceInfo?.currency || "USD"} />
                </p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-micro">Win Rate</span>
                  <TrendingUp className="w-5 h-5 text-[var(--green)]" />
                </div>
                <p className="text-2xl font-bold text-[var(--green)]"><PercentStat value={parseFloat(winRate)} /></p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-micro">Total Trades</span>
                  <Activity className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <p className="text-2xl font-bold text-[var(--accent)]"><IntegerStat value={totalTrades} /></p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-micro">Avg Trade</span>
                  <BarChart3 className={`w-5 h-5 ${avgTrade >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`} />
                </div>
                <p className={`text-2xl font-bold ${avgTrade >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                  <SignedCurrencyStat value={avgTrade} currency={balanceInfo?.currency || "USD"} />
                </p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-micro">Max Drawdown</span>
                  <AlertCircle className="w-5 h-5 text-[var(--red)]" />
                </div>
                <p className="text-2xl font-bold text-[var(--red)]">
                  <SignedCurrencyStat value={-maxDrawdown} currency={balanceInfo?.currency || "USD"} />
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <span className="text-micro">Best Trade</span>
                <p className="text-lg font-bold text-[var(--green)] mt-1"><SignedCurrencyStat value={bestTrade} currency={balanceInfo?.currency || "USD"} /></p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <span className="text-micro">Worst Trade</span>
                <p className="text-lg font-bold text-[var(--red)] mt-1"><SignedCurrencyStat value={worstTrade} currency={balanceInfo?.currency || "USD"} /></p>
              </div>
            </div>

            {equityData.length > 1 && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4">Equity Curve</h2>
                <PriceChart
                  data={equityData.map((p, i) => ({ time: new Date(ordered[i]?.entryTime || 0).toLocaleDateString(), price: p.equity }))}
                  decimalPlaces={2}
                  color={totalPnl >= 0 ? "var(--green)" : "var(--red)"}
                  fitOnDataChange
                  heightClass="h-64"
                  showStats={false}
                  followLabel="Latest"
                />
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
                        <th className="text-left py-3 px-4 text-micro">Symbol</th>
                        <th className="text-right py-3 px-4 text-micro">Type</th>
                        <th className="text-right py-3 px-4 text-micro">Stake</th>
                        <th className="text-right py-3 px-4 text-micro">Buy Price</th>
                        <th className="text-right py-3 px-4 text-micro">Current</th>
                        <th className="text-right py-3 px-4 text-micro">P&L</th>
                        <th className="text-center py-3 px-4 text-micro">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map((p: any) => {
                        const pnl = parseFloat(p.profitLoss?.toString() || "0");
                        return (
                          <tr key={p.contractId || p.id} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 font-bold text-white">{p.symbol || p.display_name ? getSymbolDisplayName(p.symbol || p.display_name) : "-"}</td>
                            <td className="py-3 px-4 text-right text-xs">{p.contractType || p.contract_type || "CALL"}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{formatMoney(p.stake || 0, balanceInfo?.currency)}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{p.buyPrice != null ? formatNumber(Number(p.buyPrice), 2) : "-"}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{p.currentPrice != null ? formatNumber(Number(p.currentPrice), 2) : "-"}</td>
                            <td className={`py-3 px-4 text-right font-bold ${pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                              <SignedCurrencyStat value={pnl} currency={balanceInfo?.currency || "USD"} />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={async () => {
                                  try {
                                    await closePositionMutation.mutateAsync({ contractId: p.contractId || p.id });
                                    positionsQuery.refetch();
                                  } catch (e: any) { toast(e?.message || "Failed to close position", "error"); }
                                }}
                                disabled={closePositionMutation.isPending}
                                className="px-2 py-1 rounded text-caption font-bold bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 disabled:opacity-50"
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
                <div className="empty-state"><p className="empty-state-desc">No trades yet.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 text-micro">Symbol</th>
                        <th className="text-right py-3 px-4 text-micro">Trades</th>
                        <th className="text-right py-3 px-4 text-micro">Wins</th>
                        <th className="text-right py-3 px-4 text-micro">Win Rate</th>
                        <th className="text-right py-3 px-4 text-micro">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bySymbol).sort(([, a], [, b]) => b.pnl - a.pnl).map(([sym, stats]) => (
                        <tr key={sym} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 font-bold text-white">{getSymbolDisplayName(sym)}</td>
                          <td className="py-3 px-4 text-right"><IntegerStat value={stats.trades} /></td>
                          <td className="py-3 px-4 text-right text-[var(--green)]"><IntegerStat value={stats.wins} variant="always-positive" /></td>
                          <td className="py-3 px-4 text-right"><PercentStat value={parseFloat(((stats.wins / stats.trades) * 100).toFixed(1))} /></td>
                          <td className={`py-3 px-4 text-right font-bold ${stats.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            <SignedCurrencyStat value={stats.pnl} currency={balanceInfo?.currency || "USD"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {Object.keys(bySymbol).length > 1 && (
              <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Scale className="w-4 h-4 text-[var(--accent)]" /> Rebalancing Proposal</h2>
                <p className="text-xs text-[var(--text-muted)] mb-3">Suggested allocation to equal-weight across symbols:</p>
                <div className="space-y-2">
                  {Object.entries(bySymbol).map(([sym, stats]) => {
                    const currentWeight = stats.pnl / totalPnl || 0;
                    const targetWeight = 1 / Object.keys(bySymbol).length;
                    const diff = Number((targetWeight - currentWeight) * 100).toFixed(1);
                    return (
                      <div key={sym} className="flex items-center justify-between text-xs p-2 bg-black/20 rounded-lg">
                        <span className="font-bold text-white">{getSymbolDisplayName(sym)}</span>
                        <span className="text-[var(--text-muted)]">Current: {Number(currentWeight * 100).toFixed(1)}%</span>
                        <span className="text-[var(--text-muted)]">Target: {Number(targetWeight * 100).toFixed(1)}%</span>
                        <span className={Number(diff) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{diff.startsWith("-") ? "" : "+"}{diff}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {totalTrades > 0 && (
              <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-xl p-6">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--accent)]" /> Tax Report</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-caption text-[var(--text-muted)] uppercase">Total Trades</p>
                    <p className="text-lg font-bold text-white"><IntegerStat value={totalTrades} /></p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-caption text-[var(--text-muted)] uppercase">Realized P&L</p>
                    <p className={`text-lg font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}><SignedCurrencyStat value={totalPnl} currency={balanceInfo?.currency || "USD"} /></p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-caption text-[var(--text-muted)] uppercase">Wins / Losses</p>
                    <p className="text-lg font-bold text-white"><IntegerStat value={wins} variant="always-positive" />W / <IntegerStat value={losses} variant="always-negative" />L</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-caption text-[var(--text-muted)] uppercase">Tax Lots</p>
                    <p className="text-lg font-bold text-white"><IntegerStat value={totalTrades} /></p>
                  </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30">
                  <Download className="w-3.5 h-3.5" /> Export Tax Report (CSV)
                </button>
              </div>
            )}

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4">Recent Trades</h2>
              {trades.length === 0 ? (
                <div className="empty-state"><p className="empty-state-desc">No trades yet.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 text-micro">Time</th>
                        <th className="text-left py-3 px-4 text-micro">Symbol</th>
                        <th className="text-right py-3 px-4 text-micro">Stake</th>
                        <th className="text-right py-3 px-4 text-micro">P&L</th>
                        <th className="text-center py-3 px-4 text-micro">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 8).map((t: any) => (
                        <tr key={t.id} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-xs text-[var(--text-muted)]">{new Date(t.entryTime).toLocaleDateString()}</td>
                          <td className="py-3 px-4 font-bold text-white">{t.symbol ? getSymbolDisplayName(t.symbol) : "-"}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{formatMoney(t.stake, balanceInfo?.currency)}</td>
                          <td className={`py-3 px-4 text-right font-bold ${parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            <SignedCurrencyStat value={parseFloat(t.profitLoss?.toString() || "0")} currency={balanceInfo?.currency || "USD"} />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-1 rounded text-caption font-bold ${
                              t.result === "win" ? "bg-[var(--green)]/20 text-[var(--green)]" :
                              t.result === "loss" ? "bg-[var(--red)]/20 text-[var(--red)]" :
                              "bg-[var(--accent)]/20 text-[var(--accent)]"
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
              {trades.length > 0 && (
                <button
                  onClick={() => navigate("/trades")}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30"
                >
                  View Full Trade History
                </button>
              )}
            </div>
            </>
          </PageSection>
        )}
      </div>
    </PageContainer>
  );
}
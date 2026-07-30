import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, Download, AlertCircle, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { useLocation } from "wouter";

export default function TradeHistory() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 100 });

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const totalTrades = tradesQuery.data?.length || 0;
  const wins = tradesQuery.data?.filter(t => (t as any).result === "win").length || 0;
  const losses = tradesQuery.data?.filter(t => (t as any).result === "loss").length || 0;
  const totalPnL = tradesQuery.data?.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) || 0;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgTrade = totalTrades > 0 ? totalPnL / totalTrades : 0;

  const exportToCSV = () => {
    if (!tradesQuery.data) return;
    const headers = ["ID", "Entry Time", "Exit Time", "Entry Price", "Exit Price", "Stake", "P&L", "Result"];
    const rows = tradesQuery.data.map((trade) => [
      trade.id,
      new Date(trade.entryTime).toLocaleString(),
      trade.exitTime ? new Date(trade.exitTime).toLocaleString() : "N/A",
      trade.entryPrice,
      trade.exitPrice || "N/A",
      trade.stake,
      trade.profitLoss || "N/A",
      (trade as any).result,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="page-container max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-hero-sm mb-1">Trade History</h1>
            <p className="text-body">View and analyze all your executed trades</p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={!tradesQuery.data?.length}
            className="btn btn-outline btn-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Stats Bar */}
        {tradesQuery.data && tradesQuery.data.length > 0 && (
          <div className="flex items-stretch gap-0 mb-8 bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 border-r border-[var(--border)]">
              <span className="text-micro text-[var(--text-muted)] mb-2 tracking-widest">TRADES</span>
              <span className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">{totalTrades}</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 border-r border-[var(--border)]">
              <span className="text-micro text-[var(--text-muted)] mb-2 tracking-widest">WINS</span>
              <span className="text-2xl font-bold text-[var(--green)] font-mono tabular-nums">{wins}</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 border-r border-[var(--border)]">
              <span className="text-micro text-[var(--text-muted)] mb-2 tracking-widest">LOSSES</span>
              <span className="text-2xl font-bold text-[var(--red)] font-mono tabular-nums">{losses}</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 border-r border-[var(--border)]">
              <span className="text-micro text-[var(--text-muted)] mb-2 tracking-widest">WIN RATE</span>
              <span className="text-2xl font-bold text-[var(--green)] font-mono tabular-nums">
                {winRate.toFixed(1)}
                <span className="text-sm font-medium text-[var(--text-muted)] ml-0.5">%</span>
              </span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-4">
              <span className="text-micro text-[var(--text-muted)] mb-2 tracking-widest">P&L</span>
              <span className={`text-2xl font-bold font-mono tabular-nums ${
                totalPnL > 0 ? "text-[var(--green)]" : totalPnL < 0 ? "text-[var(--red)]" : "text-[var(--text-disabled)]"
              }`}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {tradesQuery.isLoading && (
          <div className="panel p-12">
            <div className="empty-state">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-4" />
              <p className="text-sm text-[var(--text-muted)]">Loading trade history...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {tradesQuery.isError && (
          <div className="panel p-12">
            <div className="empty-state">
              <AlertCircle className="w-12 h-12 text-[var(--red)] mb-3" />
              <p className="empty-state-title">Failed to Load</p>
              <p className="empty-state-desc mb-4">Could not load trade history. Please try again.</p>
              <button onClick={() => tradesQuery.refetch()} className="btn btn-primary btn-sm">
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {tradesQuery.data && tradesQuery.data.length === 0 && (
          <div className="panel p-12">
            <div className="empty-state">
              <BarChart3 className="w-12 h-12 text-[var(--text-disabled)] mb-3" />
              <p className="empty-state-title">No Trades Yet</p>
              <p className="empty-state-desc">Start trading to see your history here.</p>
            </div>
          </div>
        )}

        {/* Trades Table */}
        {tradesQuery.data && tradesQuery.data.length > 0 && (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th className="w-auto" style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>Type</th>
                    <th className="w-32">Entry Time</th>
                    <th className="w-32">Exit Time</th>
                    <th className="w-28 text-right font-mono">Entry</th>
                    <th className="w-24 text-right font-mono">Stake</th>
                    <th className="w-28 text-right font-mono">P&L</th>
                    <th className="w-20 text-center">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesQuery.data.map((trade, index) => {
                    const pnl = parseFloat(trade.profitLoss?.toString() || "0");
                    return (
                      <tr key={trade.id}>
                        <td className="text-center text-[var(--text-disabled)] font-mono tabular-nums">
                          {tradesQuery.data.length - index}
                        </td>
                        <td>
                          <span className="tag text-[10px] font-semibold tracking-wider uppercase">
                            {trade.contractType || (trade as any).type || "—"}
                          </span>
                        </td>
                        <td className="text-xs font-mono tabular-nums">
                          {new Date(trade.entryTime).toLocaleString()}
                        </td>
                        <td className="text-xs font-mono tabular-nums">
                          {trade.exitTime ? new Date(trade.exitTime).toLocaleString() : "—"}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {trade.entryPrice}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          ${trade.stake}
                        </td>
                        <td className={`text-right font-mono tabular-nums font-semibold ${
                          pnl > 0 ? "text-[var(--green)]" : pnl < 0 ? "text-[var(--red)]" : "text-[var(--text-disabled)]"
                        }`}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </td>
                        <td className="text-center">
                          <span className={
                            (trade as any).result === "win" ? "badge-pill badge-win" :
                            (trade as any).result === "loss" ? "badge-pill badge-loss" :
                            "badge-pill badge-warning"
                          }>
                            {(trade as any).result || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

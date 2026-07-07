import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, Download } from "lucide-react";
import { useLocation } from "wouter";

export default function TradeHistory() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 100 });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

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
      trade.result,
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
    <div className="min-h-screen bg-[#0A0E27] text-[#00FFFF] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-[#FF00FF] mb-2">TRADE HISTORY</h1>
            <p className="text-[#00FFFF] text-sm">View all your executed trades</p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={!tradesQuery.data || tradesQuery.data.length === 0}
            className="btn-neon flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            EXPORT CSV
          </button>
        </div>

        {/* Trades Table */}
        <div className="hud-panel overflow-x-auto">
          {tradesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#00FFFF]" />
            </div>
          ) : tradesQuery.data && tradesQuery.data.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#00FFFF]/30">
                  <th className="text-left py-3 px-4 text-[#FF00FF] font-bold">ID</th>
                  <th className="text-left py-3 px-4 text-[#FF00FF] font-bold">ENTRY TIME</th>
                  <th className="text-left py-3 px-4 text-[#FF00FF] font-bold">EXIT TIME</th>
                  <th className="text-right py-3 px-4 text-[#FF00FF] font-bold">ENTRY PRICE</th>
                  <th className="text-right py-3 px-4 text-[#FF00FF] font-bold">EXIT PRICE</th>
                  <th className="text-right py-3 px-4 text-[#FF00FF] font-bold">STAKE</th>
                  <th className="text-right py-3 px-4 text-[#FF00FF] font-bold">P&L</th>
                  <th className="text-center py-3 px-4 text-[#FF00FF] font-bold">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {tradesQuery.data.map((trade) => (
                  <tr key={trade.id} className="border-b border-[#00FFFF]/10 hover:bg-[#0F1629]/50 transition">
                    <td className="py-3 px-4">{trade.id}</td>
                    <td className="py-3 px-4 text-xs">{new Date(trade.entryTime).toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs">
                      {trade.exitTime ? new Date(trade.exitTime).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">${trade.entryPrice}</td>
                    <td className="py-3 px-4 text-right">${trade.exitPrice || "—"}</td>
                    <td className="py-3 px-4 text-right">${trade.stake}</td>
                    <td className={`py-3 px-4 text-right font-bold ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-[#00FF00]" : "text-[#FF0000]"}`}>
                      ${trade.profitLoss || "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        trade.result === "win" ? "bg-[#00FF00]/20 text-[#00FF00]" :
                        trade.result === "loss" ? "bg-[#FF0000]/20 text-[#FF0000]" :
                        "bg-[#FF00FF]/20 text-[#FF00FF]"
                      }`}>
                        {trade.result.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-[#00FFFF]/60">
              No trades found. Start trading to see your history here.
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {tradesQuery.data && tradesQuery.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            <div className="hud-card-pink">
              <div className="text-sm text-[#FF00FF] mb-2">TOTAL TRADES</div>
              <div className="text-2xl font-bold text-[#FF00FF]">{tradesQuery.data.length}</div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#00FFFF] mb-2">WIN RATE</div>
              <div className="text-2xl font-bold text-[#00FF00]">
                {((tradesQuery.data.filter(t => t.result === "win").length / tradesQuery.data.length) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#00FFFF] mb-2">TOTAL P&L</div>
              <div className={`text-2xl font-bold ${
                tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) >= 0
                  ? "text-[#00FF00]"
                  : "text-[#FF0000]"
              }`}>
                ${tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0).toFixed(2)}
              </div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#00FFFF] mb-2">AVG TRADE</div>
              <div className={`text-2xl font-bold ${
                (tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) / tradesQuery.data.length) >= 0
                  ? "text-[#00FF00]"
                  : "text-[#FF0000]"
              }`}>
                ${(tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) / tradesQuery.data.length).toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

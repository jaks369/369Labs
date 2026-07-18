import { useState, useEffect } from "react";
import { derivWS } from "@/services/derivWebSocket";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, Download } from "lucide-react";
import { useLocation } from "wouter";

export default function TradeHistory() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 100 });
  const [tab, setTab] = useState<"trades" | "prices">("trades");
  const [priceSymbol, setPriceSymbol] = useState("R_100");
  const priceQuery = trpc.market.getHistory.useQuery({ symbol: priceSymbol, limit: 200 }, { enabled: tab === "prices" });
  const priceDecimals = derivWS.decimalPlacesFor(priceSymbol);
  const journalMutation = trpc.ai.journal.useMutation();

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
    <div className="min-h-screen bg-[#0D0D0D] text-[#D98B1F] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-[#E89A2A] mb-2">TRADE HISTORY</h1>
            <p className="text-[#D98B1F] text-sm">View all your executed trades</p>
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

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("trades")} className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === "trades" ? "bg-[#E89A2A]/20 text-[#E89A2A]" : "text-[#D98B1F]/60 hover:text-[#D98B1F]"}`}>TRADES</button>
          <button onClick={() => setTab("prices")} className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === "prices" ? "bg-[#E89A2A]/20 text-[#E89A2A]" : "text-[#D98B1F]/60 hover:text-[#D98B1F]"}`}>PRICE HISTORY</button>
        </div>

        {/* AI Trading Journal */}
        <div className="hud-panel p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#E89A2A]">AI TRADING JOURNAL</h2>
              <p className="text-xs text-[#D98B1F]/60">Automatic post-trade analysis — why you won, why you lost, and how to improve.</p>
            </div>
            <button
              onClick={() => journalMutation.mutate({})}
              disabled={journalMutation.isPending || !tradesQuery.data?.length}
              className="btn-neon flex items-center gap-2 text-sm"
            >
              {journalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              ANALYZE
            </button>
          </div>
          {journalMutation.data ? (
            <div className="space-y-3">
              <div className="flex gap-4 text-xs">
                <span className="text-[#22C55E]">Wins: {journalMutation.data.wins}</span>
                <span className="text-[#EF4444]">Losses: {journalMutation.data.losses}</span>
                <span className={journalMutation.data.net >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}>Net: ${journalMutation.data.net}</span>
                <span className="text-[#6F6F6F]">Sample: {journalMutation.data.sampleSize}</span>
              </div>
              <p className="text-sm text-[#D98B1F]/90 whitespace-pre-wrap leading-relaxed">{journalMutation.data.analysis}</p>
            </div>
          ) : journalMutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-[#D98B1F]/60"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing your trades...</div>
          ) : (
            <p className="text-sm text-[#D98B1F]/50">Press ANALYZE to generate an AI journal from your recent trades.</p>
          )}
        </div>

        {tab === "prices" ? (
          <div className="hud-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <label className="text-xs text-[#D98B1F]/60">SYMBOL</label>
              <select value={priceSymbol} onChange={(e) => setPriceSymbol(e.target.value)} className="bg-[#151515] border border-[#D98B1F]/30 rounded px-3 py-2 text-sm text-[#D98B1F]">
                {["R_10","R_25","R_50","R_75","R_100","R_150","R_200","R_501","R_1000","R_10_1","R_25_1","R_50_1","R_75_1","R_100_1"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {priceQuery.isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#D98B1F]" /></div>
            ) : priceQuery.data?.ticks?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#D98B1F]/30">
                      <th className="text-left py-3 px-4 text-[#E89A2A] font-bold">TIME</th>
                      <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">PRICE</th>
                      <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">LAST DIGIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceQuery.data.ticks.slice().reverse().map((t: any, i: number) => (
                      <tr key={i} className="border-b border-[#D98B1F]/10">
                        <td className="py-2 px-4 text-xs">{new Date((t.epoch || 0) * 1000).toLocaleString()}</td>
                        <td className="py-2 px-4 text-right">{Number(t.price).toFixed(priceDecimals)}</td>
                        <td className="py-2 px-4 text-right">{t.lastDigit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-[#D98B1F]/60">No price history found.</div>
            )}
          </div>
        ) : (
        <div className="hud-panel overflow-x-auto">
          {tradesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#D98B1F]" />
            </div>
          ) : tradesQuery.data && tradesQuery.data.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D98B1F]/30">
                  <th className="text-left py-3 px-4 text-[#E89A2A] font-bold">ID</th>
                  <th className="text-left py-3 px-4 text-[#E89A2A] font-bold">ENTRY TIME</th>
                  <th className="text-left py-3 px-4 text-[#E89A2A] font-bold">EXIT TIME</th>
                  <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">ENTRY PRICE</th>
                  <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">EXIT PRICE</th>
                  <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">STAKE</th>
                  <th className="text-right py-3 px-4 text-[#E89A2A] font-bold">P&L</th>
                  <th className="text-center py-3 px-4 text-[#E89A2A] font-bold">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {tradesQuery.data.map((trade) => (
                  <tr key={trade.id} className="border-b border-[#D98B1F]/10 hover:bg-[#151515]/50 transition">
                    <td className="py-3 px-4">{trade.id}</td>
                    <td className="py-3 px-4 text-xs">{new Date(trade.entryTime).toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs">
                      {trade.exitTime ? new Date(trade.exitTime).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">${trade.entryPrice}</td>
                    <td className="py-3 px-4 text-right">${trade.exitPrice || "—"}</td>
                    <td className="py-3 px-4 text-right">${trade.stake}</td>
                    <td className={`py-3 px-4 text-right font-bold ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                      ${trade.profitLoss || "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        trade.result === "win" ? "bg-[#22C55E]/20 text-[#22C55E]" :
                        trade.result === "loss" ? "bg-[#EF4444]/20 text-[#EF4444]" :
                        "bg-[#E89A2A]/20 text-[#E89A2A]"
                      }`}>
                        {trade.result.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-[#D98B1F]/60">
              No trades found. Start trading to see your history here.
            </div>
          )}
        </div>

        )}

        {/* Summary Stats */}
        {tradesQuery.data && tradesQuery.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            <div className="hud-card-pink">
              <div className="text-sm text-[#E89A2A] mb-2">TOTAL TRADES</div>
              <div className="text-2xl font-bold text-[#E89A2A]">{tradesQuery.data.length}</div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#D98B1F] mb-2">WIN RATE</div>
              <div className="text-2xl font-bold text-[#22C55E]">
                {((tradesQuery.data.filter(t => t.result === "win").length / tradesQuery.data.length) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#D98B1F] mb-2">TOTAL P&L</div>
              <div className={`text-2xl font-bold ${
                tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) >= 0
                  ? "text-[#22C55E]"
                  : "text-[#EF4444]"
              }`}>
                ${tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0).toFixed(2)}
              </div>
            </div>
            <div className="hud-card">
              <div className="text-sm text-[#D98B1F] mb-2">AVG TRADE</div>
              <div className={`text-2xl font-bold ${
                (tradesQuery.data.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0) / tradesQuery.data.length) >= 0
                  ? "text-[#22C55E]"
                  : "text-[#EF4444]"
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


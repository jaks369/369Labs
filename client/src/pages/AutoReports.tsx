import { useState } from "react";
import { FileText, Download, Calendar, Loader2, BarChart3, TrendingUp, PieChart, X, Eye, Activity } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@/components/Toast";

const REPORT_TEMPLATES = [
  { id: "weekly" as const, name: "Weekly Performance", icon: BarChart3, description: "Win rate, profit/loss, trade count for the past week" },
  { id: "monthly" as const, name: "Monthly Report", icon: TrendingUp, description: "Full monthly performance with equity curve and drawdown" },
  { id: "portfolio" as const, name: "Portfolio Summary", icon: PieChart, description: "Allocation, performance by symbol, risk metrics" },
];

function exportCsv(report: any) {
  const header = "Metric,Value";
  const rows = [
    `Period,${report.period?.from} to ${report.period?.to}`,
    `Total Trades,${report.summary?.totalTrades}`,
    `Wins,${report.summary?.wins}`,
    `Losses,${report.summary?.losses}`,
    `Win Rate,${report.summary?.winRate}%`,
    `Total P&L,$${report.summary?.totalPnl}`,
    `Max Drawdown,$${report.summary?.maxDrawdown}`,
    ...(report.bySymbol || []).map((s: any) => `${s.symbol},${s.pnl >= 0 ? "+" : ""}$${s.pnl} (${s.wins}W/${s.losses}L)`),
  ];
  const blob = new Blob([`${header}\n${rows.join("\n")}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${report.label || "report"}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function ReportViewer({ report, onClose }: { report: any; onClose: () => void }) {
  const s = report.summary || {};
  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div>
            <h3 className="text-sm font-bold text-white">{report.label}</h3>
            <p className="text-caption">{report.period?.from} → {report.period?.to}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { exportCsv(report); toast("CSV exported", "success"); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <p className="text-caption">Trades</p>
              <p className="text-lg font-bold text-white">{s.totalTrades}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <p className="text-caption">Win Rate</p>
              <p className="text-lg font-bold text-[var(--green)]">{s.winRate}%</p>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <p className="text-caption">Net P&L</p>
              <p className={`text-lg font-bold ${s.totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${s.totalPnl}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <p className="text-caption">Max DD</p>
              <p className="text-lg font-bold text-[var(--red)]">${s.maxDrawdown}</p>
            </div>
          </div>

          {/* W/L breakdown */}
          <div className="bg-black/20 rounded-lg p-4">
            <p className="text-micro mb-3">Win / Loss Breakdown</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--green)]">Wins ({s.wins})</span>
                  <span className="text-[var(--green)]">{s.totalTrades > 0 ? Number((s.wins / s.totalTrades) * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="h-3 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--green)] rounded-full" style={{ width: `${s.totalTrades > 0 ? (s.wins / s.totalTrades) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--red)]">Losses ({s.losses})</span>
                  <span className="text-[var(--red)]">{s.totalTrades > 0 ? Number((s.losses / s.totalTrades) * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="h-3 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--red)] rounded-full" style={{ width: `${s.totalTrades > 0 ? (s.losses / s.totalTrades) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* By Symbol */}
          {report.bySymbol && report.bySymbol.length > 0 && (
            <div>
              <p className="text-micro mb-2">Performance by Symbol</p>
              <div className="space-y-1.5">
                {report.bySymbol.map((sym: any) => (
                  <div key={sym.symbol} className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg text-xs">
                    <span className="text-white font-bold">{sym.symbol}</span>
                    <span className="text-[var(--text-muted)]">{sym.wins}W / {sym.losses}L</span>
                    <span className={`font-bold ${sym.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {sym.pnl >= 0 ? "+" : ""}${sym.pnl}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AutoReports() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [viewReportId, setViewReportId] = useState<number | null>(null);

  const generateMutation = trpc.reports.generate.useMutation();
  const reportsQuery = trpc.reports.list.useQuery();
  const reportDetailQuery = trpc.reports.getById.useQuery({ id: viewReportId || 0 }, { enabled: viewReportId !== null });
  const viewReport = viewReportId ? reportDetailQuery.data : null;

  const generate = async (type: "weekly" | "monthly" | "portfolio") => {
    setGenerating(type);
    try {
      await generateMutation.mutateAsync({ type });
      toast("Report generated", "success");
      await reportsQuery.refetch();
    } catch (e: any) {
      toast(e?.message || "Generation failed", "error");
    } finally { setGenerating(null); }
  };

  const openReport = (id: number) => setViewReportId(id);

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Auto Reports</h1>
            <p className="text-xs text-[var(--text-muted)]">Generate and download performance reports</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {REPORT_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => generate(t.id)} disabled={generating !== null} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-left hover:border-[var(--accent)]/30 transition-all disabled:opacity-50">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mb-3">
                  {generating === t.id ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : <Icon className="w-5 h-5 text-[var(--accent)]" />}
                </div>
                <span className="text-sm font-bold text-white">{t.name}</span>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t.description}</p>
              </button>
            );
          })}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="text-sm font-bold text-white">Generated Reports</h2>
          </div>
          {reportsQuery.isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" /></div>
          ) : (reportsQuery.data || []).length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-[var(--border)] mx-auto mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No reports generated yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/50">
              {(reportsQuery.data || []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-[var(--accent)]" />
                    <div>
                      <span className="text-sm text-white">{r.name}</span>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.date}</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" />Ready</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openReport(r.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewReportId && (
        reportDetailQuery.isLoading ? (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        ) : viewReport ? (
          <ReportViewer report={viewReport} onClose={() => setViewReportId(null)} />
        ) : null
      )}
    </div>
  );
}

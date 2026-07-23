import { useState } from "react";
import { FileText, Download, Calendar, Clock, Loader2, BarChart3, TrendingUp, PieChart } from "lucide-react";
import { toast } from "@/components/Toast";

const REPORT_TEMPLATES = [
  { id: "weekly", name: "Weekly Performance", icon: BarChart3, description: "Win rate, profit/loss, trade count for the past week" },
  { id: "monthly", name: "Monthly Report", icon: TrendingUp, description: "Full monthly performance with equity curve and drawdown" },
  { id: "portfolio", name: "Portfolio Summary", icon: PieChart, description: "Allocation, performance by symbol, risk metrics" },
];

const MOCK_REPORTS = [
  { id: "1", name: "Weekly Performance - Jul 20", date: "2026-07-20", type: "weekly", status: "ready" },
  { id: "2", name: "Monthly Report - June", date: "2026-07-01", type: "monthly", status: "ready" },
  { id: "3", name: "Portfolio Summary - Q2", date: "2026-07-15", type: "portfolio", status: "ready" },
];

export default function AutoReports() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [reports, setReports] = useState(MOCK_REPORTS);

  const generate = async (id: string) => {
    setGenerating(id);
    await new Promise((r) => setTimeout(r, 1500));
    const t = REPORT_TEMPLATES.find((r) => r.id === id)!;
    const newR = { id: crypto.randomUUID?.() || Math.random().toString(36), name: `${t.name} - ${new Date().toLocaleDateString()}`, date: new Date().toISOString().split("T")[0], type: id, status: "ready" };
    setReports((prev) => [newR, ...prev]);
    setGenerating(null);
    toast(`${t.name} generated successfully`, "success");
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Auto Reports</h1>
            <p className="text-xs text-[var(--text-muted)]">Generate and download performance reports</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {REPORT_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => generate(t.id)} disabled={generating !== null} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-left hover:border-[var(--amber)]/30 transition-all disabled:opacity-50">
                <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center mb-3">
                  {generating === t.id ? <Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /> : <Icon className="w-5 h-5 text-[var(--amber)]" />}
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
          {reports.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-[var(--border)] mx-auto mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No reports generated yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/50">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-[var(--amber)]" />
                    <div>
                      <span className="text-sm text-white">{r.name}</span>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Ready</span>
                      </div>
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--amber)]/20 text-[var(--amber)] text-xs font-bold hover:bg-[var(--amber)]/30">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

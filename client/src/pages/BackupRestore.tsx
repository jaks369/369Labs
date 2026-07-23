import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Shield, Download, Upload, Loader2, CheckCircle2, AlertCircle, HardDrive } from "lucide-react";
import { toast } from "@/components/Toast";

export default function BackupRestore() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const backupMutation = trpc.auth.backupData.useQuery(undefined, { enabled: false });
  const restoreMutation = trpc.auth.restoreData.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupData, setBackupData] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await backupMutation.refetch();
      if (data.data) {
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `369labs-backup-${new Date().toISOString().split("T")[0]}.json`; a.click();
        URL.revokeObjectURL(url);
        setBackupData(data.data);
        toast("Backup downloaded successfully", "success");
      }
    } catch { toast("Failed to export data", "error"); }
    setExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.strategies && !data.trades && !data.journals) { toast("Invalid backup file format", "error"); setImporting(false); return; }
      const result = await restoreMutation.mutateAsync({ data });
      toast(`Imported ${result.imported} records`, "success");
    } catch { toast("Failed to import data", "error"); }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <HardDrive className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Backup & Restore</h1>
            <p className="text-xs text-[var(--text-muted)]">Export or import your trading data</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={handleExport} disabled={exporting} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-left hover:border-[var(--amber)]/30 transition-all disabled:opacity-50">
            <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center mb-3">
              {exporting ? <Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /> : <Download className="w-5 h-5 text-[var(--amber)]" />}
            </div>
            <span className="text-sm font-bold text-white">Export Backup</span>
            <p className="text-xs text-[var(--text-muted)] mt-1">Download all strategies, trades, journals, workflows, and bots as JSON</p>
          </button>

          <button onClick={() => fileRef.current?.click()} disabled={importing} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-left hover:border-[var(--amber)]/30 transition-all disabled:opacity-50">
            <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center mb-3">
              {importing ? <Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /> : <Upload className="w-5 h-5 text-[var(--amber)]" />}
            </div>
            <span className="text-sm font-bold text-white">Restore Backup</span>
            <p className="text-xs text-[var(--text-muted)] mt-1">Import data from a previously exported backup file</p>
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>

        {backupData && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
              <span className="text-sm font-bold text-white">Last Backup Summary</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              {(["strategies", "trades", "journals", "workflows", "bots"] as const).map(k => (
                <div key={k} className="bg-black/20 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-white">{(Array.isArray(backupData[k]) ? backupData[k].length : 0)}</p>
                  <p className="text-[var(--text-muted)] capitalize">{k}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-3">Exported: {new Date(backupData.exportedAt).toLocaleString()}</p>
          </div>
        )}

        <div className="bg-[var(--red-soft)]/20 border border-[var(--red)]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--red)] mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Restoring data will add records to your account. Duplicates are skipped. Restart the app if you notice inconsistencies after restore.</p>
        </div>
      </div>
    </div>
  );
}

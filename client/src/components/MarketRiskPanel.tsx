import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, Info } from "lucide-react";

interface AdvisoryItem {
  symbol: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  marketRisk: number;
  userRisk: number;
  confidence: number;
  factors: string[];
  warnings: string[];
  recommendation: string;
  timestamp: number;
}

interface MarketRiskPanelProps {
  data: AdvisoryItem[] | undefined;
  loading: boolean;
}

function levelIcon(level: string) {
  switch (level) {
    case "CRITICAL": return <ShieldAlert className="w-3.5 h-3.5" />;
    case "HIGH": return <AlertTriangle className="w-3.5 h-3.5" />;
    case "MEDIUM": return <Shield className="w-3.5 h-3.5" />;
    default: return <ShieldCheck className="w-3.5 h-3.5" />;
  }
}

function levelColor(level: string): string {
  switch (level) {
    case "CRITICAL": return "text-[var(--red)]";
    case "HIGH": return "text-[var(--amber)]";
    case "MEDIUM": return "text-[var(--cyan)]";
    default: return "text-[var(--green)]";
  }
}

function levelBg(level: string): string {
  switch (level) {
    case "CRITICAL": return "bg-[var(--red-soft)] border-[var(--red)]/30";
    case "HIGH": return "bg-[var(--amber-soft)] border-[var(--amber)]/30";
    case "MEDIUM": return "bg-[var(--cyan-soft)] border-[var(--cyan)]/30";
    default: return "bg-[var(--green-soft)] border-[var(--green)]/30";
  }
}

export default function MarketRiskPanel({ data, loading }: MarketRiskPanelProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Risk Advisories</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-3 w-20 bg-[var(--border)] rounded mb-2" />
              <div className="h-4 w-32 bg-[var(--border)] rounded mb-2" />
              <div className="h-2 w-full bg-[var(--border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="surface-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[var(--cyan)]" />
          <h3 className="section-title text-[11px]">Risk Advisories</h3>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] italic text-center py-6">No risk advisories. All markets operating within normal parameters.</p>
      </div>
    );
  }

  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...data].sort((a, b) => (severityOrder[a.riskLevel] ?? 9) - (severityOrder[b.riskLevel] ?? 9));

  const highCount = data.filter((a) => a.riskLevel === "HIGH" || a.riskLevel === "CRITICAL").length;

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-[var(--cyan)]" />
        <h3 className="section-title text-[11px]">Risk Advisories</h3>
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">{data.length} advisories{highCount > 0 ? `, ${highCount} critical/high` : ""}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((a) => (
          <div key={a.symbol} className={`rounded-lg p-3 border ${levelBg(a.riskLevel)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`flex items-center gap-1.5 ${levelColor(a.riskLevel)}`}>
                {levelIcon(a.riskLevel)}
                <span className="text-[9px] font-bold">{a.riskLevel}</span>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]">{new Date(a.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-white">{a.symbol}</span>
              <span className="text-[8px] text-[var(--text-secondary)]">Risk score: {a.riskScore}/100</span>
            </div>

            <div className="flex items-center gap-3 mb-2 text-[8px] text-[var(--text-muted)]">
              <span>Market: {a.marketRisk}</span>
              <span>User: {a.userRisk}</span>
              <span>Confidence: {a.confidence}%</span>
            </div>

            {a.warnings.length > 0 && (
              <div className="space-y-0.5 mb-1.5">
                {a.warnings.map((w, j) => (
                  <p key={j} className="text-[8px] text-[var(--red)]">ΓÜá {w}</p>
                ))}
              </div>
            )}

            {a.factors.length > 0 && (
              <div className="space-y-0.5 mb-1.5">
                {a.factors.slice(0, 2).map((f, j) => (
                  <p key={j} className="text-[8px] text-[var(--text-muted)]">ΓÇó {f}</p>
                ))}
              </div>
            )}

            <p className="text-[8px] text-[var(--text-secondary)] italic">{a.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Activity, TrendingUp, DollarSign, Target, ShieldAlert, BarChart3 } from "lucide-react";

interface PortfolioHealthCardProps {
  data: {
    accuracyPct: number;
    winRate: number;
    totalPnL: number;
    totalTrades: number;
    avgConfidence: number;
    riskRating: string;
    consistencyScore: number;
  } | undefined;
  loading: boolean;
}

function riskColor(rating: string): string {
  switch (rating) {
    case "LOW": return "text-[var(--green)]";
    case "MEDIUM": return "text-[var(--amber)]";
    case "HIGH": return "text-[var(--red)]";
    case "CRITICAL": return "text-[var(--red)]";
    default: return "text-[var(--text-muted)]";
  }
}

function riskBg(rating: string): string {
  switch (rating) {
    case "LOW": return "bg-[var(--green-soft)]";
    case "MEDIUM": return "bg-[var(--amber-soft)]";
    case "HIGH": return "bg-[var(--red-soft)]";
    case "CRITICAL": return "bg-[var(--red-soft)]";
    default: return "bg-[var(--text-muted)]/10";
  }
}

export default function PortfolioHealthCard({ data, loading }: PortfolioHealthCardProps) {
  if (loading) {
    return (
      <div className="surface-elevated p-5">
        <h3 className="section-title mb-4 text-[11px]">Portfolio Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[var(--bg)] rounded-lg p-3 animate-pulse">
              <div className="h-2 w-16 bg-[var(--border)] rounded mb-2" />
              <div className="h-5 w-12 bg-[var(--border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="surface-elevated p-5">
        <h3 className="section-title mb-4 text-[11px]">Portfolio Health</h3>
        <p className="text-[10px] text-[var(--text-muted)] italic text-center py-4">No portfolio data available yet.</p>
      </div>
    );
  }

  const metrics = [
    {
      label: "AI Accuracy",
      value: `${data.accuracyPct}%`,
      icon: Activity,
      color: data.accuracyPct >= 60 ? "text-[var(--green)]" : "text-[var(--red)]",
    },
    {
      label: "Win Rate",
      value: `${data.winRate}%`,
      icon: TrendingUp,
      color: data.winRate >= 50 ? "text-[var(--green)]" : "text-[var(--red)]",
    },
    {
      label: "Total PnL",
      value: `${data.totalPnL >= 0 ? "+" : ""}${data.totalPnL.toFixed(2)}`,
      icon: DollarSign,
      color: data.totalPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]",
    },
    {
      label: "Avg Confidence",
      value: `${data.avgConfidence}%`,
      icon: Target,
      color: "text-[var(--cyan)]",
    },
    {
      label: "Risk Rating",
      value: data.riskRating,
      icon: ShieldAlert,
      color: riskColor(data.riskRating),
      badge: true,
    },
    {
      label: "Consistency",
      value: `${data.consistencyScore}`,
      icon: BarChart3,
      color: data.consistencyScore >= 60 ? "text-[var(--green)]" : "text-[var(--amber)]",
    },
  ];

  return (
    <div className="surface-elevated p-5">
      <h3 className="section-title mb-4 text-[11px]">Portfolio Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="bg-[var(--bg)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <m.icon className={`w-3 h-3 ${m.color}`} />
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{m.label}</span>
            </div>
            {m.label === "Risk Rating" ? (
              <span className={`text-[13px] font-bold font-mono inline-block px-2 py-0.5 rounded ${riskBg(data.riskRating)} ${riskColor(data.riskRating)}`}>
                {data.riskRating}
              </span>
            ) : (
              <span className={`text-[16px] font-bold font-mono ${m.color}`}>{m.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

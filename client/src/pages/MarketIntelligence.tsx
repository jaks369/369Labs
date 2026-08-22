import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  RefreshCw,
  ShieldCheck,
  EyeOff,
  AlertTriangle,
  Newspaper,
  Activity,
  TrendingUp,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { PageContainer, PageSection } from "@/components/PageSection";

interface StanceBanner {
  verdict: "TRADE" | "WATCH" | "WAIT" | "NO TRADE";
  headline: string;
  summary: string;
  whatMatters: string[];
  whatToWatch: string[];
  whatWouldChange: string[];
}

interface ConditionView {
  symbol: string;
  displayName: string;
  supportsLabel: string;
  tier: string;
  tierLabel: string;
  observedPct: number;
  baselinePct: number;
  edgePp: number;
  ciLowPct: number;
  ciHighPct: number;
  pValue: number;
  fdrAdjusted: boolean;
  inSample: number;
  holds: number;
  walks: number;
  oosAvgPct: number;
  oosTotal: number;
  describe: string;
  triggerText: string;
  progress: string;
  interpretation: string;
  evidence: string[];
}

interface MarketDecision {
  symbol: string;
  displayName: string;
  submarket: string;
  stance: "TRADE" | "WATCH" | "WAIT" | "NO TRADE";
  stanceRule: string;
  why: string;
  whatToWatch: string;
  wouldTrigger: string;
  topCondition: ConditionView | null;
  healthScore: number;
  volatility: string;
}

interface Development {
  id: string;
  level: "major" | "watch" | "observed";
  title: string;
  detail: string;
  displayName: string;
  timestamp: number;
}

interface EnvironmentView {
  level: "HIGH" | "MODERATE" | "LOW";
  headline: string;
  summary: string;
  standsOut: string[];
  totals: { critical: number; high: number; moderate: number; low: number; total: number };
}

interface HealthView {
  symbol: string;
  displayName: string;
  score: number;
  volatility: string;
  whyStandout: string;
  detail: string[];
}

interface MarketReport {
  generatedAt: number;
  active: boolean;
  stanceBanner: StanceBanner;
  developments: Development[];
  conditionList: ConditionView[];
  markets: MarketDecision[];
  environment: EnvironmentView;
  health: HealthView[];
}

const STANCE_META = {
  TRADE: { icon: TrendingUp, cls: "border-[var(--green)]/40 bg-[var(--green)]/10 text-[var(--green)]" },
  WATCH: { icon: Activity, cls: "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]" },
  WAIT: { icon: AlertTriangle, cls: "border-[var(--accent)]/30 bg-black/10 text-[var(--accent)]" },
  "NO TRADE": { icon: EyeOff, cls: "border-[var(--border)] bg-black/20 text-[var(--text-muted)]" },
} as const;

const TIER_BADGE: Record<string, string> = {
  strong: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30",
  watch: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
  insufficient: "bg-[var(--accent)]/10 text-[var(--text-secondary)] border-[var(--accent)]/20",
  failed: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30",
  no_edge: "bg-white/5 text-[var(--text-muted)] border-[var(--border)]",
};

function verdictColor(v: string): string {
  switch (v) {
    case "TRADE": return "text-[var(--green)]";
    case "WATCH":
    case "WAIT": return "text-[var(--accent)]";
    default: return "text-[var(--text-muted)]";
  }
}

function StanceBannerCard({ banner }: { banner: StanceBanner }) {
  const meta = STANCE_META[banner.verdict];
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border px-5 py-4 ${meta.cls}`}>
      <div className="flex items-center gap-2.5">
        <Icon className="w-5 h-5" />
        <span className={`text-sm font-extrabold tracking-widest ${verdictColor(banner.verdict)}`}>{banner.verdict}</span>
        <span className="text-sm font-bold text-white">{banner.headline}</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-2">{banner.summary}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        {[
          { label: "WHAT MATTERS NOW", items: banner.whatMatters },
          { label: "WHAT TO WATCH", items: banner.whatToWatch },
          { label: "WHAT WOULD CHANGE IT", items: banner.whatWouldChange },
        ].map((col) => (
          <div key={col.label} className="bg-black/10 border border-[var(--border)]/60 rounded-lg p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">{col.label}</p>
            {col.items.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)] italic">—</p>
            ) : (
              col.items.map((it, i) => <p key={i} className="text-[10px] text-[var(--text-secondary)] leading-relaxed">• {it}</p>))
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({ c, showSymbol }: { c: ConditionView; showSymbol: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-start gap-2 cursor-pointer">
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {showSymbol && <span className="text-[11px] font-bold text-[var(--accent)]">{c.displayName}</span>}
            <span className="text-[11px] font-bold text-white">{c.supportsLabel}</span>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${TIER_BADGE[c.tier] || TIER_BADGE.no_edge}`}>{c.tierLabel}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{c.interpretation}</p>
        </div>
        <span className={`text-[10px] font-bold whitespace-nowrap ${c.edgePp >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {c.edgePp >= 0 ? "+" : ""}{c.edgePp}pp
        </span>
      </button>
      {open && (
        <div className="ml-5 mt-1.5 space-y-0.5">
          {c.evidence.map((ev, j) => <p key={j} className="text-[9px] text-[var(--text-muted)]">• {ev}</p>)}
          <p className="text-[9px] text-[var(--text-secondary)] italic mt-1">Trigger: {c.triggerText}</p>
          <p className="text-[9px] text-[var(--text-secondary)] italic">Progress: {c.progress || "—"}</p>
          {c.inSample > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <div className="bg-black/10 rounded-lg p-2">
                <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">In-Sample</p>
                <p className="text-[11px] font-bold text-white">{c.observedPct}%</p>
                <p className="text-[8px] text-[var(--text-muted)]">{c.inSample} samples</p>
              </div>
              <div className="bg-black/10 rounded-lg p-2">
                <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">CI [{c.ciLowPct}%, {c.ciHighPct}%]</p>
                <p className="text-[11px] font-bold text-white">baseline {c.baselinePct}%</p>
                <p className="text-[8px] text-[var(--text-muted)]">{c.fdrAdjusted ? "BH-FDR" : "uncorrected"}</p>
              </div>
              <div className="bg-black/10 rounded-lg p-2">
                <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">OOS Avg</p>
                <p className="text-[11px] font-bold text-white">{c.oosAvgPct}%</p>
                <p className="text-[8px] text-[var(--text-muted)]">{c.oosTotal} samples</p>
              </div>
              <div className="bg-black/10 rounded-lg p-2">
                <p className="text-[8px] uppercase font-bold text-[var(--text-muted)]">Walk-Forward</p>
                <p className="text-[11px] font-bold text-white">{c.holds}/{c.walks}</p>
                <p className="text-[8px] text-[var(--text-muted)]">windows passing</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MarketRow({ m }: { m: MarketDecision }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-start gap-2 cursor-pointer">
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-white">{m.displayName}</span>
            <span className="text-[9px] text-[var(--text-muted)] bg-[var(--border)] rounded px-1.5 py-0.5">{m.submarket}</span>
            <span className={`text-[9px] font-extrabold ${verdictColor(m.stance)}`}>{m.stance}</span>
            {m.volatility && <span className="text-[9px] text-[var(--text-muted)]">{m.volatility} vol</span>}
            {m.healthScore > 0 && <span className="text-[9px] text-[var(--text-muted)]">health {m.healthScore}/100</span>}
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{m.why}</p>
        </div>
      </button>
      {open && (
        <div className="ml-2 mt-2 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-[var(--text-muted)]">
            <div className="bg-black/10 rounded-lg p-2"><span className="font-bold text-[var(--text-secondary)]">Why:</span> {m.why}</div>
            <div className="bg-black/10 rounded-lg p-2"><span className="font-bold text-[var(--text-secondary)]">Watch:</span> {m.whatToWatch}</div>
          </div>
          <p className="text-[9px] text-[var(--text-secondary)] italic">Trade if: {m.wouldTrigger}</p>
          {m.topCondition && <ConditionRow c={m.topCondition} showSymbol={false} />}
        </div>
      )}
    </div>
  );
}

export default function MarketIntelligencePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  const overview = trpc.aiMarket.overview.useQuery(undefined, { refetchInterval: 30000 });
  const data = overview.data as { report?: MarketReport } | undefined;
  const report = data?.report;
  const isLoading = overview.isLoading;

  return (
    <PageContainer className="page-container">
      <div className="max-w-7xl mx-auto">
        <PageSection>
          <div className="flex items-center gap-2.5 mb-6">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-2xl font-bold text-white">Market <span className="text-gradient-cyan">Intelligence</span></h1>
            <p className="text-[var(--text-muted)] text-sm ml-2 hidden md:inline">What the data says, right now</p>
            <div className="ml-auto flex items-center gap-2">
              {report && (
                <span className="text-[9px] text-[var(--text-muted)]">
                  Updated{" "}
                  {new Date(Math.max(report.generatedAt || 0, overview.data?.lastUpdated || 0)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button onClick={() => overview.refetch()} className="text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${overview.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </PageSection>

        {isLoading && !report && (
          <PageSection><div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-10"><Loader2 className="w-4 h-4 animate-spin" /> Synthesising the market picture…</div></PageSection>
        )}

        {overview.isError && (
          <PageSection>
            <div className="p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0" />
              <p className="text-xs text-[var(--red)]">Failed to build the market report. Data may be stale.</p>
            </div>
          </PageSection>
        )}

        {report && (
          <>
            {/* CURRENT MARKET STANCE — the whole point of the page */}
            <PageSection>
              <div className="mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-white">Current Market Stance</h2>
              </div>
              <StanceBannerCard banner={report.stanceBanner} />
            </PageSection>

            {/* IMPORTANT DEVELOPMENTS — gated; nothing if nothing material */}
            <PageSection>
              <div className="mb-3 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-white">Important Developments</h2>
                <span className="text-[9px] text-[var(--text-muted)] ml-auto">Only material, validated changes

                </span>
              </div>
              {report.developments.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-6">
                  <p className="text-xs text-[var(--text-muted)]">No material market development detected. Nothing surprises us right now — and that is information too.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.developments.map((d) => (
                    <div key={d.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${d.level === "major" ? "border-[var(--green)]/40 bg-[var(--green)]/10 text-[var(--green)]" : d.level === "watch" ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-white/5 text-[var(--text-muted)]"}`}>
                          {d.level === "major" ? "VALIDATED" : d.level === "watch" ? "MATURING" : "OBSERVED"}
                        </span>
                        <span className="text-[11px] font-bold text-white">{d.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{d.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </PageSection>

            {/* TRADEABLE CONDITIONS — verified across all symbols, top first */}
            <PageSection>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-white">Tradeable Conditions</h2>
                <span className="text-[9px] text-[var(--text-muted)] ml-auto">Every symbol scanned · validated with CI vs baseline + FDR + walk-forward</span>
              </div>
              {report.conditionList.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-8 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-[var(--border)] flex items-center justify-center mb-3">
                    <EyeOff className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-sm font-bold text-white">No verified tradeable condition right now</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md">
                    Every market was scanned against the full fixed pattern library and its fair baseline — nothing cleared CI, FDR
                    and walk-forward. Sitting out is the correct, data-driven result.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.conditionList.map((c) => <ConditionRow key={`${c.symbol}.${c.supportsLabel}`} c={c} showSymbol />)}
                </div>
              )}
            </PageSection>

            {/* MARKETS — ranked, with stance + why + watch + trigger */}
            <PageSection>
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-white">Markets</h2>
              </div>
              {report.markets.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-6 text-center">
                  <p className="text-xs text-[var(--text-muted)]">No market data available yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.markets.map((m) => <MarketRow key={m.symbol} m={m} />)}
                </div>
              )}
            </PageSection>

            {/* RISK ENVIRONMENT — one synthesized statement + expandable per-market */}
            <PageSection>
              <div className="mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-white">Risk Environment</h2>
              </div>
              <div className={`rounded-xl border px-4 py-3.5 ${report.environment.level === "HIGH" ? "border-[var(--red)]/40 bg-[var(--red)]/10" : report.environment.level === "MODERATE" ? "border-[var(--accent)]/40 bg-[var(--accent)]/10" : "border-[var(--border)] bg-black/10"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 ${report.environment.level === "HIGH" ? "text-[var(--red)]" : report.environment.level === "MODERATE" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`} />
                  <span className="text-sm font-bold text-white">{report.environment.headline}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{report.environment.summary}</p>
                {report.environment.standsOut.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {report.environment.standsOut.map((s, i) => (
                      <p key={i} className="text-[10px] text-[var(--red)]">• {s}</p>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setExpanded((p) => ({ ...p, risk: !p.risk }))}
                  className="mt-2 text-[10px] font-bold text-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                >
                  {expanded.risk ? "Hide" : "Show"} per-market breakdown ({report.environment.totals.total})
                </button>
                {expanded.risk && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-2">
                    {report.markets.map((m) => (
                      <div key={m.symbol} className="bg-black/10 border border-[var(--border)]/60 rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-white">{m.displayName}</span>
                          <span className={`ml-auto text-[9px] font-bold ${verdictColor(m.stance)}`}>{m.stance}</span>
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)]">{m.healthScore > 0 ? `health ${m.healthScore}/100 · ` : ""}{m.volatility} vol</p>
                        <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.why}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PageSection>
          </>
        )}
      </div>
    </PageContainer>
  );
}
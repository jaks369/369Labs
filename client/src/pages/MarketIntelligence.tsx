import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BarChart3, RefreshCw, AlertTriangle, Search, TrendingUp, TrendingDown, Minus, Activity, Loader2, Newspaper, ShieldCheck, EyeOff } from "lucide-react";
import LiveValue from "@/components/LiveValue";
import { IntegerStat } from "@/components/LiveStat";
import { PageContainer, PageSection } from "@/components/PageSection";
import MarketHealthGrid from "@/components/MarketHealthGrid";
import MarketPredictionCards from "@/components/MarketPredictionCards";
import MarketInsightCards from "@/components/MarketInsightCards";
import MarketRiskPanel from "@/components/MarketRiskPanel";
import { Button } from "@/components/ui/button";

import { getAllSymbols, getSymbolDisplayName } from "@shared/symbols";

const SCREENER_SYMBOLS = getAllSymbols() ?? [];

const TIER_META: Record<string, { label: string; badge: string; cls: string; desc: string }> = {
  strong: { label: "Strong", badge: "🟢", cls: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30", desc: "Edge held across 3+ walk-forward windows with FDR correction." },
  watch: { label: "Watching", badge: "🟡", cls: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30", desc: "Edge present in-sample; needs more forward confirmation." },
  failed: { label: "Failed", badge: "🔴", cls: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30", desc: "Failed to hold forward." },
  no_edge: { label: "No edge", badge: "⚪", cls: "bg-white/5 text-[var(--text-muted)] border-[var(--border)]", desc: "No clear edge over the fair baseline." },
};

export default function MarketIntelligencePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [active, setActive] = useState<string>(SCREENER_SYMBOLS[0] ?? "");

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  const overviewQuery = trpc.aiMarket.overview.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data, isLoading } = overviewQuery;

  // Tradeable conditions come from the SAME engine the signals page uses —
  // never from the overview's memorized stats.
  const fitQuery = trpc.signals.fit.useQuery(
    { symbol: active || "", sampleSize: 1000 },
    { enabled: !!active, refetchInterval: 120000, staleTime: 60000 },
  );
  const results = useMemo(() => (Array.isArray((fitQuery.data as any)?.results) ? (fitQuery.data as any).results : []), [fitQuery.data]);

  const strong = results.filter((r: any) => r.tier === "strong");
  const watch = results.filter((r: any) => r.tier === "watch");
  const noneHeld = !fitQuery.isLoading && strong.length === 0 && watch.length === 0;

  const refreshEngine = useCallback(() => { fitQuery.refetch(); }, [fitQuery]);

  return (
    <PageContainer className="page-container">
      <div className="max-w-7xl mx-auto">
        <PageSection>
          <div className="flex items-center gap-2.5 mb-6">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-2xl font-bold text-white">Market <span className="text-gradient-cyan">Intelligence</span></h1>
            <p className="text-[var(--text-muted)] text-sm ml-2 hidden md:inline">Market overview, developments & verified conditions</p>
            <div className="ml-auto flex items-center gap-2">
              {data?.lastUpdated && (
                <span className="text-[9px] text-[var(--text-muted)]">
                  Updated <LiveValue value={data.lastUpdated} format={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} springConfig={{ stiffness: 200, damping: 50 }} />
                </span>
              )}
              <button onClick={() => { overviewQuery.refetch(); refreshEngine(); }} className="text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${overviewQuery.isFetching || fitQuery.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </PageSection>

        {/* Section 1 — Market Overview */}
        <PageSection>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-white">1 · Market Overview</h2>
          </div>
          {overviewQuery.isError && (
            <div className="mb-6 p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0" />
              <p className="text-xs text-[var(--red)]">Failed to load market intelligence. Data may be stale.</p>
            </div>
          )}
          {!isLoading && !overviewQuery.isError && !data && (
            <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex items-center justify-center">
              <p className="text-xs text-[var(--text-muted)]">No market data available yet.</p>
            </div>
          )}
          {!isLoading && !overviewQuery.isError && (
            <MarketHealthGrid data={(data as any)?.health} loading={isLoading} />
          )}
        </PageSection>

        {/* Section 2 · Important Developments */}
        {!isLoading && !overviewQuery.isError && (
          <PageSection>
            <div className="mb-3 flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-white">2 · Important Developments</h2>
              <span className="text-[9px] text-[var(--text-muted)] ml-auto">Descriptive — derived from validated conditions, not forecasts</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <MarketPredictionCards data={(data as any)?.predictions} loading={isLoading} />
              <MarketInsightCards data={(data as any)?.insights} loading={isLoading} />
            </div>
            <div className="mt-5">
              <MarketRiskPanel data={(data as any)?.advisories} loading={isLoading} />
            </div>
          </PageSection>
        )}

        {/* Section 3 · Tradeable Conditions (pulled from the signal engine) */}
        <PageSection>
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-white">3 · Tradeable Conditions</h2>
            <div className="ml-auto flex items-center gap-2">
              <select value={active} onChange={(e) => setActive(e.target.value)} className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
                {SCREENER_SYMBOLS.map((s) => <option key={s} value={s}>{getSymbolDisplayName(s)}</option>)}
              </select>
              <Button onClick={refreshEngine} disabled={fitQuery.isFetching} className="bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 text-xs px-3 py-1.5 rounded-lg">
                {fitQuery.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Re-run engine"}
              </Button>
            </div>
          </div>

          {fitQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-10">
              <Loader2 className="w-4 h-4 animate-spin" /> Running fixed-pattern engine on {getSymbolDisplayName(active)}…
            </div>
          ) : !noneHeld && (strong.length + watch.length > 0) ? (
            <div className="space-y-3">
              <p className="text-[10px] text-[var(--text-muted)]">Conditions below use the same engine and acceptance rules as the AI Signals page — CI vs baseline, BH-FDR, walk-forward. They describe what the data shows, they do not direct trading.</p>
              {[...strong, ...watch].map((r: any, i: number) => (
                <div key={r.key ?? i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[var(--accent)]">{getSymbolDisplayName(active)}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{r.supportsLabel}</span>
                    <span className={`px-2 py-0.5 rounded text-micro font-bold border ${TIER_META[r.tier]?.cls || TIER_META.no_edge.cls}`}>{TIER_META[r.tier]?.badge || "⚪"} {TIER_META[r.tier]?.label || r.tier}</span>
                  </div>
                  <p className="text-sm text-white mt-2">{r.describe}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] mt-2">
                    <span>Baseline <b className="text-white">{(r.baseline * 100).toFixed(1)}%</b></span>
                    <span>Observed <b className="text-white">{(r.observed * 100).toFixed(1)}%</b></span>
                    <span className={r.edgePp > 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>Edge {r.edgePp > 0 ? "+" : ""}{r.edgePp}pp</span>
                    <span>CI <b className="text-white">{(r.ciLow * 100).toFixed(1)}–{(r.ciHigh * 100).toFixed(1)}%</b></span>
                    <span>FDR {r.fdrAdjusted ? "✓" : "✕"}</span>
                    <span>Forward {r.holds}/{r.walks?.length ?? 0} windows</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">Trigger: {r.triggerText} · Progress: {r.currentProgress?.current || "—"} · Last verified {r.discoveredAt ? new Date(r.discoveredAt * 1000).toLocaleString() : "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Section 4 · explicit no-trade state */
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-[var(--border)] flex items-center justify-center mb-3">
                <EyeOff className="w-5 h-5 text-[var(--text-muted)]" />
              </div>
              <p className="text-sm font-bold text-white">No verified tradeable condition right now</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md">
                The engine evaluated the full fixed pattern library on {getSymbolDisplayName(active)} and found no pattern that beat its
                fair baseline (CI clears, BH-FDR, walk-forward). This is a valid outcome — sitting out is data-driven, not a failure of the scan.
              </p>
            </div>
          )}
        </PageSection>

        {/* Symbol Screener (descriptive overview) */}
        {!isLoading && !overviewQuery.isError && (
          <PageSection>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-[var(--accent)]" /> Market Overview · Symbol Screener</h2>
              {isLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" /></div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {SCREENER_SYMBOLS.map((sym) => {
                    const healthData = (data as any)?.health?.find?.((h: any) => h?.symbol === sym || h?.name === sym);
                    const dir = healthData?.direction || (healthData?.trend > 10 ? "up" : healthData?.trend < -10 ? "down" : "neutral");
                    const pct = healthData?.score || 0;
                    const isUp = dir === "up";
                    const isDown = dir === "down";
                    return (
                      <button key={sym} onClick={() => setActive(sym)} className={`bg-black/20 rounded-lg p-3 text-center border ${active === sym ? "border-[var(--accent)]" : "border-[var(--border)]"} hover:border-[var(--accent)]/60 transition-colors`}>
                        <p className="text-xs font-bold text-white">{getSymbolDisplayName(sym)}</p>
                        <p className={`text-caption ${isUp ? "text-[var(--green)]" : isDown ? "text-[var(--red)]" : "text-[var(--text-muted)]"} mt-1`}>
                          {isUp ? <TrendingUp className="w-3 h-3 inline" /> : isDown ? <TrendingDown className="w-3 h-3 inline" /> : <Minus className="w-3 h-3 inline" />}
                          {typeof pct === "number" ? <><IntegerStat value={pct} variant={isUp ? "always-positive" : isDown ? "always-negative" : "neutral"} />%</> : "-"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-caption text-[var(--text-muted)] mt-3">Click a symbol to load its tradeable conditions above.</p>
            </div>
          </PageSection>
        )}
      </div>
    </PageContainer>
  );
}
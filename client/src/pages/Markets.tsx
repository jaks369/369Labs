import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BarChart3, Search, RefreshCw, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";
import { getAllSymbols, getSymbolDisplayName } from "@shared/symbols";
import { PageContainer, PageSection } from "@/components/PageSection";
import { FilterPill } from "@/components/ui/filter-pill";

const SYMBOLS = getAllSymbols() ?? [];

type Group = "all" | "volatility" | "volatility_1s" | "boom_crash";

function groupOf(sym: string): Group {
  if (/^1HZ/.test(sym)) return "volatility_1s";
  if (/^R_/.test(sym)) return "volatility";
  return "boom_crash";
}

function SparklineMini({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="w-16 h-5" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 64, h = 18;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ");
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={color} opacity="0.08" />
    </svg>
  );
}

export default function Markets() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<Record<string, { price: number; change: number; spark: number[] }>>({});
  const prevRef = useRef<Record<string, number>>({});
  const tickBufferRef = useRef<Record<string, any>>({});
  const rafIdRef = useRef<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const healthQuery = trpc.aiMarket.overview.useQuery(void 0, { refetchInterval: 60000 });
  const signalsQuery = trpc.signals.list.useQuery(void 0, { refetchInterval: 60000 });
  const historyQuery = trpc.market.getHistory.useQuery({ symbols: SYMBOLS, limit: 1 }, { staleTime: 30000 });

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  // Fetch initial prices for all symbols so the table isn't all dashes while live ticks connect
  useEffect(() => {
    if (!historyQuery.data?.ticks) return;
    const initial: typeof live = {};
    for (const tick of historyQuery.data.ticks) {
      if (!initial[tick.symbol]) {
        initial[tick.symbol] = { price: tick.price, change: 0, spark: [tick.price] };
        prevRef.current[tick.symbol] = tick.price;
      }
    }
    setLive(initial);
    setInitialLoading(false);
  }, [historyQuery.data]);

  useEffect(() => {
    const subs = SYMBOLS.map((sym) => derivWS.subscribe(sym));

    const listener = {
      onTick: (tick: any) => {
        tickBufferRef.current[tick.symbol] = tick;
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            setLive((prev) => {
              const updates: typeof prev = { ...prev };
              for (const [sym, tick] of Object.entries(tickBufferRef.current)) {
                const ref = prevRef.current[sym] ?? tick.price;
                const change = ref ? ((tick.price - ref) / ref) * 100 : 0;
                prevRef.current[sym] = tick.price;
                updates[sym] = { price: tick.price, change, spark: [...(prev[sym]?.spark || []).slice(-30), tick.price] };
              }
              tickBufferRef.current = {};
              rafIdRef.current = 0;
              return updates;
            });
          });
        }
      },
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); subs.forEach((id) => derivWS.unsubscribe(id)); if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, []);

  useEffect(() => {
    if (historyQuery.isError) setInitialLoading(false);
  }, [historyQuery.isError]);

  const healthMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const h of (healthQuery.data?.health as any[]) || []) {
      if (h?.symbol) m[h.symbol] = h;
      if (h?.displayName) {
        const code = SYMBOLS.find((s) => getSymbolDisplayName(s) === h.displayName);
        if (code) m[code] = h;
      }
    }
    return m;
  }, [healthQuery.data]);

  const signals = useMemo(() => (signalsQuery.data || []) as any[], [signalsQuery.data]);
  const hotSet = useMemo(() => {
    const s = new Set<string>();
    for (const h of Object.values(healthMap)) if ((h as any)?.score >= 70) s.add((h as any).symbol);
    return s;
  }, [healthMap]);

  const healthValues = Object.values(healthMap);
  const avgScore = healthValues.length
    ? Math.round(healthValues.reduce((a: number, h: any) => a + (h.score || 0), 0) / healthValues.length)
    : null;
  const avgMomentum = healthValues.length
    ? healthValues.reduce((a: number, h: any) => a + (h.momentum || 0), 0) / healthValues.length
    : 0;
  const momentumLabel = avgMomentum > 20 ? "Strong" : avgMomentum > 5 ? "Moderate" : "Choppy";
  const highVolCount = healthValues.filter((h: any) => h.volatility === "High").length;
  const activeSignals = signals.filter((s: any) => s.status === "active").length || signals.length;

  const volMemo = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const sym of SYMBOLS) {
      const p = live[sym];
      if (!p || p.spark.length < 5) { map[sym] = null; continue; }
      const min = Math.min(...p.spark), max = Math.max(...p.spark);
      const avg = (min + max) / 2 || 1;
      const rangePct = ((max - min) / avg) * 100;
      map[sym] = rangePct > 0.5 ? "High" : rangePct > 0.15 ? "Medium" : "Low";
    }
    return map;
  }, [live]);

  const decimalPlacesMemo = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sym of SYMBOLS) map[sym] = derivWS.decimalPlacesFor(sym);
    return map;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYMBOLS.filter((s) => group === "all" || groupOf(s) === group)
      .filter((s) => !q || s.toLowerCase().includes(q) || getSymbolDisplayName(s).toLowerCase().includes(q));
  }, [group, query]);

  return (
    <PageContainer className="page-container">
      {initialLoading ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--text-muted)]">Loading market data...</p>
          </div>
        </div>
      ) : (
        <>
      <PageSection>
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-2xl font-bold text-white">Markets</h1>
            <p className="text-[var(--text-muted)] text-sm ml-2 hidden md:inline">Live instruments with 369AI intelligence</p>
          </div>
          <div className="md:ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 w-full md:w-56">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search markets..."
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-[var(--border)] w-full"
              />
            </div>
            <button onClick={() => healthQuery.refetch()} className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </PageSection>

      {/* Market Overview strip */}
      <PageSection>
        <div className="panel px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-2 min-w-[150px]">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">AI Market Health</span>
              <span className="font-mono tabular-nums font-bold text-[13px] text-[var(--accent)]">{avgScore != null ? `${avgScore}/100` : "—"}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[110px]">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Momentum</span>
              <span className={`font-mono tabular-nums font-bold text-[13px] ${avgMomentum > 5 ? "text-[var(--green)]" : avgMomentum < -5 ? "text-[var(--red)]" : "text-white"}`}>
                {avgMomentum > 20 ? "Strong" : avgMomentum > 5 ? "Moderate" : avgMomentum < -5 ? "Weak" : "Choppy"}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-[120px]">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Volatility</span>
              <span className={`font-mono tabular-nums font-bold text-[13px] ${highVolCount > 0 ? "text-[var(--red)]" : "text-white"}`}>
                {highVolCount > 0 ? `${highVolCount} High` : "Calm"}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-[130px]">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Active Signals</span>
              <span className="font-mono tabular-nums font-bold text-[13px] text-[var(--green)]">{activeSignals}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[120px]">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Monitored</span>
              <span className="font-mono tabular-nums font-bold text-[13px] text-white">{SYMBOLS.length} symbols</span>
            </div>
            {momentumLabel && <span className="text-[10px] text-[var(--text-secondary)] ml-auto hidden xl:inline">Momentum: {momentumLabel} across monitored markets</span>}
          </div>
        </div>
      </PageSection>

      {/* Group filter */}
      <PageSection>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-4">
          {([["all", "All"], ["volatility", "Volatility"], ["volatility_1s", "Volatility 1s"], ["boom_crash", "Boom & Crash"]] as [Group, string][]).map(([g, label]) => (
            <FilterPill key={g} active={group === g} onClick={() => setGroup(g)} label={label} />
          ))}
        </div>

        {/* Instrument table */}
        <div className="panel overflow-hidden">
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr><th>INSTRUMENT</th><th className="text-right">PRICE</th><th className="text-right">CHANGE</th><th className="text-right">AI</th><th>VOLATILITY</th><th>TREND</th><th className="text-right">SPARK</th><th>SIGNAL</th></tr>
              </thead>
              <tbody>
                {rows.map((sym) => {
                  const p = live[sym];
                  const h = healthMap[sym];
                  const isHot = hotSet.has(sym);
                  const hasSignal = signals.some((s: any) => s.symbol === sym);
                  const isLive = !!p && p.spark.length > 0;
                  const vol = h?.volatility || volMemo[sym] || null;
                  const trend = h?.trend != null ? h.trend : p ? (p.change >= 0.05 ? 1 : p.change <= -0.05 ? -1 : 0) : 0;
                  const score = h?.score;
                  const aiColor = score == null ? "var(--text-muted)" : score >= 70 ? "var(--green)" : score >= 40 ? "var(--accent)" : "var(--red)";
                  const volColor = vol === "High" ? "var(--red)" : vol === "Medium" ? "var(--accent)" : vol === "Low" ? "var(--green)" : "var(--text-muted)";
                  return (
                    <tr key={sym} onClick={() => navigate(`/dashboard?symbol=${encodeURIComponent(sym)}`)} className="cursor-pointer">
                      <td>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-white">{sym}</span>
                          <span className="hidden md:inline text-caption text-[var(--text-muted)] truncate max-w-[160px]">{getSymbolDisplayName(sym)}</span>
                          {isHot && <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent-border)]">Hot</span>}
                        </div>
                      </td>
                      <td className="text-right font-mono tabular-nums text-white">
                        {p ? Number(p.price).toFixed(decimalPlacesMemo[sym]) : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className={`text-right font-mono tabular-nums font-bold ${p ? (p.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]") : "text-[var(--text-muted)]"}`}>
                        {p ? `${p.change >= 0 ? "+" : ""}${Number(p.change).toFixed(2)}%` : "—"}
                      </td>
                      <td className="text-right">
                        {score != null ? (
                          <span className="font-mono tabular-nums font-bold text-[13px]" style={{ color: aiColor }}>{score}</span>
                        ) : (
                          <span className="text-[var(--text-disabled)]">—</span>
                        )}
                      </td>
                      <td>
                        {vol ? <span className="font-mono tabular-nums font-bold text-caption" style={{ color: volColor }}>{vol.toUpperCase()}</span> : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td>
                        {trend > 0.5 ? <TrendingUp className="w-3.5 h-3.5 text-[var(--green)]" /> : trend < -0.5 ? <TrendingDown className="w-3.5 h-3.5 text-[var(--red)]" /> : <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      </td>
                      <td className="text-right">
                        {p ? <SparklineMini points={p.spark} up={p.change >= 0} /> : <span className="w-16 inline-block" />}
                      </td>
                      <td>
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-[var(--green)]/15 text-[var(--green)] border border-[var(--green)]/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" /> Live
                          </span>
                        ) : (
                          <span className="text-[var(--text-disabled)] text-caption">—</span>
                        )}
                        {hasSignal && <span className="ml-1.5 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent-border)]">AI</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty-state"><p className="empty-state-desc">No instruments match "{query}".</p></div>}
          </div>
          <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
            <p className="text-caption text-[var(--text-muted)]">Prices stream live from Deriv. AI scores from the 369AI market scanner.</p>
            <button onClick={() => navigate("/market-intelligence")} className="text-caption font-bold text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 cursor-pointer">
              Full intelligence <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </PageSection>
        </>
      )}
    </PageContainer>
  );
}

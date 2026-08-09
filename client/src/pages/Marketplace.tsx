import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CandlestickChart, Sparkles, Clock, Bot, Loader2, FlaskConical, Users, Code, Shield, BookOpen, Star, Upload, TimerReset } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { getValidSymbols, getSymbolDisplayName } from "@/lib/symbols";
import { getDecimalPlaces } from "@shared/lastDigit";

const TIER_META: Record<string, { label: string; cls: string; badge: string; desc: string }> = {
  strong: { label: "Strong", badge: "🟢", cls: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30", desc: "Significant edge that held forward across 3+ walk-forward windows." },
  watch: { label: "Watching", badge: "🟡", cls: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30", desc: "Edge is present in-sample but needs more out-of-sample confirmation." },
  failed: { label: "Failed", badge: "🔴", cls: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30", desc: "Edge did not hold in out-of-sample windows." },
  no_edge: { label: "No edge", badge: "⚪", cls: "bg-white/5 text-[var(--text-muted)] border-[var(--border)]", desc: "Observed rate did not clear the fair baseline within confidence." },
};

function fmtPct(x: number): string { return (x * 100).toFixed(1) + "%"; }
function fmtPp(x: number): string { return (x > 0 ? "+" : "") + x.toFixed(1) + "pp"; }
function isStale(sig: any): boolean {
  const now = Date.now() / 1000;
  return (sig.expiresAt && now > sig.expiresAt) || (sig.discoveredAt && now > sig.discoveredAt + 4 * 3600);
}

function ProgressDots({ met, needed }: { met?: number; needed?: number }) {
  if (met == null || needed == null) return null;
  const n = Math.max(1, Math.min(12, needed || 1));
  const filled = Math.max(0, Math.min(n, Math.round(met)));
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full inline-block ${i < filled ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]/30"}`} />
      ))}
    </span>
  );
}

function TierBadge({ sig }: { sig: any }) {
  const tier = sig.tier ?? "no_edge";
  const meta = TIER_META[tier] || TIER_META.no_edge;
  if (isStale(sig)) {
    return <span className="px-2 py-0.5 rounded text-micro font-bold border bg-white/5 text-[var(--text-muted)] border-[var(--border)]">⏳ Stale</span>;
  }
  return (
    <span className={`px-2 py-0.5 rounded text-micro font-bold border ${meta.cls}`} title={meta.desc}>
      {meta.badge} {meta.label}
    </span>
  );
}

function SignalCardRow({ sig, expandedId, setExpanded, onBacktest, onDeploy }: {
  sig: any;
  expandedId: string | number | null;
  setExpanded: (v: string | number | null) => void;
  onBacktest: () => void;
  onDeploy: () => void;
}) {
  const tier = sig.tier ?? "no_edge";
  const meta = TIER_META[tier] || TIER_META.no_edge;
  const stale = isStale(sig);
  const ev = Array.isArray(sig.evidence) ? sig.evidence.slice(0, 12) : [];
  const walks: any[] = Array.isArray(sig.walks) ? sig.walks : [];
  const observed = Number(sig.observed) || (Number(sig.winRate ?? 0) / 100);
  const baseline = Number(sig.baseline) || (Number(sig.baselineWinRate ?? 0) / 100) || 0.5;
  const edge = sig.edgePp != null ? sig.edgePp : Number(((observed - baseline) * 100).toFixed(1));
  const ciLow = sig.ciLow != null ? Number(sig.ciLow) : sig.confidence != null ? Number(sig.confidence) / 100 : null;
  const ciHigh = sig.ciHigh != null ? Number(sig.ciHigh) : null;
  const supports = sig.supportsLabel || sig.title || sig.symbol;
  const id = sig.id ?? sig.key ?? "";
  const open = expandedId === id;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent)] text-micro font-bold">{getSymbolDisplayName(sig.symbol)}</span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-[var(--text-secondary)] text-micro border border-[var(--border)]">{supports}</span>
              <TierBadge sig={sig} />
              {sig.fdrAdjusted ? (
                <span className="px-2 py-0.5 rounded text-micro bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20" title="Survived Benjamini–Hochberg FDR correction across the full scan.">FDR ✓</span>
              ) : (
                <span className="px-2 py-0.5 rounded text-micro bg-white/5 text-[var(--text-muted)] border border-[var(--border)]">no FDR</span>
              )}
            </div>

            <h3 className="font-bold text-white mt-2">{sig.describe || sig.title}</h3>
            {sig.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{sig.description}</p>}

            {/* stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-xs">
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Baseline</p>
                <p className="text-white font-bold mt-0.5">{fmtPct(baseline)}</p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Observed</p>
                <p className="font-bold mt-0.5">{fmtPct(observed)}</p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Edge</p>
                <p className={`font-bold mt-0.5 ${edge > 0 ? "text-[var(--green)]" : edge < 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>{fmtPp(edge)}</p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2" title="95% Wilson confidence interval for the observed rate. The pattern only counts when the lower bound clears the baseline.">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">95% CI</p>
                <p className="text-[var(--text-secondary)] font-bold mt-0.5">{ciLow != null ? `${fmtPct(ciLow)}–${ciHigh != null ? fmtPct(ciHigh) : "—"}` : "—"}</p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Sample</p>
                <p className="text-white font-bold mt-0.5">{sig.inSampleSize ?? sig.sampleSize ?? sig.walks?.reduce?.((s: number, w: any) => s + (w.n || 0), 0) ?? "—"}</p>
              </div>
            </div>

            {/* walk-forward */}
            {walks.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                  Walk-forward · {walks.length} windows
                  <span className={`ml-auto font-bold ${(sig.holds ?? 0) >= 3 ? "text-[var(--green)]" : (sig.holds ?? 0) > 0 ? "text-[var(--accent)]" : "text-[var(--red)]"}`}>
                    {(sig.holds ?? 0)} held · avg {fmtPct(sig.oosAvg ?? 0)}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {walks.map((w: any, i: number) => {
                    const cleared = w.rate > baseline;
                    return (
                      <div key={i} className="flex-1" title={`Window ${i + 1}: ${fmtPct(w.rate)} (n=${w.n})`}>
                        <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                          <div className={`h-full rounded-full ${cleared ? "bg-[var(--green)]" : "bg-[var(--text-muted)]/40"}`} style={{ width: `${Math.min(100, Math.max(2, w.rate * 100))}%` }} />
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)] mt-0.5 text-center">{fmtPct(w.rate)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* trigger / progress / verified */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-xs">
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Trigger condition</p>
                <p className="text-white mt-0.5">{sig.triggerText || sig.rule?.family || "—"}</p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Current progress</p>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  {sig.currentProgress ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ProgressDots met={sig.currentProgress.met} needed={sig.currentProgress.needed} />
                      <span>{sig.currentProgress.current}</span>
                    </span>
                  ) : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-black/20 border border-[var(--border)] p-2">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Last verified</p>
                <p className="text-[var(--text-secondary)] mt-0.5 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--text-muted)] inline" />
                  {sig.discoveredAt ? new Date(sig.discoveredAt * 1000).toLocaleString() : "—"}
                  {stale && <span className="text-[var(--red)] text-[10px]">· stale</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button onClick={onBacktest} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
              <FlaskConical className="w-3.5 h-3.5" /> Backtest
            </Button>
            <Button onClick={onDeploy} className="bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/30 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Bot className="w-3.5 h-3.5" /> Deploy Bot
            </Button>
            <button onClick={() => setExpanded(open ? null : id)} className="text-body hover:text-[var(--accent)] flex items-center gap-1 justify-center">
              {open ? "▾" : "▸"} Evidence
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-[var(--border)] aurora-glass p-4">
          <div className="text-micro mb-2">Raw evidence (tick window) · Baseline {fmtPct(baseline)} · tier {meta.label}</div>
          {ev.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="p-2">#</th><th className="p-2">Time</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Digit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {ev.map((t: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 text-[var(--text-muted)]">{i + 1}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                      <td className="p-2 text-right text-white">{Number(t.price).toFixed(getDecimalPlaces(sig.symbol))}</td>
                      <td className="p-2 text-right text-[var(--accent)]">{t.lastDigit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Details available after scan persists the condition window.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState<string>("");
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadConfig, setUploadConfig] = useState("");
  const [scanning, setScanning] = useState(false);

  const createBotMutation = trpc.strategies.save.useMutation();
  const publishedQuery = trpc.strategies.publishedList.useQuery();
  const cloneMutation = trpc.strategies.save.useMutation();
  const watchMutation = trpc.ai.aiScheduledAnalysis.useMutation();
  const scanMutation = trpc.signals.watch.useMutation();

  // Live engine results when a symbol is chosen; persisted list otherwise.
  const hasSymbol = !!symbol;
  const fitQuery = trpc.signals.fit.useQuery(
    { symbol: hasSymbol ? symbol : "", sampleSize: 1000 },
    { enabled: hasSymbol, refetchInterval: 60000, staleTime: 20000 },
  );
  const signalsQuery = trpc.signals.list.useQuery(
    symbol ? { symbol } : {},
    { enabled: !hasSymbol, refetchInterval: 30000, staleTime: 10000 },
  );

  const liveResults = useMemo(() => (Array.isArray(fitQuery.data?.results) ? fitQuery.data!.results : []), [fitQuery.data]);
  const list: any[] = hasSymbol ? liveResults : (Array.isArray(signalsQuery.data) ? signalsQuery.data : []);
  const real = list.filter((s) => !s.tier || s.tier === "strong" || s.tier === "watch");
  const monitors = list.filter((s) => s.tier === "failed" || s.tier === "no_edge");

  const sendToBot = useCallback(async (sig: any) => {
    try {
      const rule = sig.rule || {};
      const strategy = await createBotMutation.mutateAsync({
        name: `${getSymbolDisplayName(sig.symbol)} · ${sig.supportsLabel || sig.title}`,
        description: sig.describe || sig.description || "Created from a 369Labs validated condition.",
        config: { rule: rule, source: "ai_signal", signalId: sig.id ?? null, tier: sig.tier },
      });
      if (strategy?.id != null) void sig.id;
      toast("Bot created — open Bots to configure and start it.", "success");
      setTimeout(() => navigate("/bots"), 600);
    } catch (e) {
      toast("Failed to create bot: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  }, [createBotMutation, navigate]);

  const cloneStrategy = async (s: any) => {
    try {
      await cloneMutation.mutateAsync({ name: s.name + " (cloned)", description: s.description || "Cloned from community marketplace.", config: s.config, published: false });
      toast("Cloned to your strategies.", "success");
    } catch (e) {
      toast("Clone failed: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  const pluginsQuery = trpc.plugins.marketplace.useQuery();
  if (!isAuthenticated) { navigate("/login"); return null; }
  const published = Array.isArray(publishedQuery.data) ? publishedQuery.data : [];
  const pluginList = Array.isArray(pluginsQuery.data) ? pluginsQuery.data : [];
  const isLoading = hasSymbol ? fitQuery.isLoading : signalsQuery.isLoading;

  return (
    <div className="h-full text-white">
      <div className="p-4 md:p-6 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 aurora-glass sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--accent-soft)] rounded-xl flex items-center justify-center border border-[var(--accent-border)]">
            <CandlestickChart className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI <span className="text-[var(--accent)]">Signals</span></h1>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-[var(--accent)]" /> Fixed digit patterns vs their real fair baseline — CI, FDR, walk-forward
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
            <option value="">All symbols</option>
            {getValidSymbols().map((s) => <option key={s} value={s}>{getSymbolDisplayName(s)}</option>)}
          </select>
          <Button onClick={() => navigate("/ai-assistant")} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-4 py-2 rounded-lg flex items-center gap-1">
            <Bot className="w-4 h-4" /> Ask 369AI
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start gap-2.5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-xs text-[var(--text-muted)] leading-relaxed">
          <Shield className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
          <p>
            A signal must (1) beat the <b className="text-[var(--text-secondary)]">correct contract baseline</b> (Matches 10%, Differs 90%, Even/Odd 50%, Over/Under by barrier),
            (2) survive <b className="text-[var(--text-secondary)]">BH-FDR correction</b>, (3) <b className="text-[var(--text-secondary)]">hold across 5 walk-forward windows</b>,
            and (4) map to a specific Deriv digit contract. Tiers: 🟢 Strong / 🟡 Watching / ⚪ No edge / 🔴 Failed / ⏳ Stale.
            This is an analysis tool, not financial advice.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-20">
            <Loader2 className="w-5 h-5 animate-spin" /> {hasSymbol ? "Running engine analysis…" : "Loading market intelligence…"}
          </div>
        ) : real.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto bg-[var(--accent-soft)] rounded-2xl flex items-center justify-center border border-[var(--accent-border)] mb-4">
              <CandlestickChart className="w-8 h-8 text-[var(--accent)]" />
            </div>
            <h3 className="text-lg font-bold text-white">{hasSymbol ? "No condition cleared the bar" : "No signals yet"}</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md mx-auto">
              {hasSymbol
                ? "The engine validated the full fixed pattern library and found no rule that beat its fair baseline with FDR + walk-forward confirmation. Try another symbol or a longer window."
                : "Ask 369AI to watch a market e.g. \"Watch R_50 for 30 minutes\" or let the always-on scanner validate patterns here."}
            </p>
            <Button onClick={async () => {
                const syms = hasSymbol ? [symbol] : getValidSymbols();
                setScanning(true);
                let total = 0;
                for (const s of syms) {
                  try {
                    const res: any = await scanMutation.mutateAsync({ symbol: s, durationMinutes: 60, minWinRate: 55, patternType: "any" });
                    total += res?.signalsFound ?? 0;
                  } catch {}
                }
                watchMutation.mutate({ symbol: hasSymbol ? symbol : "all", interval: "1h" });
                setScanning(false);
                signalsQuery.refetch();
                if (total > 0) toast("Scan complete — " + total + " condition" + (total === 1 ? "" : "s") + " verified.", "success");
                else toast("Scan done — no condition cleared the bar on this run.", "info");
              }} disabled={scanning} className="mt-4 bg-[var(--accent)] hover:brightness-110 text-black text-sm px-4 py-2 rounded-lg">
              {scanning ? "Scanning…" : hasSymbol ? "Re-scan this symbol" : "Start a watch"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {monitors.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center text-[10px] text-[var(--text-brown)]">
                <span className="text-[var(--text-muted)]">Shown: {real.length} clear · Monitored without verified edge: {monitors.length}</span>
              </div>
            )}
            {real.map((sig: any) => (
              <SignalCardRow key={sig.key ?? sig.id} sig={sig} expandedId={expanded} setExpanded={setExpanded} onBacktest={() => navigate("/backtesting?signal=" + (sig.id ?? ""))} onDeploy={() => sendToBot(sig)} />
            ))}
            {monitors.length > 0 && (
              <details className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <summary className="p-3 text-xs text-[var(--text-muted)] cursor-pointer flex items-center gap-2 font-bold">
                  <TimerReset className="w-3.5 h-3.5" /> Monitored patterns with no verified edge ({monitors.length})
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {monitors.map((sig: any) => (
                    <div key={sig.id ?? sig.key} className="flex items-center justify-between text-xs rounded-lg bg-black/20 border border-[var(--border)] px-3 py-2">
                      <span className="text-[var(--text-secondary)]">{sig.supportsLabel || sig.title} · {sig.triggerText || "—"}</span>
                      <span className={`text-micro px-2 py-0.5 rounded border ${TIER_META[sig.tier]?.cls || TIER_META.no_edge.cls}`}>{TIER_META[sig.tier]?.label || sig.tier}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Plugin SDK */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Code className="w-5 h-5 text-[var(--accent)]" /> Plugin SDK
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">Build your own plugins with the 369Labs Plugin SDK.</p>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-[var(--accent)] mt-0.5" />
              <div>
                <p className="text-sm font-bold text-white">Getting Started</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Plugins are JavaScript modules that export a <code className="text-[var(--accent)]">createPlugin</code> function. They receive a context with trade/bot/alert hooks.</p>
              </div>
            </div>
            <div className="bg-[var(--surface-secondary)] rounded-lg p-3">
              <pre className="text-xs font-mono text-[var(--text-secondary)] leading-relaxed">{`export function createPlugin(ctx) {
  // ctx.onTrade, ctx.onTick, ctx.onAlert, ctx.botId, ctx.logger
  ctx.onTrade((trade) => {
    ctx.logger.info("Trade executed:", trade);
  });
  return { name: "My Plugin", version: "1.0.0" };
}`}</pre>
            </div>
          </div>
        </div>

        {/* Plugin Marketplace */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--accent)]" /> Plugin Marketplace
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">Browse available plugins for your trading bots.</p>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            {pluginsQuery.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
            ) : pluginList.length === 0 ? (
              <div className="text-center py-8 px-4">
                <Shield className="w-6 h-6 text-[var(--accent)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No plugins available yet.</p>
              </div>
            ) : (
              pluginList.map((plugin: any) => (
                <div key={plugin.id || plugin.name} className="p-4 border-b border-[var(--border)] last:border-0 hover:bg-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white">{plugin.name}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">v{plugin.version || "1.0.0"}</span>
                    </div>
                    <span className="text-caption px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">{plugin.hook || "general"}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{plugin.description || ""}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Community Strategies */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[var(--accent)]" /> Community Strategies
            </h2>
            <div className="flex gap-2">
              <Button onClick={() => setShowUpload(true)} className="bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Publish Yours
              </Button>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-4">Rate, review, and clone strategies from other traders.</p>
          {publishedQuery.isLoading ? (
            <div className="flex items-center gap-2 text-[var(--text-muted)] py-6"><Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Loading community strategies...</span></div>
          ) : published.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 mx-auto bg-[var(--accent-soft)] rounded-2xl flex items-center justify-center border border-[var(--accent-border)] mb-3">
                <Users className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">No published strategies yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {published.map((s: any) => (
                <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">{s.name}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{s.description || "No description"}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-caption">by user #{s.userId}</span>
                        <span className="flex items-center gap-0.5 text-caption text-[var(--accent)]"><Star className="w-3 h-3 fill-[var(--accent)]" /> 4.5</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button onClick={() => cloneStrategy(s)} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-3 py-1.5 rounded-lg">Clone</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showUpload && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => setShowUpload(false)}>
            <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl animate-modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-[var(--accent)]" /> Publish Strategy</h3>
                <button onClick={() => setShowUpload(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Strategy Name</label>
                  <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" placeholder="My Strategy" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Description</label>
                  <textarea value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white resize-none" rows={3} placeholder="Describe your strategy..." />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Config (JSON)</label>
                  <textarea value={uploadConfig} onChange={(e) => setUploadConfig(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono resize-none" rows={4} placeholder='{"rule":{"conditions":[...],"actions":[...]}}' />
                </div>
                <Button onClick={async () => {
                  if (!uploadName.trim()) { toast("Strategy name required", "error"); return; }
                  let config: any = {};
                  if (uploadConfig.trim()) { try { config = JSON.parse(uploadConfig); } catch { toast("Invalid JSON config", "error"); return; } }
                  try {
                    await cloneMutation.mutateAsync({ name: uploadName, description: uploadDesc || "Published from Marketplace", config, published: true });
                    toast("Strategy published to community!", "success");
                    setShowUpload(false); setUploadName(""); setUploadDesc(""); setUploadConfig("");
                    publishedQuery.refetch();
                  } catch (e: any) { toast(e?.message || "Failed to publish", "error"); }
                }} className="w-full bg-[var(--accent)] text-[var(--bg)] text-xs font-bold py-2 rounded-lg">Submit for Review</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
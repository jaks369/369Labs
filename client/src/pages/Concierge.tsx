import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Radar,
  Target,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  CalendarDays,
  ScanSearch,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Settings2,
  ShieldCheck,
  History,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushTradeIntent } from "@/lib/tradeIntent";
import { getSymbolDisplayName } from "@/lib/symbols";

function badge(level: string) {
  const map: Record<string, string> = {
    critical: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/40",
    warning: "bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/40",
    info: "bg-[var(--accent)]/15 text-[var(--accent-soft)] border-[var(--accent)]/40",
    praise: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/40",
    TRADE: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/40",
    WATCH: "bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/40",
    "NO TRADE": "bg-white/5 text-[var(--text-muted)] border-[var(--border)]",
  };
  return map[level] || "bg-[var(--accent)]/15 text-[var(--accent-soft)] border-[var(--accent)]/40";
}

function strengthColor(s: string) {
  if (s === "STRONG") return { text: "text-[var(--green)]", chip: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/40" };
  if (s === "MEDIUM") return { text: "text-[var(--amber)]", chip: "bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/40" };
  return { text: "text-[var(--text-muted)]", chip: "bg-white/5 text-[var(--text-muted)] border-[var(--border)]" };
}

function Card({ title, icon, children }: { title: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">{icon}{title}</h2>
      {children}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-3">
      <p className="text-[11px] text-[var(--text-muted)] mb-1 capitalize">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}

export default function Concierge() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [ctxSymbol, setCtxSymbol] = useState("R_100");
  const [symbolsInput, setSymbolsInput] = useState("");
  const [symbolsDirty, setSymbolsDirty] = useState(false);

  const briefing = trpc.concierge.briefing.useQuery(undefined, { enabled: isAuthenticated });
  const coach = trpc.concierge.sessionCoach.useQuery(undefined, { enabled: isAuthenticated });
  const alerts = trpc.concierge.smartAlerts.useQuery(undefined, { enabled: isAuthenticated });
  const calendar = trpc.concierge.calendar.useQuery(undefined, { enabled: isAuthenticated });
  const candidates = trpc.concierge.liveCandidates.useQuery(undefined, { enabled: isAuthenticated });
  const history = trpc.concierge.history.useQuery({ limit: 30 }, { enabled: isAuthenticated });
  const accuracy = trpc.concierge.accuracy.useQuery(undefined, { enabled: isAuthenticated });
  const settingsQ = trpc.concierge.getSettings.useQuery(undefined, { enabled: isAuthenticated });
  const marketContext = trpc.concierge.marketContext.useQuery({ symbol: ctxSymbol }, { enabled: isAuthenticated });

  const scanNow = trpc.concierge.scanNow.useMutation();
  const settle = trpc.concierge.settle.useMutation();
  const patchSettings = trpc.concierge.patchSettings.useMutation();

  const refresh = () => {
    briefing.refetch();
    coach.refetch();
    alerts.refetch();
    candidates.refetch();
    history.refetch();
    accuracy.refetch();
  };

  if (!isAuthenticated) { navigate("/login"); return null; }

  const settings = settingsQ.data;
  const acc = accuracy.data;
  const brief = briefing.data;

  return (
    <div className="h-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Radar className="w-7 h-7 text-[var(--accent)]" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Signals &amp; Concierge</h1>
            <p className="text-xs text-[var(--text-muted)]">Active, guiding layer — deterministic scans, honest outcome tracking, live coaching</p>
          </div>
          <Button onClick={() => { scanNow.mutate(undefined, { onSuccess: refresh }); }} className="btn btn-outline gap-2" size="sm">
            <ScanSearch className="w-4 h-4" />{scanNow.isPending ? "Scanning…" : "Scan now"}
          </Button>
          <Button onClick={() => { settle.mutate(undefined, { onSuccess: refresh }); }} className="btn btn-outline gap-2" size="sm">
            <RefreshCw className="w-4 h-4" />{settle.isPending ? "Settling…" : "Settle outcomes"}
          </Button>
        </div>

        {brief && !briefing.isLoading && (
          <div className={`rounded-xl border p-5 ${brief.verdict === "TRADE" ? "border-[var(--green)]/30 bg-[var(--green)]/5" : brief.verdict === "WATCH" ? "border-[var(--amber)]/30 bg-[var(--amber)]/5" : "border-[var(--border)] bg-[var(--card)]"}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded border text-xs font-bold ${badge(brief.verdict)}`}>{brief.verdict}</span>
              <h2 className="text-lg font-bold text-white">{brief.headline}</h2>
              <span className="text-xs text-[var(--text-muted)]">generated {new Date(brief.generatedAt).toLocaleTimeString()}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-3">{brief.summary}</p>
            {brief.nextMove && (
              <>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Metric label="Symbol" value={brief.nextMove.symbolLabel} />
                  <Metric label="Direction" value={brief.nextMove.signal.direction === "up" ? "Rise" : "Fall"} accent={brief.nextMove.signal.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"} />
                  <Metric label="Confidence" value={`${brief.nextMove.signal.confidence}%`} />
                  <Metric label="Suggested stake" value={`$${brief.nextMove.suggestedStake}`} accent="text-[var(--accent-soft)]" />
                  <Metric label="Max stake" value={`$${brief.nextMove.maxStake}`} />
                </div>
                <button
                  onClick={() => {
                    const sig = brief.nextMove!.signal;
                    pushTradeIntent({
                      symbol: sig.symbol,
                      contract: { category: "rise_fall", direction: sig.direction === "up" ? "rise" : "fall" },
                      stake: brief.nextMove!.suggestedStake,
                      duration: 5,
                      durationUnit: "t",
                      label: `Concierge ${sig.strength} ${sig.confidence}%`,
                    });
                    navigate("/dashboard");
                  }}
                  className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-soft)] text-xs font-bold hover:bg-[var(--accent)]/20 transition-colors"
                >
                  Trade this → <span className="text-[10px] font-medium opacity-70">prefills the terminal · you confirm</span>
                </button>
              </>
            )}
            <p className="text-[11px] text-[var(--text-disabled)] mt-3">{brief.disclaimer}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Session coach */}
          <Card title="Session coach" icon={<ShieldCheck className="w-4 h-4 text-[var(--accent)]" />}>
            {coach.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Wins" value={coach.data?.wins ?? 0} accent="text-[var(--green)]" />
                  <Metric label="Losses" value={coach.data?.losses ?? 0} accent="text-[var(--red)]" />
                  <Metric label="Accuracy" value={`${coach.data?.sessionAccuracy ?? 0}%`} />
                  <Metric label="Exposure" value={`$${coach.data?.totalExposure ?? 0}`} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">Duration {coach.data?.sessionDuration} · Streak: {coach.data?.streakCount ? `${coach.data.streakCount} ${coach.data.currentStreak}` : "none"}</p>
                <ul className="space-y-2">
                  {(coach.data?.coachingMessages || []).map((m: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                      {m.level === "critical" ? <AlertCircle className="w-3.5 h-3.5 text-[var(--red)] shrink-0 mt-0.5" /> : m.level === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-[var(--amber)] shrink-0 mt-0.5" /> : m.level === "praise" ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0 mt-0.5" /> : <Info className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />}
                      <span>{typeof m === "string" ? m : m.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Smart alerts */}
          <Card title="Smart alerts" icon={<AlertCircle className="w-4 h-4 text-[var(--amber)]" />}>
            {alerts.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <ul className="space-y-2">
                {(alerts.data || []).map((a: any, i: number) => (
                  <li key={i} className={`flex items-start gap-2 text-xs rounded-lg border p-2.5 ${a.severity === "critical" ? "border-[var(--red)]/30 bg-[var(--red)]/5 text-[var(--red)]" : a.severity === "warning" ? "border-[var(--amber)]/30 bg-[var(--amber)]/5 text-[var(--amber)]" : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"}`}>
                    {a.severity === "critical" ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : a.severity === "warning" ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Economic calendar */}
          <Card title="Economic calendar" icon={<CalendarDays className="w-4 h-4 text-[var(--accent)]" />}>
            {calendar.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <ul className="space-y-2">
                {(calendar.data || []).map((c: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${c.impact === "high" ? "bg-[var(--red)]" : "bg-[var(--amber)]"}`} />
                    <span><span className="font-semibold text-white">{c.name}</span> · {c.date} · {c.impact} impact</span>
                  </li>
                ))}
                {(calendar.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">Nothing scheduled in the next few days.</p>}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market context */}
          <Card title="Market context" icon={<BarChart3 className="w-4 h-4 text-[var(--accent)]" />}>
            <div className="flex gap-2 mb-4">
              <input
                value={ctxSymbol}
                onChange={(e) => setCtxSymbol(e.target.value.toUpperCase())}
                className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white flex-1"
                placeholder="Symbol e.g. R_100"
              />
              <Button onClick={() => marketContext.refetch()} className="btn btn-outline gap-2" size="sm"><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>
            </div>
            {marketContext.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : marketContext.data && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">{marketContext.data.displayName}</h3>
                <p className="text-xs text-[var(--text-secondary)]">{marketContext.data.headline}</p>
                <ul className="space-y-1.5">
                  {(marketContext.data.priceContext || []).map((p: string, i: number) => (
                    <li key={i} className="text-xs text-[var(--text-muted)] flex gap-2"><span className="text-[var(--accent)]">•</span>{p}</li>
                  ))}
                </ul>
                <div className="border-t border-[var(--border)] pt-3">
                  <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Why money might move</p>
                  <ul className="space-y-1">
                    {(marketContext.data.calendar || []).map((c: string, i: number) => (
                      <li key={i} className="text-[11px] text-[var(--text-muted)]">• {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>

          {/* Live candidates rail */}
          <Card title="Live candidate scan" icon={<ScanSearch className="w-4 h-4 text-[var(--accent)]" />}>
            {candidates.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="space-y-2">
                {(candidates.data || []).slice(0, 12).map((c: any) => {
                  const sc = strengthColor(c.strength);
                  return (
                    <div key={`${c.symbol}-${c.direction}`} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${c.direction === "up" ? "bg-[var(--green)]/15 text-[var(--green)]" : "bg-[var(--red)]/15 text-[var(--red)]"}`}>
                        {c.direction === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{getSymbolDisplayName(c.symbol)}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${sc.chip}`}>{c.strength}</span>
                          <span className="text-xs text-[var(--text-muted)]">{c.confidence}% · {c.contractType}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">{(c.reasons || []).slice(0, 2).join(" · ")}</p>
                      </div>
                    </div>
                  );
                })}
                {(candidates.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">No tradeable confluence right now — doing nothing is the result.</p>}
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Accuracy */}
          <Card title="Signal outcome ledger" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {accuracy.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : acc && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Total" value={acc.total} />
                  <Metric label="Wins" value={acc.wins} accent="text-[var(--green)]" />
                  <Metric label="Win rate" value={`${acc.winRatePct}%`} />
                </div>
                <div className="space-y-2">
                  {Object.entries(acc.byStrength || {}).map(([strength, s]: any) => (
                    <div key={strength} className="flex items-center justify-between text-xs">
                      <span className={`font-bold ${strengthColor(strength).text}`}>{strength}</span>
                      <span className="text-[var(--text-muted)]">{s.total} signals · {s.winRatePct}% win rate</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* History */}
          <Card title="Signal history" icon={<History className="w-4 h-4 text-[var(--accent)]" />}>
            {history.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="pb-2 pr-2 font-medium">Symbol</th>
                      <th className="pb-2 pr-2 font-medium">Dir</th>
                      <th className="pb-2 pr-2 font-medium">Conf</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history.data || []).map((s: any) => (
                      <tr key={s.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-2 text-white font-medium">{getSymbolDisplayName(s.symbol)}</td>
                        <td className="py-2 pr-2 text-[var(--text-secondary)]">{s.direction === "up" ? "Rise" : "Fall"}</td>
                        <td className="py-2 pr-2 text-[var(--text-muted)]">{s.confidence}%</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${s.status === "win" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : s.status === "loss" ? "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15" : s.status === "open" ? "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/15" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(history.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)] py-4">No guiding signals yet — scan now to seed the ledger.</p>}
              </div>
            )}
          </Card>

          {/* Settings */}
          <Card title="Concierge settings" icon={<Settings2 className="w-4 h-4 text-[var(--accent)]" />}>
            {settings && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => patchSettings.mutate({ enabled: !settings.enabled }, { onSuccess: refresh })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${settings.enabled ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/10" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}
                  >
                    {settings.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => patchSettings.mutate({ telegramBriefings: !settings.telegramBriefings }, { onSuccess: refresh })}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${settings.telegramBriefings ? "text-[var(--accent-soft)] border-[var(--accent)]/40 bg-[var(--accent)]/10" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}
                  >
                    Telegram briefings {settings.telegramBriefings ? "on" : "off"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-[var(--text-muted)]">Max signals/day</span>
                    <input type="number" min={1} max={50} value={settings.maxPerDay} onChange={(e) => patchSettings.mutate({ maxPerDay: Number(e.target.value) }, { onSuccess: refresh })} className="mt-1 w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-[var(--text-muted)]">Stake %</span>
                    <input type="number" min={0.1} max={25} value={settings.stakePct} onChange={(e) => patchSettings.mutate({ stakePct: Number(e.target.value) }, { onSuccess: refresh })} className="mt-1 w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[11px] text-[var(--text-muted)]">Followed symbols (comma separated)</span>
                  <input
                    value={symbolsDirty ? symbolsInput : (settings.symbols?.join(", ") ?? "")}
                    onChange={(e) => { setSymbolsDirty(true); setSymbolsInput(e.target.value); }}
                    onBlur={() => {
                      const symbols = (symbolsDirty ? symbolsInput : settings.symbols?.join(", ") ?? "")
                        .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
                      if (symbols.length) {
                        patchSettings.mutate({ symbols });
                        setSymbolsDirty(false);
                        setSymbolsInput("");
                      }
                    }}
                    className="mt-1 w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white"
                    placeholder="R_100, 1HZ10V, BOOM500"
                  />
                </label>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
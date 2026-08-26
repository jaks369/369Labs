import { useEffect, useState } from "react";
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
  Zap,
  Plus,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/Toast";
import { pushTradeIntent } from "@/lib/tradeIntent";
import { getSymbolDisplayName, normalizeSymbol, filterValidSymbols } from "@/lib/symbols";
import { derivWS } from "@/services/derivWebSocket";

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

// Interpret the confluence honestly: it's how many indicators voted the same
// way (e.g. 3/3 → agreement 1.0 → 50 + 28 = 78), NOT a win probability.
function agreementText(votes: any): string {
  if (!votes || !votes.total) return "";
  const agree = Math.max(votes.up, votes.down);
  return `${agree}/${votes.total} indicators agree`;
}

// Persisted signals store the tally as the first reason ("2/2 indicators agree").
function rowAgreement(s: any): string {
  const first = s?.reasons?.[0];
  if (typeof first === "string" && /^\d+\/\d+ indicators agree$/.test(first)) return first;
  return "—";
}

// The four questions every signal must answer, in plain language. This is the
// top layer; the raw reasons/indicators live behind the "Technical details" toggle.
function PlainBlock({ plain, fallback }: { plain?: any; fallback?: string }) {
  const what = plain?.what;
  const why = plain?.why;
  const strength = plain?.strength;
  const risk = plain?.risk;
  if (!what || !why || !strength || !risk) {
    return <p className="text-sm text-[var(--text-secondary)]">{fallback}</p>;
  }
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-[var(--text-secondary)]"><span className="font-bold text-white">What's happening: </span>{what}</p>
      <p className="text-[var(--text-secondary)]"><span className="font-bold text-white">Why the AI thinks that: </span>{why}</p>
      <p className="text-[var(--text-secondary)]"><span className="font-bold text-white">How strong is the evidence: </span>{strength}</p>
      <p className="text-[var(--text-secondary)]"><span className="font-bold text-white">What's the risk: </span>{risk}</p>
    </div>
  );
}

function verdictChip(v: string) {
  if (v === "up") return "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15";
  if (v === "down") return "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15";
  return "text-[var(--text-muted)] border-[var(--border)] bg-white/5";
}

// Expandable "Technical details ▾" layer — keeps trader-facing reads out of the
// top-of-the-fold summary without hiding them.
function DetailDisclosure({ details }: { details?: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-bold text-[var(--accent-soft)] hover:underline"
      >
        {open ? "Technical details ▴" : "Technical details ▾"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          {(details || []).map((d: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-[var(--text-secondary)]">{d.name}</span>
              <span className="flex items-center gap-2 text-right">
                <span className="text-[var(--text-muted)]">{d.value}</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${verdictChip(d.verdict)}`}>{d.verdict}</span>
              </span>
            </div>
          ))}
          {(details || []).length === 0 && <p className="text-[11px] text-[var(--text-muted)]">No indicator details available for this read.</p>}
        </div>
      )}
    </div>
  );
}

// Signal-history P&L is the would-have result of the recorded recommended
// stake under the repo's documented CALL/PUT model (win = +stake × payout,
// loss = −stake, flat-tick refund = $0) — never an executed-trade figure.
function formatPnl(pnl: number | null | undefined): string {
  if (pnl === null || pnl === undefined) return "";
  return pnl > 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
}

function resultLabel(s: any): string {
  if (s.status === "win") return `Win ${formatPnl(s.pnl)}`;
  if (s.status === "loss") return `Loss ${formatPnl(s.pnl)}`;
  if (s.status === "expired") return `Refund $0.00`;
  return "Open";
}

export default function Concierge() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [ctxSymbol, setCtxSymbol] = useState("R_100");
  const [ctxSymbolFocused, setCtxSymbolFocused] = useState(false);
  const [followInput, setFollowInput] = useState("");
  const [followNote, setFollowNote] = useState("");
  const [draftMaxPerDay, setDraftMaxPerDay] = useState("10");
  const [draftStake, setDraftStake] = useState("1");
  const [draftStopLoss, setDraftStopLoss] = useState("0");
  const [draftTakeProfit, setDraftTakeProfit] = useState("0");
  const [draftMaxDailyLoss, setDraftMaxDailyLoss] = useState("0");
  const [saveNote, setSaveNote] = useState("");
  const [savingNumeric, setSavingNumeric] = useState(false);
  const [sizingMethod, setSizingMethod] = useState<'kelly' | 'fixed' | 'vol_adjusted'>('fixed');
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : b.accounts || [b];
      const acct = list[0];
      setBalance(parseFloat(acct?.balance != null ? acct.balance : acct?.display_balance || "0") || 0);
    });
    if (derivWS.isAuthorized()) derivWS.fetchBalance();
    return unsub;
  }, []);

  const briefing = trpc.concierge.briefing.useQuery(undefined, { enabled: isAuthenticated });
  const coach = trpc.concierge.sessionCoach.useQuery(undefined, { enabled: isAuthenticated });
  const alerts = trpc.concierge.smartAlerts.useQuery(undefined, { enabled: isAuthenticated });
  const calendar = trpc.concierge.calendar.useQuery(undefined, { enabled: isAuthenticated });
  const candidates = trpc.concierge.liveCandidates.useQuery(undefined, { enabled: isAuthenticated });
  const history = trpc.concierge.history.useQuery({ limit: 30 }, { enabled: isAuthenticated });
  const accuracy = trpc.concierge.accuracy.useQuery(undefined, { enabled: isAuthenticated });
  const calibration = trpc.concierge.calibration.useQuery(undefined, { enabled: isAuthenticated });
  const tradeReviews = trpc.concierge.tradeReviews.useQuery({ limit: 20 }, { enabled: isAuthenticated });
  const settingsQ = trpc.concierge.getSettings.useQuery(undefined, { enabled: isAuthenticated });
  const loopStatus = trpc.concierge.loopStatus.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });
  const marketContext = trpc.concierge.marketContext.useQuery({ symbol: ctxSymbol }, { enabled: isAuthenticated });
  // Behavioral tilt check — refreshed periodically so the warning is current
  // at the moment the trader is about to act, not a stale once-per-session read.
  const tilt = trpc.tilt.check.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000 });
  // Backs the "Kelly Criterion" sizing option with real math from the ledger.
  const kellySuggestion = trpc.kelly.fromLedger.useQuery(undefined, { enabled: isAuthenticated && sizingMethod === "kelly" });

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

  useEffect(() => {
    if (!settingsQ.data) return;
    setDraftMaxPerDay(settingsQ.data.maxPerDay.toString());
    setDraftStake(settingsQ.data.stake.toString());
    setDraftStopLoss(settingsQ.data.stopLoss.toString());
    setDraftTakeProfit(settingsQ.data.takeProfit.toString());
    setDraftMaxDailyLoss((settingsQ.data.maxDailyLoss || 0).toString());
  }, [settingsQ.data]);

  const syncSymbol = (sym: string) => {
    if (ctxSymbol !== sym) {
      setCtxSymbol(sym);
      setTimeout(() => marketContext.refetch(), 0);
    }
  };

  // Add one or more followed symbols (comma/space separated friendly names or
  // codes). Unknown tokens are skipped and reported; valid ones are saved as
  // chips and become the pool the concierge scans.
  const addFollowSymbol = () => {
    const raw = followInput;
    if (!raw.trim()) return;
    const tokens = raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    const normalized = tokens.map(normalizeSymbol).filter(Boolean);
    const valid = Array.from(new Set(filterValidSymbols(normalized))).slice(0, 12);
    if (valid.length === 0) {
      setFollowNote(`No recognised symbols. Try names like "Volatility 100 Index" or codes like R_100, 1HZ10V, BOOM500.`);
      return;
    }
    const dropped = tokens.length - valid.length;
    const next = Array.from(new Set([...(settings?.symbols ?? []), ...valid])).slice(0, 12);
    patchSettings.mutate(
      { symbols: next },
      {
        onSuccess: () => {
          setFollowInput("");
          setFollowNote(dropped > 0 ? `Added ${valid.length} — ${dropped} unrecognised skipped.` : `Added ${valid.map(getSymbolDisplayName).join(", ")}.`);
          refresh();
          settingsQ.refetch();
          syncSymbol(next[0]);
        },
        onError: (e: any) => setFollowNote(e?.message || "Failed to save symbols"),
      },
    );
  };

  // Remove a followed symbol from the chips row and persist the remainder.
  const removeFollowSymbol = (sym: string) => {
    const current = settings?.symbols ?? [];
    const rest = current.filter((s) => s !== sym);
    patchSettings.mutate(
      { symbols: rest },
      {
        onSuccess: () => {
          refresh();
          settingsQ.refetch();
          if (ctxSymbol === sym && rest[0]) syncSymbol(rest[0]);
        },
        onError: (e: any) => setFollowNote(e?.message || "Failed to remove symbol"),
      },
    );
  };

  const saveNumeric = () => {
    setSavingNumeric(true);
    const maxPerDay = Math.max(1, Math.min(50, parseInt(draftMaxPerDay) || 10));
    const stake = Math.max(0.35, parseFloat(draftStake) || 0.35);
    const stopLoss = Math.max(0, parseFloat(draftStopLoss) || 0);
    const takeProfit = Math.max(0, parseFloat(draftTakeProfit) || 0);
    const maxDailyLoss = Math.max(0, parseFloat(draftMaxDailyLoss) || 0);

    patchSettings.mutate(
      { maxPerDay, stake, stopLoss, takeProfit, maxDailyLoss, sizingMethod },
      {
        onSuccess: (saved) => {
          setSaveNote("Settings saved.");
          setTimeout(() => setSaveNote(""), 3000);
          refresh();
          settingsQ.refetch();
          setDraftMaxPerDay(saved.maxPerDay.toString());
          setDraftStake(saved.stake.toString());
          setDraftStopLoss(saved.stopLoss.toString());
          setDraftTakeProfit(saved.takeProfit.toString());
          setDraftMaxDailyLoss((saved.maxDailyLoss || 0).toString());
        },
        onError: (e: any) => setSaveNote(e?.message || "Failed to save settings"),
        onSettled: () => setSavingNumeric(false),
      },
    );
  };

  const toggleEnabled = (next: boolean) => {
    patchSettings.mutate(
      { enabled: next },
      {
        onSuccess: (saved) => {
          toast(saved.enabled ? "Signal scan ON — scanning your followed symbols." : "Signal scan OFF — stopped.", saved.enabled ? "success" : "info");
          refresh();
          settingsQ.refetch();
        },
        onError: (e: any) => toast(e?.message || "Failed to update settings", "error"),
      },
    );
  };

  const tradeThis = (c: any) => {
    const stake = settings?.stake || 1;
    pushTradeIntent({
      symbol: c.symbol,
      contract: { category: "rise_fall", direction: c.direction === "up" ? "rise" : "fall" },
      stake,
      duration: 5,
      durationUnit: "t",
      label: `Concierge ${c.strength} ${agreementText(c.votes) || "no agreement yet"}`,
      ...(settings?.stopLoss ? { stopLoss: settings.stopLoss } : {}),
      ...(settings?.takeProfit ? { takeProfit: settings.takeProfit } : {}),
    });
    toast(`Prefilled the terminal with ${getSymbolDisplayName(c.symbol)} at $${stake}`, "success");
    navigate("/dashboard");
  };

  if (!isAuthenticated) { navigate("/login"); return null; }

  const settings = settingsQ.data;
  const acc = accuracy.data;
  const brief = briefing.data;
  const nm = brief?.nextMove ?? null;
  const sig = nm?.signal;

  return (
    <div className="h-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Radar className="w-7 h-7 text-[var(--accent)]" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Signals &amp; Concierge</h1>
            <p className="text-xs text-[var(--text-muted)]">Plain-language reads on what the market is doing and why — agreement scores, risk-based stakes, honest outcome tracking</p>
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
            {nm && sig ? (
              <div className="mt-3 space-y-4">
                <PlainBlock plain={sig.plain} fallback={brief.summary} />
                <DetailDisclosure details={sig.details} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Metric label="Symbol" value={nm.symbolLabel} />
                  <Metric label="Direction" value={sig.direction === "up" ? "Rise" : "Fall"} accent={sig.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"} />
                  <Metric label="Agreement" value={agreementText(sig.votes) || "—"} />
                </div>
                {acc && acc.total > 0 && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[11px] text-[var(--text-secondary)]">
                    Current signal: <span className="text-white font-semibold">{agreementText(sig.votes) || "no computable indicators yet"}</span> — that's how many indicators agree, not your chance of winning. Your guided-signal history: <span className="text-white font-semibold">{acc.winRatePct}% win rate</span> over {acc.total} resolved signals. Judge performance by the history, not the score.
                  </div>
                )}
                <button
                  onClick={() => tradeThis(sig)}
                  className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-soft)] text-xs font-bold hover:bg-[var(--accent)]/20 transition-colors"
                >
                  Trade this → <span className="text-[10px] font-medium opacity-70">prefills terminal with your configured ${settings?.stake || "1.00"} stake · you approve</span>
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)] mt-3">{brief.summary}</p>
            )}
            <p className="text-[11px] text-[var(--text-disabled)] mt-3">{brief.disclaimer}</p>
          </div>
        )}

        {/* Tilt warning — surfaced BEFORE the next trade, not after the damage. */}
        {tilt.data?.severity === "warning" && (
          <div className="rounded-xl border border-[var(--red)]/50 bg-[var(--red)]/10 p-4 space-y-1">
            <p className="text-sm font-bold text-[var(--red)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Tilt pattern detected
            </p>
            {tilt.data.messages.map((m: string, i: number) => (
              <p key={i} className="text-xs text-[var(--text-secondary)]">{m}</p>
            ))}
            <p className="text-[10px] text-[var(--text-disabled)]">Advisory only — nothing is blocked. Based on your last {tilt.data.evidence.tradesAnalyzed} settled trades.</p>
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
                  <Metric label="Win rate" value={`${coach.data?.sessionAccuracy ?? 0}%`} />
                  <Metric label="Exposure" value={`$${coach.data?.totalExposure ?? 0}`} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">Duration {coach.data?.sessionDuration} · Streak: {coach.data?.streakCount ? `${coach.data.streakCount} ${coach.data.currentStreak}` : "none"}</p>
                <p className="text-[10px] text-[var(--text-disabled)]">The coach interprets these numbers — losing more than you win, streaks, and oversized stakes all trigger plain-language advice below.</p>
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
            <div className="flex gap-2 mb-1">
              <input
                value={ctxSymbolFocused ? ctxSymbol : getSymbolDisplayName(ctxSymbol) || ctxSymbol}
                onChange={(e) => setCtxSymbol(e.target.value.toUpperCase())}
                onFocus={() => setCtxSymbolFocused(true)}
                onBlur={() => setCtxSymbolFocused(false)}
                className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white flex-1"
                placeholder="e.g. Volatility 100 Index or R_100"
              />
              <Button onClick={() => marketContext.refetch()} className="btn btn-outline gap-2" size="sm"><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-medium mb-3">{getSymbolDisplayName(ctxSymbol)}</p>
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
                  // Expected value using historical win rate for this strength
                  const histWinRate = acc?.byStrength?.[c.strength]?.winRatePct ?? acc?.winRatePct ?? 50;
                  const ev = (histWinRate / 100) * 0.95 - (1 - histWinRate / 100);
                  const evColor = ev > 0 ? "text-[var(--green)]" : ev < 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]";
                  return (
                    <div key={`${c.symbol}-${c.direction}`} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${c.direction === "up" ? "bg-[var(--green)]/15 text-[var(--green)]" : "bg-[var(--red)]/15 text-[var(--red)]"}`}>
                        {c.direction === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{getSymbolDisplayName(c.symbol)}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${sc.chip}`}>{c.strength}</span>
                          <span className="text-xs text-[var(--text-muted)]">{agreementText(c.votes) || c.contractType}</span>
                          <span className={`text-[10px] font-bold ${evColor}`}>EV: ${ev > 0 ? "+" : ""}${(ev * (settings?.stake || 1)).toFixed(2)} (${(ev * 100).toFixed(1)}%)</span>
                        </div>
                        {c.plain?.what && <p className="text-[11px] text-[var(--text-secondary)] mt-1">{c.plain.what}</p>}
                        <div className="mt-1"><DetailDisclosure details={c.details} /></div>
                        {c.regime && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            Regime: <span className={c.regime.aligned ? "text-[var(--green)]" : "text-[var(--red)]"}>{c.regime.regime}</span> ({c.regime.reason})
                          </p>
                        )}
                        <button
                          onClick={() => tradeThis(c)}
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-soft)] text-[11px] font-bold hover:bg-[var(--accent)]/20 transition-colors"
                        >
                          Trade this → <span className="text-[10px] font-medium opacity-70">prefills terminal · you confirm</span>
                        </button>
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
          <Card title="Guided-signal performance" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {accuracy.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : acc && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Resolved signals" value={acc.total} />
                  <Metric label="Wins" value={acc.wins} accent="text-[var(--green)]" />
                  <Metric label="Historical win rate" value={`${acc.winRatePct}%`} />
                </div>
                <div className="space-y-2">
                  {Object.entries(acc.byStrength || {}).map(([strength, s]: any) => (
                    <div key={strength} className="flex items-center justify-between text-xs">
                      <span className={`font-bold ${strengthColor(strength).text}`}>{strength}</span>
                      <span className="text-[var(--text-muted)]">{s.total} signals · {s.winRatePct}% win rate</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-disabled)] leading-relaxed">
                  Every signal's score is an agreement read (how many indicators pointed the same way), not a predicted win rate. The only performance measure here is the historical win rate above.
                </p>
              </div>
            )}
          </Card>

          {/* Calibration */}
          <Card title="Signal calibration" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {calibration.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : calibration.data && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Resolved" value={calibration.data.resolvedPredictions} />
                  <Metric label="Brier score" value={calibration.data.brierScore.toFixed(4)} accent={calibration.data.brierScore < 0.25 ? "text-[var(--green)]" : "text-[var(--red)]"} />
                  <Metric label="ECE" value={calibration.data.expectedCalibrationError.toFixed(4)} accent={calibration.data.expectedCalibrationError < 0.05 ? "text-[var(--green)]" : "text-[var(--red)]"} />
                </div>
                <div className="space-y-2">
                  {calibration.data.reliabilityDiagram.map((bin: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">{bin.bin}</span>
                      <span className="text-[var(--text-muted)]">Pred: {(bin.predictedProbability * 100).toFixed(1)}% · Actual: {(bin.actualFrequency * 100).toFixed(1)}% · N={bin.count}</span>
                      <span className={bin.isWellCalibrated ? "text-[var(--green)] text-[10px] font-bold" : "text-[var(--red)] text-[10px] font-bold"}>
                        {bin.isWellCalibrated ? "✓ Calibrated" : "✗ Off"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-disabled)] leading-relaxed">
                  Brier score: lower is better (0 = perfect). ECE (Expected Calibration Error): {"<"}5% is well-calibrated. Each bin shows predicted vs actual frequency — should sit on the diagonal.
                </p>
              </div>
            )}
          </Card>

{/* History */}
          <Card title="Prediction history" icon={<History className="w-4 h-4 text-[var(--accent)]" />}>
            {history.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="pb-2 pr-2 font-medium">Symbol</th>
                      <th className="pb-2 pr-2 font-medium">Direction</th>
                      <th className="pb-2 pr-2 font-medium">Agreement</th>
                      <th className="pb-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history.data || []).map((s: any) => (
                      <tr key={s.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-2 text-white font-medium">{getSymbolDisplayName(s.symbol)}</td>
                        <td className="py-2 pr-2 text-[var(--text-secondary)]">{s.direction === "up" ? "Rise" : "Fall"}</td>
                        <td className="py-2 pr-2 text-[var(--text-muted)]">{rowAgreement(s)}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${s.status === "win" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : s.status === "loss" ? "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15" : s.status === "open" ? "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/15" : s.status === "expired" ? "text-[var(--text-muted)] border-[var(--border)] bg-white/5" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>
                            {s.status === "win" ? "Win" : s.status === "loss" ? "Loss" : s.status === "expired" ? "Refund" : "Open"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(history.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)] py-4">No predictions yet — scan now to seed the ledger.</p>}
{(history.data || []).length > 0 && (
                  <p className="text-[10px] text-[var(--text-disabled)] mt-3 leading-relaxed">
                    Predictions are guiding reads, not executed trades. Stake & P&L belong in Auto-execute history when enabled.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Trade Reviews */}
          <Card title="Trade reviews" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {tradeReviews.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="max-h-80 overflow-y-auto">
                {(tradeReviews.data || []).length > 0 ? (
                  <div className="space-y-3">
                    {(tradeReviews.data || []).map((tr: any) => (
                      <div key={tr.tradeId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{getSymbolDisplayName(tr.symbol)}</span>
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tr.result === "win" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15"}`}>
                              {tr.result === "win" ? "WIN" : "LOSS"}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">{tr.contractType}</span>
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-bold ${parseFloat(tr.profitLoss || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                              {parseFloat(tr.profitLoss || "0") >= 0 ? "+" : ""}${parseFloat(tr.profitLoss || "0").toFixed(2)}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] ml-2">Stake: $${parseFloat(tr.stake || "0").toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <span className="text-[var(--text-muted)]">Why taken:</span>
                            <p className="text-[var(--text-secondary)] mt-0.5 line-clamp-2">{tr.review?.whyTradeWasTaken || "—"}</p>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Market:</span>
                            <p className="text-[var(--text-secondary)] mt-0.5 line-clamp-2">{tr.review?.marketConditions || "—"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px] mt-2 pt-2 border-t border-[var(--border)]">
                          <div>
                            <span className="text-[var(--green)] font-semibold">What went right:</span>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                              {(tr.review?.whatWentRight || []).slice(0, 2).map((w: string, i: number) => (
                                <li key={i} className="text-[var(--text-secondary)]">{w}</li>
                              ))}
                              {(tr.review?.whatWentRight || []).length === 0 && <li className="text-[var(--text-muted)]">—</li>}
                            </ul>
                          </div>
                          <div>
                            <span className="text-[var(--red)] font-semibold">What went wrong:</span>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                              {(tr.review?.whatWentWrong || []).slice(0, 2).map((w: string, i: number) => (
                                <li key={i} className="text-[var(--text-secondary)]">{w}</li>
                              ))}
                              {(tr.review?.whatWentWrong || []).length === 0 && <li className="text-[var(--text-muted)]">—</li>}
                            </ul>
                          </div>
                        </div>
                        <div className="text-[10px] text-[var(--text-disabled)] mt-2 pt-2 border-t border-[var(--border)]">
                          <span className="font-semibold">Risk:</span> {tr.review?.riskAssessment || "—"} | 
                          <span className="font-semibold ml-2">Score:</span> {tr.review?.score || "—"}/100
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] py-4">No settled trades with reviews yet.</p>
                )}
              </div>
            )}
          </Card>

          {/* Settings */}
          <Card title="Concierge settings" icon={<Settings2 className="w-4 h-4 text-[var(--accent)]" />}>
            {settings && (
              <div className="space-y-4">
                {/* Signal scan toggle */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleEnabled(!settings.enabled)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${settings.enabled ? "bg-[var(--green)]" : "bg-[var(--surface-elevated)] border border-[var(--border)]"}`}
                      title={settings.enabled ? "Tap to turn off" : "Tap to turn on"}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.enabled ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                    <div>
                      <p className="text-sm font-bold text-white">Signal scan is {settings.enabled ? "ON" : "OFF"}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{settings.enabled ? "Scans your followed symbols and records STRONG reads every few minutes." : "Turned off — nothing is scanned or recorded."}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded border text-[10px] font-bold ${settings.enabled && loopStatus.data?.enabled ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>
                    {settings.enabled && loopStatus.data?.enabled ? "LOOP ACTIVE" : settings.enabled ? "LOOP SCHEDULED" : "IDLE"}
                  </span>
                </div>

                {/* Telegram toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Telegram briefings</p>
                    <p className="text-[11px] text-[var(--text-muted)]">Forward STRONG signals to your Telegram</p>
                  </div>
                  <button
                    onClick={() => patchSettings.mutate({ telegramBriefings: !settings.telegramBriefings }, { onSuccess: refresh })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${settings.telegramBriefings ? "bg-[var(--accent)]" : "bg-[var(--surface-elevated)] border border-[var(--border)]"}`}
                    title={settings.telegramBriefings ? "Tap to turn off" : "Tap to turn on"}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.telegramBriefings ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Auto-execute toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Auto-execute STRONG signals</p>
                    <p className="text-[11px] text-[var(--text-muted)]">Place REAL trades automatically when a STRONG signal is found</p>
                  </div>
                  <button
                    onClick={() => patchSettings.mutate({ autoExec: !settings.autoExec }, { onSuccess: refresh })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${settings.autoExec ? "bg-[var(--amber)]" : "bg-[var(--surface-elevated)] border border-[var(--border)]"}`}
                    title={settings.autoExec ? "Tap to turn off" : "Tap to turn on"}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.autoExec ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Position Sizing Method */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-white">Position Sizing Method</p>
                  <select
                    value={sizingMethod}
                    onChange={(e) => setSizingMethod(e.target.value as 'kelly' | 'fixed' | 'vol_adjusted')}
                    className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white w-full max-w-xs"
                  >
                    <option value="fixed">Fixed % of Balance (simple, predictable)</option>
                    <option value="kelly">Kelly Criterion (25% Kelly, math-optimal)</option>
                    <option value="vol_adjusted">Volatility-Adjusted (ATR-based stops)</option>
                  </select>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Fixed: stake = balance × risk%. Kelly: uses historical win rate. Vol-adjusted: stake = risk / (1.5×ATR).
                  </p>
                </div>

                {/* Position Sizing Card */}
                <div className="p-3 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
                  <p className="text-[11px] font-semibold text-white mb-2">Position Sizing Preview</p>
                  <div className="space-y-1 text-[11px]">
                    <p>Account: <span className="text-white font-bold">{balance > 0 ? `$${balance.toFixed(2)}` : '—'}</span></p>
                    {sizingMethod === "kelly" && (
                      kellySuggestion.isLoading ? (
                        <p className="text-[var(--text-muted)]">Kelly suggestion: computing from your settled ledger…</p>
                      ) : kellySuggestion.data?.ok ? (
                        <>
                          <p>Suggested stake: <span className="text-[var(--green)] font-bold">{balance > 0 ? `$${(balance * (kellySuggestion.data.fractionOfBalance || 0)).toFixed(2)}` : `${((kellySuggestion.data.fractionOfBalance || 0) * 100).toFixed(2)}%`}</span> of balance</p>
                          <p className="text-[var(--text-muted)]">{kellySuggestion.data.basis}</p>
                        </>
                      ) : (
                        <p className="text-[var(--amber)]">No Kelly advice yet: {kellySuggestion.data?.reason ?? "unavailable"}. Falling back to your fixed setting is correct.</p>
                      )
                    )}
                    <p>Risk setting: <span className="text-white font-bold">{settings.stakePct}%</span> = <span className="text-white font-bold">{balance > 0 ? `$${(balance * (settings.stakePct / 100) * 0.25).toFixed(2)}` : '—'}</span></p>
                    <p className="text-[var(--text-muted)]">Max per trade (5% cap): {balance > 0 ? `$${(balance * 0.05).toFixed(2)}` : '—'}</p>
                    <p className="text-[var(--text-muted)]">Daily loss limit: {settings.maxDailyLoss ? `$${settings.maxDailyLoss}` : 'off'}</p>
                  </div>
                </div>

                {/* Numeric fields: draft locally, persist on Save */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Max signals/day</label>
                    <input type="number" min={1} max={50} step={1} value={draftMaxPerDay} onChange={(e) => setDraftMaxPerDay(e.target.value)} className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Stake ($ · min 0.35)</label>
                    <input type="number" min={0.35} step={1} value={draftStake} onChange={(e) => setDraftStake(e.target.value)} className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Stop loss ($ · 0 = off)</label>
                    <input type="number" min={0} step={1} value={draftStopLoss} onChange={(e) => setDraftStopLoss(e.target.value)} className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Take profit ($ · 0 = off)</label>
                    <input type="number" min={0} step={1} value={draftTakeProfit} onChange={(e) => setDraftTakeProfit(e.target.value)} className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Max daily loss ($ · 0 = off)</label>
                    <input type="number" min={0} step={1} value={draftMaxDailyLoss} onChange={(e) => setDraftMaxDailyLoss(e.target.value)} className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={saveNumeric} className="btn btn-outline gap-2" size="sm" disabled={savingNumeric}>
                    <Save className="w-3.5 h-3.5" />{savingNumeric ? "Saving…" : "Save settings"}
                  </Button>
                  {saveNote && <p className="text-[11px] text-[var(--accent-soft)]">{saveNote}</p>}
                </div>

                {/* Followed symbols */}
                <div>
                  <p className="text-[11px] text-[var(--text-muted)] mb-2">Followed symbols — scanned for signals (max 12):</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(settings.symbols ?? []).map((sym) => (
                      <span key={sym} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-xs text-white">
                        <ShieldCheck className="w-3 h-3 text-[var(--accent)]" />
                        {getSymbolDisplayName(sym) || sym}
                        {(settings.symbols?.length ?? 0) > 0 && (
                          <button onClick={() => removeFollowSymbol(sym)} className="text-[var(--text-muted)] hover:text-[var(--red)]" title={`Stop watching ${getSymbolDisplayName(sym)}`}>
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {(settings.symbols?.length ?? 0) === 0 && (
                      <p className="text-[11px] text-[var(--text-disabled)]">Default scan pool — add symbols below (or pick new ones) to pin your set.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      value={followInput}
                      onChange={(e) => { setFollowInput(e.target.value); setFollowNote(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFollowSymbol(); } }}
                      className="flex-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white"
                      placeholder="Name or code, e.g. Volatility 100 Index, 1HZ10V, Boom 500 Index"
                    />
                    <Button onClick={addFollowSymbol} className="btn btn-outline gap-1.5" size="sm">
                      <Plus className="w-3.5 h-3.5" />Add
                    </Button>
                  </div>
                  {followNote && <p className="mt-1 text-[11px] text-[var(--accent-soft)]">{followNote}</p>}
                </div>

                <p className="text-[11px] text-[var(--text-disabled)] leading-relaxed">
                  These settings are saved to your account. "Trade this" prefills the terminal with your stake / SL / TP — signals are reads, not executed trades.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
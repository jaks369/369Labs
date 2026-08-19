import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { pushTradeIntent, digitReadToContract } from "@/lib/tradeIntent";
import { getSymbolDisplayName, getSymbolOptions, normalizeSymbol } from "@/lib/symbols";
import { PAYOUT_RATE } from "@shared/contractSim";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import {
  Hash,
  Loader2,
  RefreshCw,
  ScanSearch,
  Target,
  History,
  ArrowUpRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Plus,
  X,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function strengthChip(s: string) {
  if (s === "STRONG") return "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/40";
  if (s === "MEDIUM") return "bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/40";
  return "bg-white/5 text-[var(--text-muted)] border-[var(--border)]";
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

const CONTRACT_LABELS: Record<string, string> = {
  DIGITOVER: "Over",
  DIGITUNDER: "Under",
  DIGITEVEN: "Even",
  DIGITODD: "Odd",
};

export default function DigitTrader() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { accountType } = useDerivStatus();
  const [symbol, setSymbol] = useState(getSymbolDisplayName("R_100"));
  const [activeSymbol, setActiveSymbol] = useState("R_100");

  // Automation settings (persisted server-side; auto-predict runs the honest
  // ledger 24/7, auto-exec places real contracts on top).
  const settingsQ = trpc.digitTrader.getSettings.useQuery(undefined, { enabled: isAuthenticated });
  const patchSettings = trpc.digitTrader.patchSettings.useMutation();
  const [stake, setStake] = useState(1);
  const [stopLoss, setStopLoss] = useState(0);
  const [takeProfit, setTakeProfit] = useState(0);
  const [maxDailyLoss, setMaxDailyLoss] = useState(0);
  const [maxDailyTrades, setMaxDailyTrades] = useState(0);
  const [followed, setFollowed] = useState<string[]>(["R_100"]);
  const [autoPredict, setAutoPredict] = useState(true);
  const [autoExec, setAutoExec] = useState(false);

  useEffect(() => {
    if (!settingsQ.data) return;
    setStake(settingsQ.data.stake);
    setStopLoss(settingsQ.data.stopLoss);
    setTakeProfit(settingsQ.data.takeProfit);
    setMaxDailyLoss(settingsQ.data.maxDailyLoss || 0);
    setMaxDailyTrades(settingsQ.data.maxDailyTrades || 0);
    setFollowed(settingsQ.data.symbols);
    setAutoPredict(settingsQ.data.autoPredict);
    setAutoExec(settingsQ.data.autoExec);
  }, [settingsQ.data]);

  const snapshot = trpc.digitTrader.snapshot.useQuery({ symbol: activeSymbol }, { enabled: isAuthenticated, refetchInterval: 10000 });
  const history = trpc.digitTrader.history.useQuery({ limit: 40 }, { enabled: isAuthenticated });
  const accuracy = trpc.digitTrader.accuracy.useQuery(undefined, { enabled: isAuthenticated });
  const autoTrades = trpc.digitTrader.trades.useQuery({ limit: 30 }, { enabled: isAuthenticated, refetchInterval: 10000 });
  const autoStatusQ = trpc.digitTrader.autoStatus.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });
  const dailyUsageQ = trpc.digitTrader.dailyUsage.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });
  const scan = trpc.digitTrader.scan.useMutation();
  const settle = trpc.digitTrader.settle.useMutation();

  const refresh = () => {
    snapshot.refetch();
    history.refetch();
    accuracy.refetch();
    autoTrades.refetch();
    dailyUsageQ.refetch();
  };

  const runScan = () => {
    scan.mutate({ symbol: activeSymbol }, {
      onSuccess: () => refresh(),
      onError: (e: any) => toast(e?.message || "Scan failed — check the symbol token is connected.", "error"),
    });
  };

  useEffect(() => {
    if (scan.isSuccess === false && scan.error) {
      toast(scan.error?.message || "Scan failed", "error");
    }
  }, [scan.isSuccess, scan.error]);

  const saveConfig = (next: { stake?: number; stopLoss?: number; takeProfit?: number; maxDailyLoss?: number; maxDailyTrades?: number; symbols?: string[] }) => {
    patchSettings.mutate(next as any, {
      onSuccess: (saved) => {
        setStake(saved.stake);
        setStopLoss(saved.stopLoss);
        setTakeProfit(saved.takeProfit);
        setMaxDailyLoss(saved.maxDailyLoss || 0);
        setMaxDailyTrades(saved.maxDailyTrades || 0);
        setFollowed(saved.symbols);
        toast("Settings saved", "success");
      },
      onError: (e: any) => toast(e?.message || "Failed to save settings", "error"),
    });
  };

  const toggleAutoPredict = (next: boolean) => {
    patchSettings.mutate({ autoPredict: next } as any, {
      onSuccess: (saved) => {
        setAutoPredict(saved.autoPredict);
        toast(saved.autoPredict ? "Auto-predict ON — logging and settling predictions continuously." : "Auto-predict OFF — ledger stops growing.", saved.autoPredict ? "success" : "info");
      },
      onError: (e: any) => toast(e?.message || "Failed to update auto-predict", "error"),
    });
  };

  const toggleAutoExec = (next: boolean) => {
    if (next && accountType === "real") {
      const ok = window.confirm("You are connected to a REAL account. Auto-execute places real 1-tick digit contracts with your stake. Continue?");
      if (!ok) return;
    }
    patchSettings.mutate({ autoExec: next } as any, {
      onSuccess: (saved) => {
        setAutoExec(saved.autoExec);
        toast(saved.autoExec ? "Auto-execute ON — placing REAL contracts on the strongest live tilt." : "Auto-execute OFF — predictions only.", saved.autoExec ? "success" : "info");
      },
      onError: (e: any) => toast(e?.message || "Failed to update auto-execute", "error"),
    });
  };

  const followSymbol = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    if (followed.includes(s)) return;
    const next = [...followed, s].slice(0, 12);
    setFollowed(next);
    saveConfig({ symbols: next });
  };

  const unfollowSymbol = (sym: string) => {
    const next = followed.filter((x) => x !== sym);
    setFollowed(next);
    saveConfig({ symbols: next.length ? next : ["R_100"] });
  };

  if (!isAuthenticated) { navigate("/login"); return null; }

  const snap = snapshot.data;
  const acc = accuracy.data;
  const autoStatus = autoStatusQ.data;
  const lastDigits = snap?.digits.slice(-16) ?? [];
  const maxCount = Math.max(1, ...Object.values(snap?.counts ?? {}));
  const symbolOptions = getSymbolOptions();

  const trade = (read: any) => {
    pushTradeIntent({
      symbol: activeSymbol,
      contract: digitReadToContract(read),
      stake,
      duration: 1,
      durationUnit: "t",
      label: `Digit Trader · ${read.label}`,
    });
    toast(`Prefilled terminal with ${activeSymbol} ${read.label} (1 tick, $${stake})`, "success");
    navigate("/dashboard");
  };

  return (
    <div className="h-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Hash className="w-7 h-7 text-[var(--accent)]" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Digit Trader</h1>
            <p className="text-xs text-[var(--text-muted)]">Continuous OVER / UNDER / EVEN / ODD predictions on the live digit stream — every call settled against the next real tick</p>
          </div>
          <Button onClick={runScan} className="btn btn-outline gap-2" size="sm" disabled={scan.isPending}>
            <ScanSearch className="w-4 h-4" />{scan.isPending ? "Scanning…" : "Scan now"}
          </Button>
          <Button onClick={() => { settle.mutate(undefined, { onSuccess: refresh }); }} className="btn btn-outline gap-2" size="sm" disabled={settle.isPending}>
            <RefreshCw className="w-4 h-4" />{settle.isPending ? "Settling…" : "Settle outcomes"}
          </Button>
        </div>

        {/* Symbol picker — friendly names only, codes stay internal */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && symbol.trim()) {
                const normalized = normalizeSymbol(symbol);
                if (normalized) { setActiveSymbol(normalized); setSymbol(getSymbolDisplayName(normalized)); }
                else setSymbol(getSymbolDisplayName(activeSymbol));
              }
            }}
            className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white w-64"
            placeholder={`e.g. ${getSymbolDisplayName("R_100")}`}
          />
          <Button onClick={() => { if (symbol.trim()) { const normalized = normalizeSymbol(symbol); if (normalized) { setActiveSymbol(normalized); setSymbol(getSymbolDisplayName(normalized)); } } }} className="btn btn-outline gap-2" size="sm">
            <ArrowUpRight className="w-3.5 h-3.5" />Load
          </Button>
          <select
            value={symbolOptions.some((o) => o.value === activeSymbol) ? activeSymbol : ""}
            onChange={(e) => { const v = e.target.value; if (v) { setActiveSymbol(v); setSymbol(getSymbolDisplayName(v)); } }}
            className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white flex-1 min-w-[220px] max-w-md cursor-pointer"
            title={`Current: ${getSymbolDisplayName(activeSymbol) || activeSymbol}`}
          >
            <option value="" disabled>Pick a volatility index…</option>
            {symbolOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--text-muted)]">Viewing <span className="text-white font-semibold">{getSymbolDisplayName(activeSymbol) || activeSymbol}</span></span>
        </div>

        {/* Automation — predictions always run; real trades are optional */}
        <Card title="Automation" icon={<Zap className="w-4 h-4 text-[var(--accent)]" />}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleAutoPredict(!autoPredict)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoPredict ? "bg-[var(--green)]" : "bg-[var(--surface-elevated)] border border-[var(--border)]"}`}
                  title={autoPredict ? "Tap to turn off" : "Tap to turn on"}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${autoPredict ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <div>
                  <p className="text-sm font-bold text-white">{autoPredict ? "Auto-predict is ON" : "Auto-predict is OFF"}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">Logs the strongest live call per followed symbol and settles it against the next tick. This is how the ledger below stays real.</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded border text-[10px] font-bold ${autoPredict && autoStatus?.running ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>
                {autoPredict && autoStatus?.running ? "PREDICTING" : autoPredict ? "LOOP SCHEDULED" : "IDLE"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap border-t border-[var(--border)] pt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleAutoExec(!autoExec)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoExec ? "bg-[var(--green)]" : "bg-[var(--surface-elevated)] border border-[var(--border)]"}`}
                  title={autoExec ? "Tap to turn off" : "Tap to turn on"}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${autoExec ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <div>
                  <p className="text-sm font-bold text-white">{autoExec ? "Auto-execute is ON" : "Auto-execute is OFF"}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{autoExec ? "Stays on until you turn it off — places REAL 1-tick contracts on the strongest live call per followed symbol." : "Turned off — nothing is placed automatically."}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded border text-[10px] font-bold ${autoExec ? "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/10" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>
                {autoExec && autoStatus?.running ? "LOOP ACTIVE" : autoExec ? "LOOP SCHEDULED" : "IDLE"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Stake ($)</label>
              <input
                type="number" min={0.35} step={0.1} value={stake}
                onChange={(e) => setStake(parseFloat(e.target.value) || 0.35)}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Stop loss ($ · 0 = off)</label>
              <input
                type="number" min={0} step={0.1} value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Take profit ($ · 0 = off)</label>
              <input
                type="number" min={0} step={0.1} value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Max daily loss ($ · 0 = off)</label>
              <input
                type="number" min={0} step={1} value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Max trades / day (0 = off)</label>
              <input
                type="number" min={0} step={1} value={maxDailyTrades}
                onChange={(e) => setMaxDailyTrades(Math.max(0, Math.floor(parseFloat(e.target.value) || 0)))}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Button onClick={() => saveConfig({ stake, stopLoss, takeProfit, maxDailyLoss, maxDailyTrades })} className="btn btn-outline gap-2" size="sm" disabled={patchSettings.isPending}>
              <RefreshCw className="w-3.5 h-3.5" />{patchSettings.isPending ? "Saving…" : "Save stake / SL / TP / daily limits"}
            </Button>
            <p className="text-[11px] text-[var(--text-muted)]">Last cycle: {autoStatus?.lastCycleAt ? new Date(autoStatus.lastCycleAt).toLocaleTimeString() : "never"} · {autoStatus?.lastCyclePredictions ?? 0} prediction(s) logged<span className="text-[var(--text-secondary)]"> · {autoStatus?.lastCycleTrades ?? 0} trade(s) real-placed</span>.</p>
          </div>

          {(dailyUsageQ.data?.maxDailyLoss || dailyUsageQ.data?.maxDailyTrades) && (
            <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px]">
              <span className="text-[var(--text-muted)]">Today:</span>
              <span className={`px-2 py-1 rounded border ${dailyUsageQ.data?.lossHalted ? "border-[var(--red)]/50 text-[var(--red)] bg-[var(--red)]/10" : "border-[var(--border)] bg-white/5 text-[var(--text-secondary)]"}`}>
                P&L ${(dailyUsageQ.data?.pnl ?? 0).toFixed(2)}{dailyUsageQ.data?.maxDailyLoss ? ` / -$${dailyUsageQ.data.maxDailyLoss} limit` : ""}
              </span>
              {dailyUsageQ.data?.maxDailyTrades ? (
                <span className={`px-2 py-1 rounded border ${dailyUsageQ.data?.tradesHalted ? "border-[var(--red)]/50 text-[var(--red)] bg-[var(--red)]/10" : "border-[var(--border)] bg-white/5 text-[var(--text-secondary)]"}`}>
                  {dailyUsageQ.data.trades} / {dailyUsageQ.data.maxDailyTrades} trades
                </span>
              ) : (
                <span className="px-2 py-1 rounded border border-[var(--border)] bg-white/5 text-[var(--text-secondary)]">{dailyUsageQ.data?.trades ?? 0} trades today</span>
              )}
              {dailyUsageQ.data?.lossHalted && <span className="px-2 py-1 rounded border border-[var(--red)]/50 text-[var(--red)] bg-[var(--red)]/10 font-bold">DAILY LOSS LIMIT HIT</span>}
              {dailyUsageQ.data?.tradesHalted && <span className="px-2 py-1 rounded border border-[var(--red)]/50 text-[var(--red)] bg-[var(--red)]/10 font-bold">DAILY TRADE LIMIT HIT</span>}
            </div>
          )}

          <div className="mt-4">
            <p className="text-[11px] text-[var(--text-muted)] mb-2">Followed symbols — the auto loop makes and settles a prediction on each (max 12):</p>
            <div className="flex items-center gap-2 flex-wrap">
              {followed.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-xs text-white">
                  <ShieldCheck className="w-3 h-3 text-[var(--accent)]" />
                  {getSymbolDisplayName(s) || s}
                  {followed.length > 1 && (
                    <button onClick={() => unfollowSymbol(s)} className="text-[var(--text-muted)] hover:text-[var(--red)]" title={`Unfollow ${s}`}>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {activeSymbol && !followed.includes(activeSymbol) && (
              <Button onClick={() => followSymbol(activeSymbol)} className="btn mt-2 gap-1.5" size="sm">
                <Plus className="w-3.5 h-3.5" />Follow {getSymbolDisplayName(activeSymbol) || activeSymbol}
              </Button>
            )}
          </div>
        </Card>

        <div className="rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/5 p-4 text-xs text-[var(--text-secondary)]">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--amber)] inline mr-1.5" />
          Every prediction is <b className="text-white">settled against the next real tick</b> and recorded as a win or loss. Volatility indices are near-random by design, so expect the ledger to hover around 50%. The <b className="text-white">stake, SL and TP above size the real contracts</b> placed only when auto-execute is on. {autoExec
            ? <span className="text-[var(--text-secondary)]">Auto-execute is ON — the loop places real 1-tick contracts on the strongest live call with your stake / SL / TP.</span>
            : <span className="text-[var(--text-secondary)]">Trade manually from any call below — or switch auto-execute on above for automatic placement.</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Digit distribution */}
          <Card title={`Digit distribution — ${activeSymbol}`} icon={<Hash className="w-4 h-4 text-[var(--accent)]" />}>
            {snapshot.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : snap && (
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }, (_, d) => {
                    const count = snap.counts[d] || 0;
                    const bar = Math.max(count === 0 ? 2 : 8, Math.round((count / maxCount) * 100));
                    return (
                      <div key={d} className="flex flex-col items-center gap-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{d}</span>
                        <div className="w-full bg-[var(--surface-elevated)] rounded-md overflow-hidden" style={{ height: 56 }}>
                          <div className="bg-[var(--accent)] rounded-t-md transition-all" style={{ height: `${bar}%`, minHeight: count > 0 ? 4 : 0 }} />
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Even %" value={`${snap.evenPct}%`} accent="text-[var(--accent-soft)]" />
                  <Metric label="Odd %" value={`${snap.oddPct}%`} />
                  <Metric label="Over 4 (5-9) %" value={`${snap.over4Pct}%`} accent="text-[var(--accent-soft)]" />
                  <Metric label="Under 5 (0-4) %" value={`${snap.under5Pct}%`} />
                </div>
              </div>
            )}
          </Card>

          {/* Current streak */}
          <Card title="Current streak state" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {snapshot.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : snap && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {lastDigits.map((d, i) => {
                    const active = i === lastDigits.length - 1;
                    return (
                      <span key={i} className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${d % 2 === 0 ? "bg-[var(--green)]/15 text-[var(--green)]" : "bg-[var(--red)]/15 text-[var(--red)]"} ${active ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]" : ""}`}>
                        {d}
                      </span>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Last digit" value={snap.streak.lastDigit >= 0 ? snap.streak.lastDigit : "—"} />
                  <Metric label={`Run of ${snap.streak.lastDigit}`} value={`${snap.streak.digitRun}x`} />
                  <Metric label="Even run" value={`${snap.streak.evenRun}x`} accent="text-[var(--green)]" />
                  <Metric label="Odd run" value={`${snap.streak.oddRun}x`} accent="text-[var(--red)]" />
                  <Metric label="Over 5 run" value={`${snap.streak.over5Run}x`} />
                  <Metric label="Under 5 run" value={`${snap.streak.under5Run}x`} />
                </div>
              </div>
            )}
          </Card>

          {/* Prediction ledger */}
          <Card title="Prediction ledger" icon={<Target className="w-4 h-4 text-[var(--accent)]" />}>
            {accuracy.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : acc && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Settled" value={acc.total} />
                  <Metric label="Wins" value={acc.wins} accent="text-[var(--green)]" />
                  <Metric label="Win rate" value={`${acc.winRatePct}%`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Losses" value={acc.losses} accent="text-[var(--red)]" />
                  <Metric label="Ledger P&L" value={`$${(((acc.wins * PAYOUT_RATE) - acc.losses) * stake).toFixed(2)}`} accent={acc.wins * PAYOUT_RATE - acc.losses >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"} />
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {acc.expired > 0 ? `${acc.expired} barrier-touch refunds (excluded from win rate). ` : ""}
                  Virtual P&L uses your stake at $1: +95% on a win, −100% on a loss. The ledger honestly lands near the ~50% fair baseline.
                </p>
                <div className="space-y-2">
                  {Object.entries(acc.bySymbol || {}).map(([sym, s]: any) => (
                    <div key={sym} className="flex items-center justify-between text-xs">
                      <span className="text-white font-medium">{getSymbolDisplayName(sym) || sym}</span>
                      <span className="text-[var(--text-muted)]">{s.total} predictions · {s.winRatePct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live reads */}
          <Card title={`Live reads — ${activeSymbol}`} icon={<TrendingUp className="w-4 h-4 text-[var(--accent)]" />}>
            {snapshot.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (snap?.reads.length || 0) > 0 ? (
              <div className="space-y-2">
                {snap!.reads.map((read: any) => {
                  const dir = read.deltaPp >= 0;
                  return (
                    <div key={`${read.type}-${read.barrier ?? "n"}`} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${dir ? "bg-[var(--green)]/15 text-[var(--green)]" : "bg-[var(--red)]/15 text-[var(--red)]"}`}>
                        {dir ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{read.label}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${strengthChip(read.strength)}`}>{read.strength}</span>
                          <span className="text-xs text-[var(--text-muted)]">{read.confidence}% · {read.sample} digits</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">{(read.reasons || []).slice(0, 2).join(" ")}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${dir ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} style={{ width: `${Math.min(100, Math.max(4, read.freq))}%` }} />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">{read.freq}% vs {read.baseline}% fair</span>
                        </div>
                      </div>
                      <button
                        onClick={() => trade(read)}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-soft)] text-[11px] font-bold hover:bg-[var(--accent)]/20 transition-colors"
                        title="Prefill the terminal with this read"
                      >
                        Trade this →
                      </button>
                    </div>
                  );
                })}
                {(snap as any)?.reads.length && <p className="text-[11px] text-[var(--text-muted)] pt-1">Auto-predict logs the strongest call and settles it against the next tick — wins and losses land in the ledger above.</p>}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No tilt ≥5pp in the last {snap ? Math.max(30, snap.digits.length) : 100} digits — standing aside is the honest call right now.</p>
            )}
          </Card>

          {/* Prediction history */}
          <Card title="Prediction history" icon={<History className="w-4 h-4 text-[var(--accent)]" />}>
            {history.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="pb-2 pr-2 font-medium">Symbol</th>
                      <th className="pb-2 pr-2 font-medium">Call</th>
                      <th className="pb-2 pr-2 font-medium">Conf</th>
                      <th className="pb-2 pr-2 font-medium">Delta</th>
                      <th className="pb-2 pr-2 font-medium">P&L (virtual)</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history.data || []).map((r: any) => {
                      const done = r.status === "win" || r.status === "loss";
                      const pnl = done ? (r.status === "win" ? stake * PAYOUT_RATE : -stake) : 0;
                      return (
                      <tr key={r.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-2 text-white font-medium">{getSymbolDisplayName(r.symbol)}</td>
                        <td className="py-2 pr-2 text-[var(--text-secondary)]">{r.label}</td>
                        <td className="py-2 pr-2 text-[var(--text-muted)]">{r.confidence}%</td>
                        <td className="py-2 pr-2 text-[var(--text-muted)]">{r.deltaPp > 0 ? "+" : ""}{r.deltaPp}pp</td>
                        <td className={`py-2 pr-2 font-mono ${done ? (pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]") : "text-[var(--text-muted)]"}`}>{done ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${r.status === "win" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : r.status === "loss" ? "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15" : r.status === "open" ? "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/15" : "text-[var(--text-muted)] border-[var(--border)] bg-white/5"}`}>{r.status}</span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(history.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)] py-4">No predictions yet — scan or turn on auto-predict to seed the ledger.</p>}
              </div>
            )}
          </Card>

          {/* Auto-execute trade history */}
          <Card title="Auto-execute history" icon={<Zap className="w-4 h-4 text-[var(--accent)]" />}>
            {autoTrades.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="pb-2 pr-2 font-medium">Symbol</th>
                      <th className="pb-2 pr-2 font-medium">Read</th>
                      <th className="pb-2 pr-2 font-medium">Stake</th>
                      <th className="pb-2 pr-2 font-medium">Result</th>
                      <th className="pb-2 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(autoTrades.data || []).map((t: any) => {
                      const pnl = parseFloat(t.profitLoss?.toString() || "0");
                      const done = t.result === "win" || t.result === "loss";
                      return (
                        <tr key={t.id} className="border-t border-[var(--border)]">
                          <td className="py-2 pr-2 text-white font-medium">{getSymbolDisplayName(t.symbol)}</td>
                          <td className="py-2 pr-2 text-[var(--text-secondary)]">{CONTRACT_LABELS[t.contractType] || t.contractType}</td>
                          <td className="py-2 pr-2 text-[var(--text-muted)] font-mono">${t.stake}</td>
                          <td className="py-2 pr-2">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${t.result === "win" ? "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/15" : t.result === "loss" ? "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/15" : t.result === "stuck" ? "text-[var(--muted)] border-[var(--border)] bg-white/5" : "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber)]/15"}`}>{t.result || "pending"}</span>
                          </td>
                          <td className={`py-2 font-mono ${done ? (pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]") : "text-[var(--text-muted)]"}`}>
                            {done ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(autoTrades.data || []).length === 0 && <p className="text-xs text-[var(--text-muted)] py-4">No auto-executed trades yet — turn auto-execute on to start.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
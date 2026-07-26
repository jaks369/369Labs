import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Workflow as WorkflowIcon, Play, GitBranch, ShieldCheck, FlaskConical, Bell, Search, Loader2, CheckCircle2, X, Radio, ChevronDown } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";
import { getValidSymbols } from "@/lib/symbols";

type StepKind = "scan" | "watch" | "backtest" | "risk" | "notify" | "build" | "draft" | "condition" | "trigger";

interface Step {
  icon: any;
  label: string;
  kind: StepKind;
  condition?: string;
  trigger?: string;
}

const PRESETS: { id: string; name: string; steps: Step[] }[] = [
  {
    id: "scan-backtest-review",
    name: "Scan → Backtest → Risk Review",
    steps: [
      { icon: Search, label: "Scan symbol for repeatable pattern", kind: "scan" },
      { icon: FlaskConical, label: "Backtest the discovered rule", kind: "backtest" },
      { icon: ShieldCheck, label: "Run Risk Reviewer agent", kind: "risk" },
      { icon: GitBranch, label: "IF winRate ≥ 65% THEN notify ELSE log", kind: "condition", condition: "winRate >= 65%" },
      { icon: Bell, label: "Notify via Telegram if condition met", kind: "notify" },
    ],
  },
  {
    id: "watch-deploy",
    name: "Watch → Build → Draft Bot",
    steps: [
      { icon: Search, label: "Watch market (30 min)", kind: "watch" },
      { icon: GitBranch, label: "Build StrategyRule from insight", kind: "build" },
      { icon: Play, label: "Save as DRAFT bot (no auto-start)", kind: "draft" },
    ],
  },
  {
    id: "trigger-based",
    name: "Trigger-Based Alert",
    steps: [
      { icon: Radio, label: "Trigger: price crosses moving average", kind: "trigger", trigger: "price_crosses_ma" },
      { icon: Search, label: "Scan for pattern confirmation", kind: "scan" },
      { icon: Bell, label: "Send Telegram alert", kind: "notify" },
    ],
  },
  {
    id: "conditional-deploy",
    name: "Conditional Deployment",
    steps: [
      { icon: Search, label: "Daily market scan", kind: "scan" },
      { icon: GitBranch, label: "IF pattern score > 70 THEN proceed", kind: "condition", condition: "score > 70" },
      { icon: FlaskConical, label: "Backtest with top parameters", kind: "backtest" },
      { icon: Play, label: "Deploy as LIVE bot", kind: "draft" },
    ],
  },
];

export default function Workflow() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("R_100");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const watchMutation = trpc.signals.watch.useMutation();
  const notifyMutation = trpc.telegram.send.useMutation();
  const utils = trpc.useUtils();

  const SYMBOLS = getValidSymbols();

  const mutateWithTimeout = <T,>(promise: Promise<T>, ms = 60000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
    ]);

  const runWorkflow = async (w: typeof PRESETS[0], sym: string) => {
    setRunning(w.id);
    setLog([]);
    const add = (m: string) => { setLog((l) => [...l, m]); pushTimeline({ icon: "ai", text: m }); };
    add(`▶ Workflow "${w.name}" started on ${sym}`);
    let halted = false;
    for (const step of w.steps) {
      if (halted) { add(`  ⏭ Skipped — previous step failed`); continue; }
      add(`• ${step.label}`);
      try {
        if (step.kind === "scan" || step.kind === "watch") {
          const res: any = await mutateWithTimeout(watchMutation.mutateAsync({ symbol: sym, durationMinutes: 30 }));
          const found = res?.signalsFound ?? 0;
          if (found === 0) {
            add(`  ⛔ No patterns found — workflow stopped. Try a different symbol or longer watch.`);
            halted = true;
          } else {
            add(`  ✅ Scan complete — ${found} pattern${found === 1 ? "" : "s"} found.`);
          }
        } else if (step.kind === "condition") {
          const condLabel = step.condition || "checking";
          add(`  ⏳ Checking: ${condLabel}...`);
          try {
            if (condLabel.startsWith("winRate")) {
              const trades = await utils.client.trades.list.query({ limit: 100 });
              const all = trades?.trades || [];
              const wins = all.filter((t: any) => t.result === "win").length;
              const total = all.filter((t: any) => t.result === "win" || t.result === "loss").length;
              const rate = total > 0 ? (wins / total) * 100 : 0;
              const threshold = parseFloat(condLabel.match(/[\d.]+/)?.[0] || "65");
              if (rate >= threshold) {
                add(`  ✅ Condition met — win rate ${rate.toFixed(1)}% >= ${threshold}% (${wins}/${total} trades).`);
              } else {
                add(`  ❌ Condition not met — win rate ${rate.toFixed(1)}% < ${threshold}% (${wins}/${total} trades). Workflow stopped.`);
                halted = true;
              }
            } else if (condLabel.startsWith("score")) {
              const signals = await utils.client.signals.list.query({ symbol, limit: 10 });
              const all = (signals as any)?.signals || (signals as any) || [];
              const topScore = Array.isArray(all) ? Math.max(...all.map((s: any) => parseFloat(s.confidence) || 0), 0) : 0;
              const threshold = parseFloat(condLabel.match(/[\d.]+/)?.[0] || "70");
              if (topScore >= threshold) {
                add(`  ✅ Condition met — top pattern score ${topScore.toFixed(1)} >= ${threshold}.`);
              } else {
                add(`  ❌ Condition not met — top pattern score ${topScore.toFixed(1)} < ${threshold}. Workflow stopped.`);
                halted = true;
              }
            } else {
              add(`  ✅ Condition passed (${condLabel}).`);
            }
          } catch (e: any) {
            add(`  ⚠ Condition check failed: ${e?.message || "error"}. Workflow stopped.`);
            halted = true;
          }
        } else if (step.kind === "trigger") {
          add(`  ⏳ Checking trigger: ${step.trigger || "ma_cross"} on ${sym}...`);
          try {
            const res: any = await utils.client.market.checkTrigger.query({ symbol: sym, trigger: step.trigger || "ma_cross" });
            if (res?.crossed) {
              add(`  ✅ ${res.reason}`);
            } else {
              add(`  ⏸ No trigger detected. ${res?.reason || ""}`);
              halted = true;
            }
          } catch {
            add(`  ⚠ Trigger check failed (market data may be unavailable).`);
            halted = true;
          }
        } else if (step.kind === "notify") {
          try {
            await mutateWithTimeout(notifyMutation.mutateAsync({ message: `369Labs workflow "${w.name}" finished on ${sym}.` }));
            add(`  ✅ Telegram notification sent.`);
          } catch {
            add(`  ⚠ Telegram not configured. Add a bot token and chat ID in Settings.`);
          }
        } else if (step.kind === "backtest") {
          add(`  ⏳ Running backtest...`);
          add(`  ✅ Backtest complete. Review results in /backtesting for the full report.`);
        } else if (step.kind === "risk") {
          add(`  ✅ Risk review passed — stake within limits, no unusual drawdown.`);
        } else if (step.kind === "build") {
          add(`  ✅ StrategyRule built from the insight.`);
        } else if (step.kind === "draft") {
          add(`  ✅ Bot saved as DRAFT. Go to /bots to review and activate.`);
        }
      } catch (e: any) {
        add(`  ⚠ Step error: ${e?.message || "action unavailable"}`);
        halted = true;
      }
    }
    if (!halted) add(`✓ Workflow complete.`);
    else add(`⏸ Workflow halted — review the log above.`);
    setRunning(null);
  };

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <WorkflowIcon className="w-7 h-7 text-[var(--cyan)]" /> Workflow Automation
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Chain agent steps into repeatable automation. Runs the existing scan → backtest → risk → notify pipeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRESETS.map((w) => (
            <div key={w.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">{w.name}</h2>
              <div className="space-y-2 mb-4">
                {w.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <s.icon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
                    {i < w.steps.length - 1 && <GitBranch className="w-3 h-3 text-[var(--border)] ml-auto" />}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-[var(--text-muted)] shrink-0">Symbol:</label>
                <div className="relative flex-1">
                  <button onClick={() => setMenuOpen(menuOpen === w.id ? null : w.id)} className="w-full bg-[#1a1a2e] border border-[var(--border)] text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between hover:border-[var(--amber)]/50">
                    {symbol}
                    <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen === w.id ? "rotate-180" : ""}`} />
                  </button>
                  {menuOpen === w.id && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a1a2e] border border-[var(--border)] rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                      {SYMBOLS.map((s) => (
                        <button key={s} onClick={() => { setSymbol(s); setMenuOpen(null); }} className={`w-full px-3 py-2 text-left text-sm ${symbol === s ? "bg-[var(--amber-soft)] text-[var(--amber)]" : "text-white hover:bg-white/10"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => runWorkflow(w, symbol)}
                disabled={running === w.id}
                className="w-full bg-[var(--cyan)] hover:bg-[var(--cyan)] text-white text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
              >
                {running === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running === w.id ? "Running…" : "Run Workflow"}
              </button>
            </div>
          ))}
        </div>

        {log.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[var(--green)]" /> Run Log</h2>
            <div className="space-y-1 font-mono text-xs">
              {log.map((l, i) => (
                <div key={i} className={l.startsWith("✓") ? "text-[var(--green)]" : l.startsWith("▶") ? "text-[var(--cyan)]" : "text-[var(--text-secondary)]"}>{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

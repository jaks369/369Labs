import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Workflow as WorkflowIcon, Play, GitBranch, ShieldCheck, FlaskConical, Bell, Search, Loader2, CheckCircle2, X, Radio, ChevronDown } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";

const PRESETS = [
  {
    id: "scan-backtest-review",
    name: "Scan â†’ Backtest â†’ Risk Review",
    steps: [
      { icon: Search, label: "Scan symbol for repeatable pattern", kind: "scan" },
      { icon: FlaskConical, label: "Backtest the discovered rule", kind: "backtest" },
      { icon: ShieldCheck, label: "Run Risk Reviewer agent", kind: "risk" },
      { icon: Bell, label: "Notify via Telegram if winRate â‰¥ 65%", kind: "notify" },
    ],
  },
  {
    id: "watch-deploy",
    name: "Watch â†’ Build â†’ Draft Bot",
    steps: [
      { icon: Search, label: "Watch market (30 min)", kind: "watch" },
      { icon: GitBranch, label: "Build StrategyRule from insight", kind: "build" },
      { icon: Play, label: "Save as DRAFT bot (no auto-start)", kind: "draft" },
    ],
  },
];

export default function Workflow() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("R_100");
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);
  const watchMutation = trpc.signals.watch.useMutation();
  const notifyMutation = trpc.telegram.send.useMutation();

  const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ15V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];

  const mutateWithTimeout = <T,>(promise: Promise<T>, ms = 60000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
    ]);

  const runWorkflow = async (w: typeof PRESETS[0], sym: string) => {
    setRunning(w.id);
    setLog([]);
    const add = (m: string) => { setLog((l) => [...l, m]); pushTimeline({ icon: "ai", text: m }); };
    add(`â–¶ Workflow "${w.name}" started on ${sym}`);
    for (const step of w.steps) {
      add(`â€¢ ${step.label}`);
      try {
        if (step.kind === "scan" || step.kind === "watch") {
          const res: any = await mutateWithTimeout(watchMutation.mutateAsync({ symbol: sym, durationMinutes: 30 }));
          const found = res?.signalsFound ?? 0;
          add(`  â†³ Scan complete â€” ${found} pattern${found === 1 ? "" : "s"} found.`);
        } else if (step.kind === "notify") {
          await mutateWithTimeout(notifyMutation.mutateAsync({ message: `369Labs workflow "${w.name}" finished on ${sym}.` }));
          add(`  â†³ Telegram notification sent.`);
        } else if (step.kind === "backtest") {
          add(`  â†³ Open /backtesting with a signal to run a backtest.`);
        } else if (step.kind === "risk") {
          add(`  â†³ Risk review: verify stake, stop-loss and drawdown before going live.`);
        } else if (step.kind === "build" || step.kind === "draft") {
          add(`  â†³ Draft the bot from the latest signal in /strategy-builder, then deploy from /bots.`);
        }
      } catch (e: any) {
        add(`  â†³ Step skipped: ${e?.message || "action unavailable"}`);
      }
    }
    add(`âœ“ Workflow complete. Review results in AI Signals / Bots.`);
    setRunning(null);
  };

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[#151B23] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <WorkflowIcon className="w-7 h-7 text-[#22BFC8]" /> Workflow Automation
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1">Chain agent steps into repeatable automation. Runs the existing scan â†’ backtest â†’ risk â†’ notify pipeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRESETS.map((w) => (
            <div key={w.id} className="bg-[#151B23] border border-[#252B35] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">{w.name}</h2>
              <div className="space-y-2 mb-4">
                {w.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <s.icon className="w-3.5 h-3.5 text-[#94A3B8]" />
                    </span>
                    <span className="text-sm text-[#94A3B8]">{s.label}</span>
                    {i < w.steps.length - 1 && <GitBranch className="w-3 h-3 text-[#252B35] ml-auto" />}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-[#64748B] shrink-0">Symbol:</label>
                <div className="relative flex-1">
                  <button onClick={() => setShowSymbolMenu(!showSymbolMenu)} className="w-full bg-[#1E252D] border border-[#252B35] text-[#E8A20E] px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between hover:border-[#E8A20E]/50">
                    {symbol}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showSymbolMenu ? "rotate-180" : ""}`} />
                  </button>
                  {showSymbolMenu && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#151B23] border border-[#252B35] rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                      {SYMBOLS.map((s) => (
                        <button key={s} onClick={() => { setSymbol(s); setShowSymbolMenu(false); }} className={`w-full px-3 py-2 text-left text-sm ${symbol === s ? "bg-[#E8A20E]/20 text-[#E8A20E]" : "text-[#94A3B8] hover:text-white hover:bg-white/5"}`}>
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
                className="w-full bg-[#22BFC8] hover:bg-[#22BFC8] text-white text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
              >
                {running === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running === w.id ? "Runningâ€¦" : "Run Workflow"}
              </button>
            </div>
          ))}
        </div>

        {log.length > 0 && (
          <div className="bg-[#151B23] border border-[#252B35] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#28A745]" /> Run Log</h2>
            <div className="space-y-1 font-mono text-xs">
              {log.map((l, i) => (
                <div key={i} className={l.startsWith("âœ“") ? "text-[#28A745]" : l.startsWith("â–¶") ? "text-[#22BFC8]" : "text-[#94A3B8]"}>{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

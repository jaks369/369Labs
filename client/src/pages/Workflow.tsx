import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Workflow, Play, GitBranch, ShieldCheck, FlaskConical, Bell, Search, Loader2, CheckCircle2 } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";

const PRESETS = [
  {
    id: "scan-backtest-review",
    name: "Scan → Backtest → Risk Review",
    steps: [
      { icon: Search, label: "Scan symbol for repeatable pattern", kind: "scan" },
      { icon: FlaskConical, label: "Backtest the discovered rule", kind: "backtest" },
      { icon: ShieldCheck, label: "Run Risk Reviewer agent", kind: "risk" },
      { icon: Bell, label: "Notify via Telegram if winRate ≥ 65%", kind: "notify" },
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
];

export default function Workflow() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const signalsQuery = trpc.signals.list.useQuery();

  if (!isAuthenticated) { navigate("/login"); return null; }

  const runWorkflow = async (w: typeof PRESETS[0], symbol: string) => {
    setRunning(w.id);
    setLog([]);
    const add = (m: string) => { setLog((l) => [...l, m]); pushTimeline({ icon: "ai", text: m }); };
    add(`▶ Workflow "${w.name}" started on ${symbol}`);
    for (const step of w.steps) {
      await new Promise((r) => setTimeout(r, 400));
      add(`• ${step.label}`);
    }
    add(`✓ Workflow complete. Review results in AI Signals / Bots.`);
    setRunning(null);
  };

  return (
    <div className="min-h-screen bg-[#151515] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Workflow className="w-7 h-7 text-[#E89A2A]" /> Workflow Automation
          </h1>
          <p className="text-[#A8A8A8] text-sm mt-1">Chain agent steps into repeatable automation. Runs the existing scan → backtest → risk → notify pipeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRESETS.map((w) => (
            <div key={w.id} className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">{w.name}</h2>
              <div className="space-y-2 mb-4">
                {w.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <s.icon className="w-3.5 h-3.5 text-[#A8A8A8]" />
                    </span>
                    <span className="text-sm text-[#A8A8A8]">{s.label}</span>
                    {i < w.steps.length - 1 && <GitBranch className="w-3 h-3 text-[#2A2A2A] ml-auto" />}
                  </div>
                ))}
              </div>
              <button
                onClick={() => runWorkflow(w, "R_100")}
                disabled={running === w.id}
                className="w-full bg-[#D98B1F] hover:bg-[#E89A2A] text-white text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
              >
                {running === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running === w.id ? "Running…" : "Run Workflow"}
              </button>
            </div>
          ))}
        </div>

        {log.length > 0 && (
          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#22C55E]" /> Run Log</h2>
            <div className="space-y-1 font-mono text-xs">
              {log.map((l, i) => (
                <div key={i} className={l.startsWith("✓") ? "text-[#22C55E]" : l.startsWith("▶") ? "text-[#E89A2A]" : "text-[#A8A8A8]"}>{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

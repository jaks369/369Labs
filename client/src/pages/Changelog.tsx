import { GitCommit, Bug, Sparkles, RefreshCw, Shield } from "lucide-react";

const ENTRIES = [
  { version: "2.1.0", date: "2026-07-20", items: [{ icon: Sparkles, text: "Onboarding flow for new users" }, { icon: Sparkles, text: "Watchlist with live price tracking" }, { icon: Sparkles, text: "Strategy comparison analytics" }, { icon: Bug, text: "Fixed 1HZ25V/1HZ75V invalid symbol error" }] },
  { version: "2.0.0", date: "2026-06-15", items: [{ icon: Sparkles, text: "AI Assistant with tool integration" }, { icon: RefreshCw, text: "Complete UI redesign with new components" }, { icon: Sparkles, text: "Cloud bot deployment and monitoring" }, { icon: Shield, text: "Risk management system added" }] },
  { version: "1.5.0", date: "2026-05-01", items: [{ icon: Sparkles, text: "Backtesting with parameter sweep" }, { icon: Bug, text: "Trade history pagination fix" }, { icon: RefreshCw, text: "Performance optimizations for large datasets" }] },
];

export default function Changelog() {
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <GitCommit className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Changelog</h1>
            <p className="text-xs text-[var(--text-muted)]">Release history for 369Labs</p>
          </div>
        </div>
        <div className="space-y-6">
          {ENTRIES.map((e) => (
            <div key={e.version} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">v{e.version}</span>
                <span className="text-xs text-[var(--text-muted)]">{e.date}</span>
              </div>
              <ul className="space-y-2">
                {e.items.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.icon === Bug ? "text-[var(--red)]" : item.icon === Sparkles ? "text-[var(--green)]" : item.icon === RefreshCw ? "text-[var(--amber)]" : "text-[var(--blue)]"}`} />
                      {item.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { BookOpen, Activity, Bot, BarChart3, Sparkles, Shield, Share2, Download } from "lucide-react";

const SECTIONS = [
  { icon: Activity, title: "Getting Started", content: "Register an account, verify your email, and complete the onboarding wizard. Connect a Deriv API token from Settings to access live market data." },
  { icon: Bot, title: "Building Strategies", content: "Use the visual Strategy Builder to create trading rules with IF/THEN blocks. Describe your idea to 369AI in the AI Assistant and let it generate the strategy for you." },
  { icon: BarChart3, title: "Backtesting", content: "Select a symbol, date range, and strategy. Run backtests to see win rate, profit factor, drawdown, and equity curves. Use Parameter Sweep to optimize settings." },
  { icon: Sparkles, title: "AI Assistant", content: "Ask 369AI to analyze markets, suggest strategies, run backtests, or place trades. The AI has tools to read live ticks, scan for patterns, and manage your portfolio." },
  { icon: Shield, title: "Risk Management", content: "Set daily loss limits, max trade amounts, and stop-loss/take-profit levels in Settings. The system will block trades that exceed your configured risk parameters." },
  { icon: Share2, title: "Cloud Bots", content: "Deploy strategies as 24/7 cloud bots. Configure symbol, stake, and risk rules. Monitor performance, view execution logs, and stop/start bots from the Bots page." },
  { icon: Download, title: "Data & Reports", content: "Export trade history as CSV, download backtest reports, import strategies via JSON. Use the Journal to log trade notes, upload screenshots, and get AI feedback." },
];

export default function UserGuide() {
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">User Guide</h1>
            <p className="text-xs text-[var(--text-muted)]">Everything you need to use 369Labs effectively</p>
          </div>
        </div>
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <details key={s.title} className="bg-[var(--card)] border border-[var(--border)] rounded-xl group">
                <summary className="flex items-center gap-3 p-5 cursor-pointer">
                  <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[var(--amber)]" />
                  </div>
                  <span className="text-sm font-bold text-white">{s.title}</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-[var(--text-secondary)] leading-relaxed">{s.content}</p>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

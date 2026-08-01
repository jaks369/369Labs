import { useLocation } from "wouter";
import { CandlestickChart, TrendingUp, GitBranch, Brain, Wallet } from "lucide-react";

const tabs = [
  { icon: CandlestickChart, label: "Markets", path: "/markets" },
  { icon: TrendingUp, label: "Terminal", path: "/dashboard" },
  { icon: GitBranch, label: "Strategies", path: "/strategy-builder" },
  { icon: Brain, label: "AI", path: "/ai-assistant" },
  { icon: Wallet, label: "Portfolio", path: "/portfolio" },
];

export default function MobileTabBar() {
  const [location, navigate] = useLocation();

  const isActive = (path: string) => {
    return location.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--card)] border-t border-[var(--border)] shadow-[0_-4px_16px_rgba(0,0,0,0.4)] md:hidden pb-safe">
      <div className="flex items-center justify-around h-14 px-2">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] min-h-[44px] ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <tab.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

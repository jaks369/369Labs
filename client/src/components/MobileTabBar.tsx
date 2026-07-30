import { useLocation } from "wouter";
import { Home, TrendingUp, Brain, MoreHorizontal, Activity } from "lucide-react";

const tabs = [
  { icon: Home, label: "Home", path: "/" },
  { icon: TrendingUp, label: "Trade", path: "/dashboard" },
  { icon: Brain, label: "Intelligence", path: "/ai-assistant" },
  { icon: MoreHorizontal, label: "More", path: "/more" },
];

export default function MobileTabBar() {
  const [location, navigate] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--card)] border-t border-[var(--border)] md:hidden">
      <div className="flex items-center justify-around h-14 px-2">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] ${
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

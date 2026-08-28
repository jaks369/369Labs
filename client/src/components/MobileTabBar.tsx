import { useLocation } from "wouter";
import { LayoutDashboard, Radar, Hash, Zap, Settings } from "lucide-react";

const tabs = [
  { icon: LayoutDashboard, label: "Terminal", path: "/dashboard" },
  { icon: Radar, label: "Concierge", path: "/concierge" },
  { icon: Hash, label: "Digits", path: "/digit-trader" },
  { icon: Zap, label: "Strategy", path: "/strategy-builder" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function MobileTabBar() {
  const [location, navigate] = useLocation();

  const isActive = (path: string) => {
    return location === path || location.startsWith(path + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)] border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.8)] md:hidden pb-safe">
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

import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MobileTabBar from "@/components/MobileTabBar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  Bot,
  Zap,
  Brain,
  CandlestickChart,
  Settings,
  Activity,
  MessageCircle,
  Home,
  FlaskConical,
  Command,
  BookOpen,
  RotateCcw,
  Workflow,
  Mic,
  Square,
  Code2,
  Wallet,
  BarChart3,
  Search,
  Shield,
  BookText,
  Book,
  Users,
  Crown,
  User,
  Star,
  GitCommit,
  Megaphone,
  HardDrive,
  Palette,
  Menu,
  X,
  ChevronRight,
  Keyboard,
  Radar,
  Layers,
  Hash,
} from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import AITimeline from "./AITimeline";
import { openCommandPalette } from "./CommandPalette";
import { useVoiceCommands } from "./useVoiceCommands";
import GlobalSearch from "./GlobalSearch";
import { useGlobalKeyboardNav } from "@/hooks/useKeyboardNav";
import KeyboardShortcuts from "./KeyboardShortcuts";

type NavItem = { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; path: string };
type NavGroup = { title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Trade",
    icon: Zap,
    items: [
      { icon: LayoutDashboard, label: "Terminal", path: "/dashboard" },
      { icon: CandlestickChart, label: "Markets", path: "/markets" },
      { icon: Book, label: "Order Book", path: "/order-book" },
      { icon: Radar, label: "Concierge", path: "/concierge" },
      { icon: Hash, label: "Digit Trader", path: "/digit-trader" },
      { icon: Star, label: "Watchlist", path: "/watchlist" },
      { icon: Wallet, label: "Portfolio", path: "/portfolio" },
      { icon: BarChart3, label: "Trade History", path: "/trades" },
      { icon: Shield, label: "Paper Trading", path: "/paper-trading" },
    ],
  },
  {
    title: "Automate",
    icon: Workflow,
    items: [
      { icon: Zap, label: "Strategy Builder", path: "/strategy-builder" },
      { icon: Bot, label: "Bots", path: "/bots" },
      { icon: FlaskConical, label: "Backtesting", path: "/backtesting" },
      { icon: RotateCcw, label: "Replay", path: "/replay" },
      { icon: Workflow, label: "Workflows", path: "/workflow" },
      { icon: Users, label: "Copy Trading", path: "/copy-trading" },
    ],
  },
  {
    title: "Intelligence",
    icon: Brain,
    items: [
      { icon: Brain, label: "369AI", path: "/ai-assistant" },
      { icon: Activity, label: "Market Intel", path: "/market-intelligence" },
      { icon: CandlestickChart, label: "AI Signals", path: "/marketplace" },
      { icon: BarChart3, label: "AI Performance", path: "/ai-performance" },
      { icon: Search, label: "AI Explainability", path: "/ai-explainability" },
    ],
  },
  {
    title: "Analyze",
    icon: BarChart3,
    items: [
      { icon: BarChart3, label: "Analytics", path: "/analytics" },
      { icon: BarChart3, label: "Strategy Comparison", path: "/strategy-comparison" },
      { icon: Layers, label: "Strategy Gallery", path: "/strategy-gallery" },
      { icon: Code2, label: "AI Coding", path: "/coding" },
      { icon: Zap, label: "Plugins", path: "/plugins" },
    ],
  },
  {
    title: "Account",
    icon: Settings,
    items: [
      { icon: Settings, label: "Settings", path: "/settings" },
      { icon: Users, label: "Team", path: "/team" },
      { icon: Crown, label: "Subscription", path: "/subscription" },
      { icon: HardDrive, label: "Backup", path: "/backup" },
      { icon: BookText, label: "API Docs", path: "/api-docs" },
      { icon: Palette, label: "Theme Preview", path: "/theme-preview" },
    ],
  },
  {
    title: "Resources",
    icon: BookOpen,
    items: [
      { icon: BookOpen, label: "User Guide", path: "/user-guide" },
      { icon: GitCommit, label: "Changelog", path: "/changelog" },
      { icon: Megaphone, label: "Release Notes", path: "/release-notes" },
    ],
  },
];

const menuItems: NavItem[] = navGroups.flatMap((g) => g.items);

// Aurora accent per group — pulls from the landing palette (teal/purple/magenta).
const groupAccent: Record<string, string> = {
  Trade: "var(--aurora-teal)",
  Automate: "var(--aurora-purple)",
  Intelligence: "var(--aurora-magenta)",
  Analyze: "var(--aurora-purple)",
  Account: "var(--aurora-green)",
  Resources: "var(--aurora-pink)",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full aurora-glass">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full card">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 bg-[var(--accent)] rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-[var(--bg)]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-center text-[var(--text-primary)]">
              369Labs Access
            </h1>
            <p className="text-[13px] text-[var(--text-secondary)] text-center max-w-sm">
              Please sign in to access your trading dashboard and automated bots.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="btn btn-primary w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

function NavDrawer({
  open,
  onClose,
  location,
  onNavigate,
  user,
  logout,
  voice,
  onOpenShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  location: string;
  onNavigate: (path: string) => void;
  user: any;
  logout: () => Promise<void> | void;
  voice: { listening: boolean; transcript: string; start: () => void; stop: () => void };
  onOpenShortcuts: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Persist the nav list scrollTop so deep links don't reset it on reopen.
  const navScrollRef = useRef<HTMLDivElement>(null);
  const NAV_SCROLL_KEY = "369labs.nav.scrollTop";
  useEffect(() => {
    if (!open) return;
    try {
      const saved = Number(localStorage.getItem(NAV_SCROLL_KEY) || "0");
      if (saved > 0 && navScrollRef.current) navScrollRef.current.scrollTop = saved;
    } catch { /* ignore */ }
  }, [open, location]);
  const persistNavScroll = useCallback(() => {
    if (navScrollRef.current) {
      try { localStorage.setItem(NAV_SCROLL_KEY, String(navScrollRef.current.scrollTop)); } catch { /* ignore */ }
    }
  }, []);

  if (!open) return null;

  const go = (path: string) => {
    onNavigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="animate-modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] flex flex-col shadow-2xl animate-slideInLeft aurora-glass-panel" style={{ background: "rgba(10,14,23,0.86)", borderRadius: 0 }}>
        {/* Aurora glow bleeding through the glass */}
        <div className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-40" style={{ background: "radial-gradient(circle, rgba(45,212,191,0.55) 0%, rgba(167,139,250,0.35) 45%, transparent 70%)", filter: "blur(28px)" }} />
        <div className="pointer-events-none absolute -bottom-20 -right-12 w-56 h-56 rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(232,121,249,0.5) 0%, rgba(167,139,250,0.3) 45%, transparent 70%)", filter: "blur(28px)" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[rgba(255,255,255,0.08)] shrink-0 relative">
          <button onClick={() => go("/dashboard")} className="flex items-center gap-2.5 transition-all cursor-pointer group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple), var(--aurora-magenta))' }}>
              <Activity className="w-5 h-5 text-[var(--cta-text)]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-white leading-none">369Labs</span>
              <span className="text-[9px] font-medium text-[var(--text-disabled)] tracking-wider uppercase mt-0.5">Trading Suite</span>
            </div>
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-colors" title="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Home - pinned above all groups */}
        <div className="px-2 pt-2 shrink-0 relative">
          <button
            onClick={() => go("/")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
              location === "/" ? "sidebar-item-active" : "sidebar-item"
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>
        </div>

        {/* Groups */}
        <div ref={navScrollRef} onScroll={persistNavScroll} className="flex-1 overflow-y-auto min-h-0 px-2 py-1 space-y-3">
          {navGroups.map((group) => {
            const accent = groupAccent[group.title] || "var(--accent)";
            const hasActiveChild = group.items.some((item) => item.path === location);
            return (
              <div key={group.title}>
                <div className="flex items-center gap-2 px-2 py-1">
                  <group.icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: hasActiveChild ? accent : "var(--text-muted)" }}>
                    {group.title}
                  </span>
                  {hasActiveChild && <span className="w-1 h-1 rounded-full" style={{ background: accent }} />}
                </div>
                <div className="mt-0.5 space-y-px">
                  {group.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => go(item.path)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left cursor-pointer ${
                          isActive
                            ? "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-hover)] font-semibold"
                            : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-white border border-transparent"
                        }`}
                      >
                        <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "" : "text-[var(--text-muted)]"}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer tools + account */}
        <div className="border-t border-[rgba(255,255,255,0.08)] p-2 space-y-1.5 shrink-0 relative">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { openCommandPalette(); onClose(); }}
              className="flex-1 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-150 group cursor-pointer"
            >
              <Command className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
              <span className="flex-1 text-left">Quick Command</span>
              <kbd className="text-[9px] text-[var(--text-disabled)] border border-[var(--border)] rounded px-1 py-0.5">⌘K</kbd>
            </button>
            <button
              onClick={() => { onOpenShortcuts(); onClose(); }}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
              title="Keyboard Shortcuts"
            >
              <Command className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors cursor-pointer ${
                voice.listening ? "border-[var(--red)]/40 bg-[var(--red)]/10 text-[var(--red)]" : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-white"
              }`}
              title={voice.listening ? "Stop voice commands" : "Voice commands"}
            >
              {voice.listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </div>
          {voice.listening && voice.transcript && (
            <p className="text-micro text-[var(--accent)] px-1 truncate">"{voice.transcript}"</p>
          )}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
            <AITimeline compact />
          </div>
          <button
            onClick={() => { go("/settings?tab=profile"); }}
            className="w-full flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.03] transition-all duration-150 text-left group cursor-pointer"
            title="Open profile settings"
          >
            <Avatar className="h-8 w-8 border border-[var(--border)] shrink-0">
              {(user as any)?.avatarUrl ? (
                <AvatarImage src={(user as any).avatarUrl} alt="Avatar" className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-[var(--accent)] text-[var(--cta-text)] text-[11px] font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-none">{user?.name || "Trader"}</p>
              <p className="text-[11px] text-[var(--text-disabled)] truncate mt-0.5">{user?.email || "Connected"}</p>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); logout(); window.location.href = "/"; }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); logout(); window.location.href = "/"; } }}
              className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--red)] transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const [riskDismissed, setRiskDismissed] = useState(() => {
    const saved = localStorage.getItem("risk-dismissed");
    return saved ? JSON.parse(saved) : false;
  });
  const voice = useVoiceCommands(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalKeyboardNav();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.shiftKey && e.key === "?") { e.preventDefault(); setShortcutsOpen(o => !o); } };
    const onShortcutsOpen = () => setShortcutsOpen(true);
    window.addEventListener("keydown", h);
    window.addEventListener("shortcuts:open", onShortcutsOpen);
    return () => { window.removeEventListener("keydown", h); window.removeEventListener("shortcuts:open", onShortcutsOpen); };
  }, []);

  const openNav = () => setNavOpen(true);

  return (
    <div className="flex h-screen flex-col overflow-x-hidden">
      {/* Global app top bar — single nav button + logo (desktop) */}
      <header className="hidden md:flex items-center gap-2 px-3 h-11 shrink-0 border-b border-[rgba(255,255,255,0.08)] aurora-glass" style={{ borderRadius: 0, borderTop: "none", borderLeft: "none", borderRight: "none" }}>
        <button
          onClick={openNav}
          className="flex items-center gap-1.5 px-2 h-8 rounded-lg border border-[rgba(255,255,255,0.10)] bg-white/5 text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Menu"
        >
          <Menu className="w-4 h-4" />
          <span className="text-xs font-bold hidden lg:inline">Menu</span>
        </button>
        <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-2 transition-all cursor-pointer group shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple), var(--aurora-magenta))' }}>
            <Activity className="w-4 h-4 text-[var(--cta-text)]" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">369Labs</span>
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button onClick={() => setGlobalSearchOpen(true)} className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Search (Ctrl+K)">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => { openCommandPalette(); }} className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Quick Command (⌘K)">
            <Command className="w-4 h-4" />
          </button>
          <button onClick={() => setShortcutsOpen(true)} className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Keyboard Shortcuts (?)">
            <Keyboard className="w-4 h-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={() => setLocation("/settings?tab=profile")} title="Open profile" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.03] transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                <Avatar className="h-7 w-7 border border-[var(--border)] shrink-0">
                  {(user as any)?.avatarUrl ? (
                    <AvatarImage src={(user as any).avatarUrl} alt="Avatar" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-[var(--accent)] text-[var(--cta-text)] text-[10px] font-bold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--text-primary)] shadow-lg">
              <DropdownMenuItem onClick={() => setLocation("/settings?tab=profile")} className="cursor-pointer text-[var(--text-primary)] focus:bg-white/[0.05]">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/subscription")} className="cursor-pointer text-[var(--text-primary)] focus:bg-white/[0.05]">
                <Crown className="mr-2 h-4 w-4" />
                <span>Subscription</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { await logout(); window.location.href = "/"; }} className="cursor-pointer text-[var(--red)] focus:text-[var(--red)] focus:bg-[var(--red)]/10">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile header — hamburger opens the same full menu */}
      {isMobile && (
        <div className="flex border-b border-[rgba(255,255,255,0.08)] h-12 items-center justify-between aurora-glass px-4 md:hidden shrink-0" style={{ borderRadius: 0 }}>
          <div className="flex items-center gap-2">
            <button onClick={openNav} className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors cursor-pointer" title="Menu">
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple), var(--aurora-magenta))' }}>
              <Activity className="w-3.5 h-3.5 text-[var(--cta-text)]" />
            </div>
            <span className="font-bold text-sm text-white">369Labs</span>
          </div>
          <button onClick={() => setGlobalSearchOpen(true)} className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Search">
            <Search className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className={`flex-1 overflow-y-auto min-h-0 flex flex-col ${isMobile ? "pb-24" : ""}`}>
        {!riskDismissed && (
          <div className="flex items-center gap-3 aurora-glass border-b border-[rgba(255,255,255,0.08)] px-4 py-1.5 text-micro leading-snug text-[var(--text-muted)] rounded-none shrink-0">
            <span className="font-semibold uppercase tracking-wider text-[var(--text-muted)]/60 shrink-0 text-[9px]">Risk</span>
            <span className="flex-1">
              Trading involves substantial risk. 369Labs is an analysis tool, not financial advice.
            </span>
            <button onClick={() => { setRiskDismissed(true); localStorage.setItem("risk-dismissed", "true"); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-semibold px-2 shrink-0 text-xs cursor-pointer">✕</button>
          </div>
        )}
        <div key={location} className="animate-page-fade flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </main>

      {isMobile && <MobileTabBar />}
      <NavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        location={location}
        onNavigate={setLocation}
        user={user}
        logout={logout}
        voice={voice}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <GlobalSearch open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

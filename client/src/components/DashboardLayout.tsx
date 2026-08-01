import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
  Bell,
  MessageCircle,
  MessageSquare,
  Home,
  FlaskConical,
  Command,
  Terminal,
  BookOpen,
  RotateCcw,
  Workflow,
  Mic,
  Square,
  Code2,
  Plug,
  Wallet,
  BarChart3,
  Search,
  Shield,
  Webhook,
  BookText,
  Book,
  Users,
  Crown,
  User,
  Star,
  FileText,
  GitCommit,
  Megaphone,
  HardDrive,
  PanelLeftClose,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import AITimeline from "./AITimeline";
import { openCommandPalette } from "./CommandPalette";
import { useVoiceCommands } from "./useVoiceCommands";
import GlobalSearch from "./GlobalSearch";
import { useGlobalKeyboardNav } from "@/hooks/useKeyboardNav";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { ChevronRight } from "lucide-react";

import { ChevronDown } from "lucide-react";

function CollapsibleSection({ defaultOpen = false, children }: { defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.02] transition-colors cursor-pointer">
        <span>Tools</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "block" : "hidden"} px-2 pb-2 space-y-1.5`}>
        {children}
      </div>
    </div>
  );
}

type NavItem = { icon: React.ComponentType<{ className?: string }>; label: string; path: string };
type NavGroup = { title: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Trade",
    icon: Zap,
    items: [
      { icon: LayoutDashboard, label: "Terminal", path: "/dashboard" },
      { icon: CandlestickChart, label: "Markets", path: "/markets" },
      { icon: Star, label: "Watchlist", path: "/watchlist" },
      { icon: Wallet, label: "Portfolio", path: "/portfolio" },
      { icon: BarChart3, label: "Trade History", path: "/trades" },
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
      { icon: Code2, label: "AI Coding", path: "/coding" },
      { icon: Plug, label: "Plugins", path: "/plugins" },
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

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
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

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const [riskDismissed, setRiskDismissed] = useState(() => {
    const saved = localStorage.getItem("risk-dismissed");
    return saved ? JSON.parse(saved) : false;
  });
  const voice = useVoiceCommands(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalKeyboardNav();

  // Collapsible groups state — auto-expand group containing active page
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("sidebar-expanded-groups");
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    const activeGroup = navGroups.find(g => g.items.some(item => item.path === location));
    return activeGroup ? { [activeGroup.title]: true } : { "Trade": true };
  });

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem("sidebar-expanded-groups", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.shiftKey && e.key === "?") { e.preventDefault(); setShortcutsOpen(o => !o); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <div className="flex min-h-screen bg-[var(--bg)] overflow-x-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="relative hidden md:block" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[var(--border)] bg-[var(--bg)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center border-b border-[var(--border)]">
            <div className="flex items-center gap-1 px-3">
              <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-2.5 transition-all cursor-pointer group flex-1 text-left">
                <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5 text-[#0A0C10]" />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col">
                    <span className="font-bold text-lg tracking-tight text-[var(--text-primary)]">
                      369Labs
                    </span>
                    <span className="text-[10px] font-medium text-[var(--text-disabled)] tracking-wider uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" />
                      Trading Terminal
                    </span>
                  </div>
                )}
              </button>
              {!isCollapsed && (
                <button onClick={() => setGlobalSearchOpen(true)} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Search (Ctrl+K)">
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={toggleSidebar} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}>
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            {/* Home - pinned above all groups */}
            {!isCollapsed && (
              <div className="mb-2 px-1">
                <button
                  onClick={() => setLocation("/")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                    location === "/" ? "sidebar-item-active" : "sidebar-item"
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span>Home</span>
                </button>
              </div>
            )}

            {navGroups.map((group) => {
              const isExpanded = expandedGroups[group.title] || false;
              const hasActiveChild = group.items.some(item => item.path === location);
              return (
              <div key={group.title} className="mb-1 px-1">
                {!isCollapsed && (
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                      hasActiveChild ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                    <span>{group.title}</span>
                  </button>
                )}
                {(isCollapsed || isExpanded) && (
                  <SidebarMenu className="gap-px">
                    {group.items.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className={`transition-all duration-150 ${
                              isActive
                                ? "sidebar-item-active"
                                : "sidebar-item"
                            }`}
                          >
                            <item.icon
                              className={isActive ? "text-[var(--accent)]" : ""}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                )}
              </div>
            );
            })}
            {user?.role === "admin" && (
              <div className="mb-1 px-1">
                {!isCollapsed && (
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="accent-dot accent-dot-accent" />
                    <p className="sidebar-label text-[var(--accent)]">Admin</p>
                  </div>
                )}
                <SidebarMenu className="gap-px">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location === "/admin"}
                      onClick={() => setLocation("/admin")}
                      tooltip="Admin Dashboard"
                      className="transition-all duration-150 sidebar-item"
                    >
                      <Shield />
                      <span>Admin Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="p-2 border-t border-[var(--border)] space-y-1.5">
            {!isCollapsed && (
              <CollapsibleSection defaultOpen={false}>
                <div className="space-y-1.5">
                  <button
                    onClick={() => openCommandPalette()}
                    className="w-full flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-150 group cursor-pointer"
                  >
                    <Command className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                    <span className="flex-1 text-left text-[13px]">Quick Command</span>
                    <kbd className="text-[9px] text-[var(--text-disabled)] border border-[var(--border)] rounded px-1 py-0.5">⌘K</kbd>
                  </button>

                  <button
                    onClick={() => (voice.listening ? voice.stop() : voice.start())}
                    className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-150 cursor-pointer ${
                      voice.listening
                        ? "border-[var(--red)]/40 bg-[var(--red)]/10 text-[var(--red)]"
                        : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {voice.listening ? <Square className="w-3.5 h-3.5 shrink-0" /> : <Mic className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 group-hover:text-[var(--accent)] transition-colors" />}
                    <span className="flex-1 text-left text-[13px]">{voice.listening ? "Listening…" : "Voice Commands"}</span>
                    {voice.listening && <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse-dot" />}
                  </button>
                  {voice.listening && voice.transcript && (
                    <p className="text-micro text-[var(--accent)] px-1 truncate">"{voice.transcript}"</p>
                  )}

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
                    <AITimeline compact />
                  </div>

                  <button onClick={() => setShortcutsOpen(true)} className="w-full flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 transition-all duration-150 group cursor-pointer text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <Command className="w-3.5 h-3.5 shrink-0 group-hover:text-[var(--accent)] transition-colors" />
                    <span className="flex-1 text-left">Keyboard Shortcuts</span>
                    <kbd className="text-[9px] text-[var(--text-disabled)] border border-[var(--border)] rounded px-1 py-0.5">?</kbd>
                  </button>
                </div>
              </CollapsibleSection>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button onClick={() => setLocation("/settings?tab=profile")} title="Open profile" className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.03] transition-all duration-150 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none">
                  <Avatar className="h-8 w-8 border border-[var(--border)] shrink-0">
                    {(user as any)?.avatarUrl ? (
                      <AvatarImage src={(user as any).avatarUrl} alt="Avatar" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-[var(--accent)] text-[#0A0C10] text-[11px] font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-none">
                        {user?.name || "Trader"}
                      </p>
                      <p className="text-[11px] text-[var(--text-disabled)] truncate mt-0.5">
                        {user?.email || "Connected"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--text-primary)] shadow-lg">
                <DropdownMenuItem
                  onClick={() => setLocation("/settings?tab=profile")}
                  className="cursor-pointer text-[var(--text-primary)] focus:bg-white/[0.05]"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/subscription")}
                  className="cursor-pointer text-[var(--text-primary)] focus:bg-white/[0.05]"
                >
                  <Crown className="mr-2 h-4 w-4" />
                  <span>Subscription</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => { await logout(); setLocation("/"); }}
                  className="cursor-pointer text-[var(--red)] focus:text-[var(--red)] focus:bg-[var(--red)]/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset className="bg-[var(--bg)] flex flex-col max-w-full">
        {/* Mobile header — hamburger opens sidebar sheet */}
        {isMobile && (
          <div className="flex border-b border-[var(--border)] h-12 items-center justify-between bg-[var(--bg)] px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-md" />
              <div className="w-6 h-6 bg-[var(--accent)] rounded flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-[#0A0C10]" />
              </div>
              <span className="font-bold text-sm text-[var(--text-primary)]">369Labs</span>
            </div>
          </div>
        )}
        <main className={`flex-1 overflow-y-auto ${isMobile ? "pb-16" : ""}`}>
          {!riskDismissed && (
            <div className="flex items-center gap-3 bg-[var(--bg)] border-b border-[var(--border)] px-4 py-1.5 text-micro leading-snug text-[var(--text-muted)]">
              <span className="font-semibold uppercase tracking-wider text-[var(--text-muted)]/60 shrink-0 text-[9px]">Risk</span>
              <span className="flex-1">
                Trading involves substantial risk. 369Labs is an analysis tool, not financial advice.
              </span>
              <button onClick={() => { setRiskDismissed(true); localStorage.setItem("risk-dismissed", "true"); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-semibold px-2 shrink-0 text-xs cursor-pointer">✕</button>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>
      {isMobile && <MobileTabBar />}
      <GlobalSearch open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}




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
  Coins,
  Book,
  Users,
  Crown,
  Star,
  FileText,
  GitCommit,
  Megaphone,
  HardDrive,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import AITimeline from "./AITimeline";
import { openCommandPalette } from "./CommandPalette";
import { useVoiceCommands } from "./useVoiceCommands";
import GlobalSearch from "./GlobalSearch";
import { useGlobalKeyboardNav } from "@/hooks/useKeyboardNav";
import KeyboardShortcuts from "./KeyboardShortcuts";

type NavItem = { icon: React.ComponentType<{ className?: string }>; label: string; path: string };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { icon: LayoutDashboard, label: "Command Center", path: "/dashboard" },
      { icon: Brain, label: "369AI Assistant", path: "/ai-assistant" },
    ],
  },
      {
        title: "Build",
        items: [
          { icon: Zap, label: "Strategy Builder", path: "/strategy-builder" },
          { icon: FlaskConical, label: "Backtesting", path: "/backtesting" },
          { icon: RotateCcw, label: "Replay", path: "/replay" },
          { icon: CandlestickChart, label: "AI Signals", path: "/marketplace" },
          { icon: Workflow, label: "Workflows", path: "/workflow" },
          { icon: Code2, label: "AI Coding", path: "/coding" },
          { icon: Plug, label: "Plugins", path: "/plugins" },
        ],
      },
    {
      title: "Operate",
      items: [
        { icon: Bot, label: "Bots", path: "/bots" },
        { icon: Wallet, label: "Portfolio", path: "/portfolio" },
        { icon: BarChart3, label: "Trade History", path: "/trade-history" },
        { icon: BarChart3, label: "AI Performance", path: "/ai-performance" },
        { icon: Activity, label: "Market Intel", path: "/market-intelligence" },
        { icon: Search, label: "AI Explainability", path: "/ai-explainability" },
        { icon: Bot, label: "AI Copilot", path: "/trading-copilot" },
        { icon: MessageSquare, label: "AI Chat", path: "/ai-chat" },
        { icon: Activity, label: "Analytics", path: "/analytics" },
        { icon: BookOpen, label: "Journal", path: "/journal" },
        { icon: Terminal, label: "Observability", path: "/logs" },
        { icon: Home, label: "Home", path: "/?home=1" },
        { icon: Coins, label: "Paper Trading", path: "/paper-trading" },
        { icon: Book, label: "Order Book", path: "/order-book" },
        { icon: Star, label: "Watchlist", path: "/watchlist" },
        { icon: BarChart3, label: "Strategy Comparison", path: "/strategy-comparison" },
        { icon: FileText, label: "Auto Reports", path: "/auto-reports" },
      ],
    },
  {
    title: "Connect",
    items: [
      { icon: MessageCircle, label: "Telegram", path: "/telegram" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
      { icon: Webhook, label: "Webhooks", path: "/webhooks" },
      { icon: BookText, label: "API Docs", path: "/api-docs" },
      { icon: Settings, label: "Settings", path: "/settings" },
      { icon: Users, label: "Team", path: "/team" },
      { icon: Crown, label: "Subscription", path: "/subscription" },
      { icon: BookOpen, label: "User Guide", path: "/user-guide" },
      { icon: GitCommit, label: "Changelog", path: "/changelog" },
      { icon: Megaphone, label: "Release Notes", path: "/release-notes" },
      { icon: HardDrive, label: "Backup", path: "/backup" },
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
            <div className="w-10 h-10 bg-[var(--amber)] rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-[var(--bg)]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-center text-[#E8ECF1]">
              369Labs Access
            </h1>
            <p className="text-[13px] text-[#8896A8] text-center max-w-sm">
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
  const [riskDismissed, setRiskDismissed] = useState(false);
  const voice = useVoiceCommands(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalKeyboardNav();

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
    <div className="flex min-h-screen bg-[var(--bg)]">
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[#1E2A38] bg-[var(--bg)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center border-b border-[#1E2A38]">
            <div className="flex items-center gap-1 px-3">
              <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-2.5 transition-all cursor-pointer group flex-1 text-left">
                <div className="w-7 h-7 bg-[var(--amber)] rounded-md flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4 text-[var(--bg)]" />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm tracking-tight text-[#E8ECF1]">
                      369Labs
                    </span>
                    <span className="text-[8px] font-medium text-[#5A6878] tracking-wider uppercase">Trading Terminal</span>
                  </div>
                )}
              </button>
              {!isCollapsed && (
                <button onClick={() => setGlobalSearchOpen(true)} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-all" title="Search (Ctrl+K)">
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            {navGroups.map((group) => {
              const sectionColor = group.title === "Workspace" ? "text-[var(--cyan)]" : group.title === "Build" ? "text-[var(--amber)]" : group.title === "Operate" ? "text-[var(--cyan)]" : "text-[#5A6878]";
              const dotColor = group.title === "Workspace" ? "accent-dot-cyan" : group.title === "Build" ? "accent-dot-amber" : group.title === "Operate" ? "accent-dot-cyan" : "accent-dot-green";
              return (
              <div key={group.title} className="mb-1.5">
                {!isCollapsed && (
                  <div className="flex items-center gap-1.5 px-3 mb-1">
                    <span className={`accent-dot ${dotColor}`} />
                    <p className={`text-[9px] font-semibold uppercase tracking-[0.08em] ${sectionColor}`}>
                      {group.title}
                    </p>
                  </div>
                )}
                <SidebarMenu className="px-1.5 gap-px">
                  {group.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-8 px-2.5 rounded-md transition-all duration-150 ${
                            isActive
                              ? "sidebar-item-active"
                              : "sidebar-item"
                          }`}
                        >
                          <item.icon
                            className={`h-4 w-4 ${isActive ? "text-[var(--amber)]" : ""}`}
                          />
                          <span className="text-[13px]">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            );
          })}
          {user?.role === "admin" && (
            <div className="mb-1.5">
              {!isCollapsed && (
                <div className="flex items-center gap-1.5 px-3 mb-1">
                  <span className="accent-dot accent-dot-amber" />
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">Admin</p>
                </div>
              )}
              <SidebarMenu className="px-1.5 gap-px">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={location === "/admin"}
                    onClick={() => setLocation("/admin")}
                    tooltip="Admin Dashboard"
                    className="h-8 px-2.5 rounded-md transition-all duration-150 sidebar-item"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="text-[13px]">Admin Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          )}
          </SidebarContent>

          <SidebarFooter className="p-2 border-t border-[#1E2A38] space-y-1.5">
            <button
              onClick={() => openCommandPalette()}
              className="w-full flex items-center gap-2 rounded-md border border-[#1E2A38] bg-[#111820] px-2.5 py-1.5 text-[11px] text-[#8896A8] hover:text-[#E8ECF1] hover:border-[#2A3A4A] transition-all duration-150 group cursor-pointer"
            >
              <Command className="w-3.5 h-3.5 text-[#5A6878] group-hover:text-[var(--amber)] transition-colors" />
              <span className="flex-1 text-left">Quick Command</span>
              <kbd className="text-[9px] text-[#5A6878] border border-[#1E2A38] rounded px-1 py-0.5">ΓîÿK</kbd>
            </button>

            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-all duration-150 cursor-pointer ${
                voice.listening
                  ? "border-[var(--red)]/40 bg-[var(--red)]/8 text-[var(--red)]"
                  : "border-[#1E2A38] bg-[#111820] text-[#8896A8] hover:text-[#E8ECF1] hover:border-[#2A3A4A] transition-all"
              }`}
            >
              {voice.listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#5A6878] group-hover:text-[var(--amber)] transition-colors" />}
              <span className="flex-1 text-left">{voice.listening ? "ListeningΓÇª" : "Voice Commands"}</span>
              {voice.listening && <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse-dot" />}
            </button>
            {voice.listening && voice.transcript && (
              <p className="text-[10px] text-[var(--amber)] px-1 truncate">"{voice.transcript}"</p>
            )}

            {!isCollapsed && (
              <div className="rounded-md border border-[#1E2A38] bg-[#111820] p-2">
                <AITimeline compact />
              </div>
            )}

            {!isCollapsed && (
              <button onClick={() => setShortcutsOpen(true)} className="w-full flex items-center gap-2 rounded-md border border-[#1E2A38] bg-[#111820] px-2.5 py-1.5 text-[11px] text-[#5A6878] hover:text-[#E8ECF1] hover:border-[#2A3A4A] transition-all duration-150 group cursor-pointer">
                <Command className="w-3.5 h-3.5 group-hover:text-[var(--amber)] transition-colors" />
                <span className="flex-1 text-left">Keyboard Shortcuts</span>
                <kbd className="text-[9px] text-[#5A6878] border border-[#1E2A38] rounded px-1 py-0.5">?</kbd>
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03] transition-all duration-150 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--amber)] focus-visible:outline-none">
                  <Avatar className="h-6 w-6 border border-[#1E2A38] shrink-0">
                    {(user as any)?.avatarUrl ? (
                      <AvatarImage src={(user as any).avatarUrl} alt="Avatar" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-[var(--amber)] text-[var(--bg)] text-[9px] font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#E8ECF1] truncate leading-none">
                        {user?.name || "Trader"}
                      </p>
                      <p className="text-[10px] text-[#5A6878] truncate mt-0.5">
                        {user?.email || "Connected"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-[#111820] border-[#1E2A38] text-[#E8ECF1] shadow-lg">
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

      <SidebarInset className="bg-[var(--bg)] flex flex-col">
        {isMobile && (
          <div className="flex border-b border-[#1E2A38] h-12 items-center justify-between bg-[var(--bg)] px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="text-[#8896A8]" />
              <span className="font-semibold text-[#E8ECF1] text-[13px]">
                {activeMenuItem?.label ?? "Menu"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          {!riskDismissed && (
            <div className="flex items-center gap-3 bg-[var(--bg)] border-b border-[#1E2A38] px-4 py-1.5 text-[10px] leading-snug text-[#5A6878]">
              <span className="font-semibold uppercase tracking-wider text-[#5A6878]/60 shrink-0 text-[9px]">Risk</span>
              <span className="flex-1">
                Trading involves substantial risk. 369Labs is an analysis tool, not financial advice.
              </span>
              <button onClick={() => setRiskDismissed(true)} className="text-[#5A6878] hover:text-[#E8ECF1] transition-colors font-semibold px-2 shrink-0 text-xs cursor-pointer">Γ£ò</button>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>
      <GlobalSearch open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}




import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import AITimeline from "./AITimeline";
import { openCommandPalette } from "./CommandPalette";
import { useVoiceCommands } from "./useVoiceCommands";

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
        { icon: Activity, label: "Analytics", path: "/analytics" },
        { icon: BookOpen, label: "Journal", path: "/journal" },
        { icon: Terminal, label: "Observability", path: "/logs" },
        { icon: Home, label: "Home", path: "/?home=1" },
      ],
    },
  {
    title: "Connect",
    items: [
      { icon: MessageCircle, label: "Telegram", path: "/telegram" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
      { icon: Settings, label: "Settings", path: "/settings" },
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
      <div className="flex items-center justify-center min-h-screen bg-[#151B23]">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full glass-card">
          <div className="flex flex-col items-center gap-6">
            <div className="w-12 h-12 bg-[#F59E0B] rounded-xl flex items-center justify-center shadow-lg shadow-[#F59E0B]/20">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center text-white">
              369Labs Access
            </h1>
            <p className="text-sm text-[#94A3B8] text-center max-w-sm">
              Please sign in to access your trading dashboard and automated bots.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full btn-primary"
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
    <div className="flex min-h-screen bg-[#151B23]">
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[#252B35] bg-[#151B23]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center border-b border-[#252B35]">
            <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-3 px-4 transition-all w-full text-left cursor-pointer">
              <div className="w-8 h-8 bg-[#F59E0B] rounded flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 text-white" />
              </div>
              {!isCollapsed && (
                <span className="font-bold text-lg tracking-tight text-white truncate">
                  369Labs
                </span>
              )}
            </button>
          </SidebarHeader>

          <SidebarContent className="py-4">
            {navGroups.map((group) => (
              <div key={group.title} className="mb-3">
                {!isCollapsed && (
                  <p className="px-4 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    {group.title}
                  </p>
                )}
                <SidebarMenu className="px-3 gap-1">
                  {group.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-10 px-3 rounded-md transition-all ${
                            isActive
                              ? "bg-[#F59E0B]/10 text-[#F59E0B] font-semibold"
                              : "text-[#94A3B8] hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <item.icon
                            className={`h-5 w-5 ${isActive ? "text-[#F59E0B]" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-[#252B35] space-y-3">
            <button
              onClick={() => openCommandPalette()}
              className="w-full flex items-center gap-2 rounded-md border border-[#252B35] bg-[#151B23] px-3 py-2 text-xs text-[#94A3B8] hover:text-white hover:border-[#F59E0B]/50 transition-colors"
            >
              <Command className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Command Center</span>
              <kbd className="text-[9px] border border-[#252B35] rounded px-1">⌘K</kbd>
            </button>

            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              className={`w-full flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                voice.listening
                  ? "border-[#EF4444]/50 bg-[#EF4444]/10 text-[#EF4444] animate-pulse"
                  : "border-[#252B35] bg-[#151B23] text-[#94A3B8] hover:text-white hover:border-[#F59E0B]/50"
              }`}
            >
              {voice.listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span className="flex-1 text-left">{voice.listening ? "Listening…" : "Voice Command"}</span>
            </button>
            {voice.listening && voice.transcript && (
              <p className="text-[10px] text-[#FBBF24] px-1 truncate">“{voice.transcript}”</p>
            )}

            {!isCollapsed && (
              <div className="rounded-md border border-[#252B35] bg-[#151B23] p-2.5">
                <AITimeline compact />
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-8 w-8 border border-[#252B35] shrink-0">
                    <AvatarFallback className="bg-[#F59E0B] text-white text-xs font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate leading-none">
                        {user?.name || "Trader"}
                      </p>
                      <p className="text-xs text-[#64748B] truncate mt-1">
                        {user?.email || "Connected"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-[#151B23] border-[#252B35] text-white">
                <DropdownMenuItem
                  onClick={async () => { await logout(); setLocation("/"); }}
                  className="cursor-pointer text-[#EF4444] focus:text-[#EF4444] focus:bg-[#EF4444]/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset className="bg-[#151B23] flex flex-col">
        {isMobile && (
          <div className="flex border-b border-[#252B35] h-16 items-center justify-between bg-[#151B23] px-4 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-[#94A3B8]" />
              <span className="font-bold text-white">
                {activeMenuItem?.label ?? "Menu"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          {!riskDismissed && (
            <div className="flex items-center gap-3 bg-[#0B0F14] border-b border-[#252B35] px-4 py-1 text-[10px] leading-snug text-[#64748B]">
              <span className="font-bold uppercase tracking-wider text-[#64748B]/80 shrink-0">Risk</span>
              <span className="flex-1">
                Trading involves substantial risk. 369Labs is an analysis tool, not financial advice. Never trade with money you cannot afford to lose, and verify every strategy on a demo account first.
              </span>
              <button onClick={() => setRiskDismissed(true)} className="text-[#64748B] hover:text-white font-bold px-2 shrink-0">✕</button>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}



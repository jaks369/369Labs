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
        { icon: Wallet, label: "Portfolio", path: "/portfolio" },
        { icon: BarChart3, label: "AI Performance", path: "/ai-performance" },
        { icon: Activity, label: "Market Intel", path: "/market-intelligence" },
        { icon: Search, label: "AI Explainability", path: "/ai-explainability" },
        { icon: Bot, label: "AI Copilot", path: "/trading-copilot" },
        { icon: MessageSquare, label: "AI Chat", path: "/ai-chat" },
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
      <div className="flex items-center justify-center min-h-screen bg-[#0A0E14]">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full glass-card">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 bg-[#E8A20E] rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#0A0E14]" />
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
    <div className="flex min-h-screen bg-[#0A0E14]">
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[#1E2A38] bg-[#0A0E14]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center border-b border-[#1E2A38]">
            <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-2.5 px-3 transition-all w-full text-left cursor-pointer group">
              <div className="w-7 h-7 bg-[#E8A20E] rounded-md flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-[#0A0E14]" />
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
          </SidebarHeader>

          <SidebarContent className="py-2">
            {navGroups.map((group) => {
              const sectionColor = group.title === "Workspace" ? "text-[#22BFC8]" : group.title === "Build" ? "text-[#E8A20E]" : group.title === "Operate" ? "text-[#22BFC8]" : "text-[#5A6878]";
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
                            className={`h-4 w-4 ${isActive ? "text-[#E8A20E]" : ""}`}
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
          </SidebarContent>

          <SidebarFooter className="p-2 border-t border-[#1E2A38] space-y-1.5">
            <button
              onClick={() => openCommandPalette()}
              className="w-full flex items-center gap-2 rounded-md border border-[#1E2A38] bg-[#111820] px-2.5 py-1.5 text-[11px] text-[#8896A8] hover:text-[#E8ECF1] hover:border-[#2A3A4A] transition-all duration-150 group cursor-pointer"
            >
              <Command className="w-3.5 h-3.5 text-[#5A6878] group-hover:text-[#E8A20E] transition-colors" />
              <span className="flex-1 text-left">Quick Command</span>
              <kbd className="text-[9px] text-[#5A6878] border border-[#1E2A38] rounded px-1 py-0.5">ΓîÿK</kbd>
            </button>

            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-all duration-150 cursor-pointer ${
                voice.listening
                  ? "border-[#DC3545]/40 bg-[#DC3545]/8 text-[#DC3545]"
                  : "border-[#1E2A38] bg-[#111820] text-[#8896A8] hover:text-[#E8ECF1] hover:border-[#2A3A4A] transition-all"
              }`}
            >
              {voice.listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#5A6878] group-hover:text-[#E8A20E] transition-colors" />}
              <span className="flex-1 text-left">{voice.listening ? "ListeningΓÇª" : "Voice Commands"}</span>
              {voice.listening && <span className="w-1.5 h-1.5 rounded-full bg-[#DC3545] animate-pulse-dot" />}
            </button>
            {voice.listening && voice.transcript && (
              <p className="text-[10px] text-[#E8A20E] px-1 truncate">"{voice.transcript}"</p>
            )}

            {!isCollapsed && (
              <div className="rounded-md border border-[#1E2A38] bg-[#111820] p-2">
                <AITimeline compact />
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03] transition-all duration-150 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#E8A20E] focus-visible:outline-none">
                  <Avatar className="h-6 w-6 border border-[#1E2A38] shrink-0">
                    <AvatarFallback className="bg-[#E8A20E] text-[#0A0E14] text-[9px] font-bold">
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
                  className="cursor-pointer text-[#DC3545] focus:text-[#DC3545] focus:bg-[#DC3545]/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset className="bg-[#0A0E14] flex flex-col">
        {isMobile && (
          <div className="flex border-b border-[#1E2A38] h-12 items-center justify-between bg-[#0A0E14] px-4 sticky top-0 z-40">
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
            <div className="flex items-center gap-3 bg-[#0A0E14] border-b border-[#1E2A38] px-4 py-1.5 text-[10px] leading-snug text-[#5A6878]">
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
    </div>
  );
}




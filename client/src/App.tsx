import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastViewport, useToast } from "@/components/Toast";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import CommandPalette from "./components/CommandPalette";

import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import AIAssistant from "./pages/AIAssistant";
import Marketplace from "./pages/Marketplace";
import Notifications from "./pages/Notifications";
import Telegram from "./pages/Telegram";
import Bots from "./pages/Bots";
import TradeHistory from "./pages/TradeHistory";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Logs from "./pages/Logs";
import Journal from "./pages/Journal";
import Replay from "./pages/Replay";
import Workflow from "./pages/Workflow";
import Plugins from "./pages/Plugins";
import AIPerformance from "./pages/AIPerformance";
import AIExplainability from "./pages/AIExplainability";
import OAuthCallback from "./pages/OAuthCallback";
import Admin from "./pages/Admin";
import WebhooksPage from "./pages/Webhooks";
import ApiDocs from "./pages/ApiDocs";

import TeamPage from "./pages/TeamPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import Onboarding from "./pages/Onboarding";
import Watchlist from "./pages/Watchlist";
import UserGuide from "./pages/UserGuide";
import Changelog from "./pages/Changelog";
import ReleaseNotes from "./pages/ReleaseNotes";
import StrategyComparison from "./pages/StrategyComparison";
import StrategyEnginePage from "./pages/StrategyEngine";
import AutoReports from "./pages/AutoReports";
import ServerError from "./pages/ServerError";
import BackupRestore from "./pages/BackupRestore";
import PaperTrading from "./pages/PaperTrading";
import OrderBook from "./pages/OrderBook";
import ThemePreview from "./pages/ThemePreview";
import ServerStatusBanner from "./components/ServerStatusBanner";

const LazyBacktesting = lazy(() => import("./pages/Backtesting"));
const LazyAnalytics = lazy(() => import("./pages/Analytics"));
const LazyCloudBots = lazy(() => import("./pages/CloudBots"));
const LazyStrategyBuilder = lazy(() => import("./pages/StrategyBuilder"));
const LazyPortfolio = lazy(() => import("./pages/Portfolio"));
const LazyMarketIntelligence = lazy(() => import("./pages/MarketIntelligence"));
const LazyCoding = lazy(() => import("./pages/Coding"));
const LazyConcierge = lazy(() => import("./pages/Concierge"));
const LazyCopyTrading = lazy(() => import("./pages/CopyTrading"));
const LazyStrategyGallery = lazy(() => import("./pages/StrategyGallery"));
const LazyDigitTrader = lazy(() => import("./pages/DigitTrader"));

const LazyLoad = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="h-8 w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}>{children}</Suspense>
);

const LazyMarkets = lazy(() => import("./pages/Markets"));

function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const scrollRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const saved = scrollRef.current.get(location);
    if (saved !== undefined) {
      window.scrollTo({ top: saved, behavior: "auto" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location]);

  const handleScroll = () => {
    scrollRef.current.set(location, window.scrollY);
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location]);

  return (
    <div key={location} className="animate-page-fade min-h-screen">
      {children}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"}><PageTransition><Home /></PageTransition></Route>
      <Route path={"/how-it-works"}><Redirect to={"/"} /></Route>
      <Route path={"/369ai"}><Redirect to={"/"} /></Route>
      <Route path={"/pricing"}><Redirect to={"/"} /></Route>
      <Route path={"/login"}><PageTransition><Login /></PageTransition></Route>
      <Route path={"/forgot-password"}><PageTransition><ForgotPassword /></PageTransition></Route>
      <Route path={"/reset"}><PageTransition><ResetPassword /></PageTransition></Route>
      <Route path={"/verify-email"}><PageTransition><VerifyEmail /></PageTransition></Route>
      <Route path={"/oauth/callback"}><PageTransition><OAuthCallback /></PageTransition></Route>
      <Route path={"/onboarding"}><PageTransition><Onboarding /></PageTransition></Route>
      <Route path={"/500"}><PageTransition><ServerError /></PageTransition></Route>
      <Route path={"/dashboard"}><AppLayout><RouteErrorBoundary route="dashboard"><Dashboard /></RouteErrorBoundary></AppLayout></Route>
      <Route path={"/markets"}><AppLayout><LazyLoad><LazyMarkets /></LazyLoad></AppLayout></Route>
      <Route path={"/order-book"}><AppLayout><OrderBook /></AppLayout></Route>
      <Route path={"/paper-trading"}><AppLayout><PaperTrading /></AppLayout></Route>
      <Route path={"/theme-preview"}><AppLayout><ThemePreview /></AppLayout></Route>
      <Route path={"/bots"}><AppLayout><RouteErrorBoundary route="bots"><Bots /></RouteErrorBoundary></AppLayout></Route>
      <Route path={"/portfolio"}><AppLayout><LazyLoad><LazyPortfolio /></LazyLoad></AppLayout></Route>
      <Route path={"/strategy-builder"}><AppLayout><LazyLoad><LazyStrategyBuilder /></LazyLoad></AppLayout></Route>
      <Route path={"/telegram"}><AppLayout><Telegram /></AppLayout></Route>
      <Route path={"/notifications"}><AppLayout><Notifications /></AppLayout></Route>
      <Route path={"/settings"}><AppLayout><Settings /></AppLayout></Route>
      <Route path={"/settings/:section"}><AppLayout><Settings /></AppLayout></Route>
      <Route path={"/admin"}><AppLayout><Admin /></AppLayout></Route>
      <Route path={"/marketplace"}><Redirect to={"/ai-signals"} /></Route>
      <Route path={"/ai-signals"}><AppLayout><Marketplace /></AppLayout></Route>
      <Route path={"/backtesting"}><AppLayout><LazyLoad><LazyBacktesting /></LazyLoad></AppLayout></Route>
      <Route path={"/analytics"}><AppLayout><LazyLoad><LazyAnalytics /></LazyLoad></AppLayout></Route>
      <Route path={"/cloud-bots"}><AppLayout><LazyLoad><LazyCloudBots /></LazyLoad></AppLayout></Route>
      <Route path={"/ai-assistant"}><AppLayout><RouteErrorBoundary route="ai-assistant"><AIAssistant /></RouteErrorBoundary></AppLayout></Route>
      <Route path={"/trades"}><AppLayout><RouteErrorBoundary route="trades"><TradeHistory /></RouteErrorBoundary></AppLayout></Route>
      <Route path={"/logs"}><AppLayout><Logs /></AppLayout></Route>
      <Route path={"/journal"}><AppLayout><Journal /></AppLayout></Route>
      <Route path={"/replay"}><AppLayout><Replay /></AppLayout></Route>
      <Route path={"/workflow"}><AppLayout><Workflow /></AppLayout></Route>
      <Route path={"/coding"}><AppLayout><LazyLoad><LazyCoding /></LazyLoad></AppLayout></Route>
      <Route path={"/concierge"}><AppLayout><LazyLoad><RouteErrorBoundary route="concierge"><LazyConcierge /></RouteErrorBoundary></LazyLoad></AppLayout></Route>
      <Route path={"/copy-trading"}><AppLayout><LazyLoad><LazyCopyTrading /></LazyLoad></AppLayout></Route>
      <Route path={"/strategy-gallery"}><AppLayout><LazyLoad><LazyStrategyGallery /></LazyLoad></AppLayout></Route>
      <Route path={"/digit-trader"}><AppLayout><LazyLoad><RouteErrorBoundary route="digit-trader"><LazyDigitTrader /></RouteErrorBoundary></LazyLoad></AppLayout></Route>
      <Route path={"/plugins"}><AppLayout><Plugins /></AppLayout></Route>
      <Route path={"/webhooks"}><AppLayout><WebhooksPage /></AppLayout></Route>
      <Route path={"/api-docs"}><AppLayout><ApiDocs /></AppLayout></Route>
      <Route path={"/ai-performance"}><AppLayout><AIPerformance /></AppLayout></Route>
      <Route path={"/ai-explainability"}><AppLayout><AIExplainability /></AppLayout></Route>
      <Route path={"/trading-copilot"}><Redirect to={"/ai-assistant"} /></Route>
      <Route path={"/ai-chat"}><Redirect to={"/ai-assistant"} /></Route>
      <Route path={"/market-intelligence"}><AppLayout><LazyLoad><LazyMarketIntelligence /></LazyLoad></AppLayout></Route>

      <Route path={"/team"}><AppLayout><TeamPage /></AppLayout></Route>
      <Route path={"/subscription"}><AppLayout><SubscriptionPage /></AppLayout></Route>
      <Route path={"/watchlist"}><AppLayout><Watchlist /></AppLayout></Route>
      <Route path={"/user-guide"}><AppLayout><UserGuide /></AppLayout></Route>
      <Route path={"/changelog"}><AppLayout><Changelog /></AppLayout></Route>
      <Route path={"/release-notes"}><AppLayout><ReleaseNotes /></AppLayout></Route>
      <Route path={"/strategy-comparison"}><AppLayout><StrategyComparison /></AppLayout></Route>
      <Route path={"/strategy-engine"}><AppLayout><StrategyEnginePage /></AppLayout></Route>
      <Route path={"/auto-reports"}><AppLayout><AutoReports /></AppLayout></Route>
      <Route path={"/backup"}><AppLayout><BackupRestore /></AppLayout></Route>
      <Route path={"/404"}><PageTransition><NotFound /></PageTransition></Route>
      <Route><PageTransition><NotFound /></PageTransition></Route>
    </Switch>
  );
}

function App() {
  const [toasts, setToasts] = useState<{ id: number; kind: any; text: string }[]>([]);
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    return () => { toastTimers.current.forEach((t) => clearTimeout(t)); };
  }, []);
  useToast((t) => {
    setToasts((prev) => [...prev, t]);
    const tid = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
      toastTimers.current.delete(t.id);
    }, 4000);
    toastTimers.current.set(t.id, tid);
  });
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <ServerStatusBanner />
          <Toaster />
          <Router />
          <CommandPalette />
          <ToastViewport items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

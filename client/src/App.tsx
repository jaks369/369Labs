import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastViewport, useToast } from "@/components/Toast";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
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
import AIChatPage from "./pages/AIChat";
import OAuthCallback from "./pages/OAuthCallback";
import Admin from "./pages/Admin";
import WebhooksPage from "./pages/Webhooks";
import ApiDocs from "./pages/ApiDocs";
import PaperTrading from "./pages/PaperTrading";
import OrderBook from "./pages/OrderBook";
import TeamPage from "./pages/TeamPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import Onboarding from "./pages/Onboarding";
import Watchlist from "./pages/Watchlist";
import UserGuide from "./pages/UserGuide";
import Changelog from "./pages/Changelog";
import ReleaseNotes from "./pages/ReleaseNotes";
import StrategyComparison from "./pages/StrategyComparison";
import AutoReports from "./pages/AutoReports";
import ServerError from "./pages/ServerError";
import BackupRestore from "./pages/BackupRestore";

const LazyBacktesting = lazy(() => import("./pages/Backtesting"));
const LazyAnalytics = lazy(() => import("./pages/Analytics"));
const LazyCloudBots = lazy(() => import("./pages/CloudBots"));
const LazyStrategyBuilder = lazy(() => import("./pages/StrategyBuilder"));
const LazyPortfolio = lazy(() => import("./pages/Portfolio"));
const LazyMarketIntelligence = lazy(() => import("./pages/MarketIntelligence"));
const LazyCoding = lazy(() => import("./pages/Coding"));
const LazyTradingCopilot = lazy(() => import("./pages/TradingCopilot"));

const LazyLoad = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="h-8 w-8 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" /></div>}>{children}</Suspense>
);

function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/forgot-password"} component={ForgotPassword} />
      <Route path={"/reset"} component={ResetPassword} />
      <Route path={"/verify-email"} component={VerifyEmail} />
      <Route path={"/oauth/callback"} component={OAuthCallback} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/500"} component={ServerError} />
      <Route path={"/dashboard"}><AppLayout><Dashboard /></AppLayout></Route>
      <Route path={"/bots"}><AppLayout><Bots /></AppLayout></Route>
      <Route path={"/portfolio"}><AppLayout><LazyLoad><LazyPortfolio /></LazyLoad></AppLayout></Route>
      <Route path={"/strategy-builder"}><AppLayout><LazyLoad><LazyStrategyBuilder /></LazyLoad></AppLayout></Route>
      <Route path={"/telegram"}><AppLayout><Telegram /></AppLayout></Route>
      <Route path={"/notifications"}><AppLayout><Notifications /></AppLayout></Route>
      <Route path={"/settings"}><AppLayout><Settings /></AppLayout></Route>
      <Route path={"/admin"}><AppLayout><Admin /></AppLayout></Route>
      <Route path={"/marketplace"}><AppLayout><Marketplace /></AppLayout></Route>
      <Route path={"/backtesting"}><AppLayout><LazyLoad><LazyBacktesting /></LazyLoad></AppLayout></Route>
      <Route path={"/analytics"}><AppLayout><LazyLoad><LazyAnalytics /></LazyLoad></AppLayout></Route>
      <Route path={"/cloud-bots"}><AppLayout><LazyLoad><LazyCloudBots /></LazyLoad></AppLayout></Route>
      <Route path={"/ai-assistant"}><AppLayout><AIAssistant /></AppLayout></Route>
      <Route path={"/trades"}><AppLayout><TradeHistory /></AppLayout></Route>
      <Route path={"/logs"}><AppLayout><Logs /></AppLayout></Route>
      <Route path={"/journal"}><AppLayout><Journal /></AppLayout></Route>
      <Route path={"/replay"}><AppLayout><Replay /></AppLayout></Route>
      <Route path={"/workflow"}><AppLayout><Workflow /></AppLayout></Route>
      <Route path={"/coding"}><AppLayout><LazyLoad><LazyCoding /></LazyLoad></AppLayout></Route>
      <Route path={"/plugins"}><AppLayout><Plugins /></AppLayout></Route>
      <Route path={"/webhooks"}><AppLayout><WebhooksPage /></AppLayout></Route>
      <Route path={"/api-docs"}><AppLayout><ApiDocs /></AppLayout></Route>
      <Route path={"/ai-performance"}><AppLayout><AIPerformance /></AppLayout></Route>
      <Route path={"/ai-explainability"}><AppLayout><AIExplainability /></AppLayout></Route>
      <Route path={"/trading-copilot"}><AppLayout><LazyLoad><LazyTradingCopilot /></LazyLoad></AppLayout></Route>
      <Route path={"/ai-chat"}><AppLayout><AIChatPage /></AppLayout></Route>
      <Route path={"/market-intelligence"}><AppLayout><LazyLoad><LazyMarketIntelligence /></LazyLoad></AppLayout></Route>
      <Route path={"/paper-trading"}><AppLayout><PaperTrading /></AppLayout></Route>
      <Route path={"/order-book"}><AppLayout><OrderBook /></AppLayout></Route>
      <Route path={"/team"}><AppLayout><TeamPage /></AppLayout></Route>
      <Route path={"/subscription"}><AppLayout><SubscriptionPage /></AppLayout></Route>
      <Route path={"/watchlist"}><AppLayout><Watchlist /></AppLayout></Route>
      <Route path={"/user-guide"}><AppLayout><UserGuide /></AppLayout></Route>
      <Route path={"/changelog"}><AppLayout><Changelog /></AppLayout></Route>
      <Route path={"/release-notes"}><AppLayout><ReleaseNotes /></AppLayout></Route>
      <Route path={"/strategy-comparison"}><AppLayout><StrategyComparison /></AppLayout></Route>
      <Route path={"/auto-reports"}><AppLayout><AutoReports /></AppLayout></Route>
      <Route path={"/backup"}><AppLayout><BackupRestore /></AppLayout></Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
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

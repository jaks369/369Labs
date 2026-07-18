import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastViewport, useToast } from "@/components/Toast";
import { useState } from "react";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import CommandPalette from "./components/CommandPalette";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import StrategyBuilder from "./pages/StrategyBuilder";
import Settings from "./pages/Settings";
import AIAssistant from "./pages/AIAssistant";
import Marketplace from "./pages/Marketplace";
import Notifications from "./pages/Notifications";
import Telegram from "./pages/Telegram";
import Backtesting from "./pages/Backtesting";
import Analytics from "./pages/Analytics";
import CloudBots from "./pages/CloudBots";
import Bots from "./pages/Bots";
import TradeHistory from "./pages/TradeHistory";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Logs from "./pages/Logs";
import Journal from "./pages/Journal";
import Replay from "./pages/Replay";
import Workflow from "./pages/Workflow";
import Coding from "./pages/Coding";
import Plugins from "./pages/Plugins";

function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/reset"} component={ResetPassword} />
      <Route path={"/dashboard"}>
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path={"/bots"}>
        <AppLayout><Bots /></AppLayout>
      </Route>
      <Route path={"/strategy-builder"}>
        <AppLayout><StrategyBuilder /></AppLayout>
      </Route>
      <Route path={"/telegram"}>
        <AppLayout><Telegram /></AppLayout>
      </Route>
      <Route path={"/notifications"}>
        <AppLayout><Notifications /></AppLayout>
      </Route>
      <Route path={"/settings"}>
        <AppLayout><Settings /></AppLayout>
      </Route>
      <Route path={"/marketplace"}>
        <AppLayout><Marketplace /></AppLayout>
      </Route>
      <Route path={"/backtesting"}>
        <AppLayout><Backtesting /></AppLayout>
      </Route>
      <Route path={"/analytics"}>
        <AppLayout><Analytics /></AppLayout>
      </Route>
      <Route path={"/cloud-bots"}>
        <AppLayout><CloudBots /></AppLayout>
      </Route>
      <Route path={"/ai-assistant"}>
        <AppLayout><AIAssistant /></AppLayout>
      </Route>
      <Route path={"/trades"}>
        <AppLayout><TradeHistory /></AppLayout>
      </Route>
      <Route path={"/logs"}>
        <AppLayout><Logs /></AppLayout>
      </Route>
      <Route path={"/journal"}>
        <AppLayout><Journal /></AppLayout>
      </Route>
      <Route path={"/replay"}>
        <AppLayout><Replay /></AppLayout>
      </Route>
      <Route path={"/workflow"}>
        <AppLayout><Workflow /></AppLayout>
      </Route>
      <Route path={"/coding"}>
        <AppLayout><Coding /></AppLayout>
      </Route>
      <Route path={"/plugins"}>
        <AppLayout><Plugins /></AppLayout>
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [toasts, setToasts] = useState<{ id: number; kind: any; text: string }[]>([]);
  useToast((t) => {
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
  });
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
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


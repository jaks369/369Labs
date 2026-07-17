import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import StrategyBuilder from "./pages/StrategyBuilder";
import Settings from "./pages/Settings";
import AIAssistant from "./pages/AIAssistant";
import Marketplace from "./pages/Marketplace";
import Bots from "./pages/Bots";
import TradeHistory from "./pages/TradeHistory";
import Login from "./pages/Login";
import ThemePreview from "./pages/ThemePreview";

function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/dashboard"}>
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path={"/bots"}>
        <AppLayout><Bots /></AppLayout>
      </Route>
      <Route path={"/strategy-builder"}>
        <AppLayout><StrategyBuilder /></AppLayout>
      </Route>
      <Route path={"/settings"}>
        <AppLayout><Settings /></AppLayout>
      </Route>
      <Route path={"/marketplace"}>
        <AppLayout><Marketplace /></AppLayout>
      </Route>
      <Route path={"/ai-assistant"}>
        <AppLayout><AIAssistant /></AppLayout>
      </Route>
      <Route path={"/trades"}>
        <AppLayout><TradeHistory /></AppLayout>
      </Route>
      <Route path={"/theme-preview"} component={ThemePreview} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), then change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

import re
with open('client/src/App.tsx', 'r') as f:
    content = f.read()

old = '''function Router\\(\\) {
  // make sure to consider if you need authentication for certain routes
  return \\(
    <Switch>
      <Route path={\"/\"} component={Home} />
      <Route path={\"/login\"} component={Login} />
      <Route path={\"/dashboard\"} component={Dashboard} />
      <Route path={\"/bots\"} component={Bots} />
      <Route path={\"/strategy-builder\"} component={StrategyBuilder} />
      <Route path={\"/settings\"} component={Settings} />
      <Route path={\"/ai-assistant\"} component={AIAssistant} />
      <Route path={\"/trades\"} component={TradeHistory} />
      <Route path={\"/404\"} component={NotFound} />
      <Route component={NotFound} />
    <\\/Switch>
  \\)\\;
}'''

new = '''function AppLayout({ children }: { children: React.ReactNode }) {
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
      <Route path={"/ai-assistant"}>
        <AppLayout><AIAssistant /></AppLayout>
      </Route>
      <Route path={"/trades"}>
        <AppLayout><TradeHistory /></AppLayout>
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}'''

content = re.sub(old, new, content, flags=re.DOTALL)
with open('client/src/App.tsx', 'w') as f:
    f.write(content)
print("Done")

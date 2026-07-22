import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  Zap,
  ChevronDown,
  Wallet,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";
import DigitStats from "@/components/DigitStats";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import { paperEngine } from "@/services/PaperEngine";

const IT_SYMBOLS = ["R_10","R_25","R_50","R_75","R_100","1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V"];

const VOLATILITY_FALLBACK: DerivSymbol[] = [
  { symbol: "R_10", displayName: "Volatility 10 Index", market: "volatility", submarket: "volatility", decimalPlaces: 3 },
  { symbol: "R_25", displayName: "Volatility 25 Index", market: "volatility", submarket: "volatility", decimalPlaces: 3 },
  { symbol: "R_50", displayName: "Volatility 50 Index", market: "volatility", submarket: "volatility", decimalPlaces: 4 },
  { symbol: "R_75", displayName: "Volatility 75 Index", market: "volatility", submarket: "volatility", decimalPlaces: 4 },
  { symbol: "R_100", displayName: "Volatility 100 Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
  { symbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
  { symbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
  { symbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
  { symbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
  { symbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", market: "volatility", submarket: "volatility", decimalPlaces: 2 },
];

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<{ currency: string; accountType: string } | null>(null);
  const [paperBal, setPaperBal] = useState(() => paperEngine.getBalance());
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("R_50");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });
  const [stake, setStake] = useState<number>(1);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 });
  const signalsQuery = trpc.signals.list.useQuery({}, { refetchInterval: 30000 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const saveTradeMutation = trpc.trades.save.useMutation();
  const [historyTab, setHistoryTab] = useState<"trades" | "prices">("trades");
  const priceQuery = trpc.market.getHistory.useQuery({ symbol: selectedSymbol, limit: 200 }, { enabled: historyTab === "prices", refetchInterval: historyTab === "prices" ? 3000 : false });

  // Live tick buffer: stream ticks from the Deriv WS so the Price History table
  // updates in real time (newest on top, pushing older rows down).
  const [liveTicks, setLiveTicks] = useState<any[]>([]);
  useEffect(() => {
    if (historyTab !== "prices") return;
    setLiveTicks([]);
    const subId = derivWS.subscribe(selectedSymbol);
    const listener = {
      onTick: (tick: any) => {
        if (tick.symbol !== selectedSymbol) return;
        const price = Number(tick.price);
        const lastDigit = parseInt(String(tick.price).replace(".", "").slice(-1), 10) || 0;
        setLiveTicks((prev) => [{ symbol: tick.symbol, price, lastDigit, epoch: Math.floor(tick.timestamp / 1000) }, ...prev].slice(0, 50));
      },
      onError: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
    };
    derivWS.addListener(listener);
    return () => { derivWS.removeListener(listener); derivWS.unsubscribe(subId); };
  }, [selectedSymbol, historyTab]);

  // Use live ticks if streaming, else fall back to the DB snapshot.
  const displayTicks = liveTicks.length ? liveTicks : (priceQuery.data?.ticks || []).slice(0, 50);

  const handleQuickTrade = async () => {
    if (!derivWS.isAuthorized()) { setTradeMsg({ kind: "err", text: "Connect a Deriv token first (Settings)." }); return; }
    if (accountType === "real") {
      const ok = window.confirm("You are connected to a REAL account. This trade uses real funds. Continue?");
      if (!ok) return;
    }
    const map: Record<string, string> = {
      "rise_fall": contract.direction === "fall" ? "PUT" : "CALL",
      "over_under": contract.overUnder === "under" ? "DIGITUNDER" : "DIGITOVER",
      "even_odd": contract.digitMatch === "differ" ? "DIGITODD" : "DIGITEVEN",
      "digits": "DIGITMATCH",
      "accumulator": "ACCU",
    };
    const contractType = map[contract.category];
    if (!contractType) { setTradeMsg({ kind: "err", text: "Unsupported contract type." }); return; }
    setTradeBusy(true); setTradeMsg(null);
    try {
      const purchase = await derivWS.purchaseContract({
        symbol: selectedSymbol,
        contractType: contractType as any,
        amount: stake,
        duration: 5,
        durationUnit: "t",
        ...(contract.category === "over_under" && contract.barrier !== undefined ? { barrier: contract.barrier } : {}),
        ...(contract.category === "digits" && contract.digit !== undefined ? { barrier: contract.digit } : {}),
      });
      setTradeMsg({ kind: "ok", text: "Trade placed (contract #" + purchase.contractId + "). Tracking settlementâ€¦" });

      // Persist the open trade and subscribe to its settlement so the
      // user's trade history stays accurate even after navigating away.
      derivWS.subscribeToContract(purchase.contractId, (c: any) => {
        if (c.status !== "open") {
          const profit = parseFloat(c.profit || c.profit_loss || "0");
          saveTradeMutation.mutate({
            result: (profit >= 0 ? "win" : "loss") as any,
            stake: String(stake),
            entryPrice: String(purchase.buyPrice ?? ""),
            profitLoss: profit.toFixed(2),
            entryTime: new Date(),
            exitTime: new Date(),
            contractId: String(purchase.contractId),
          } as any, { onSuccess: () => tradesQuery.refetch() });
        }
      });
    } catch (e: any) {
      setTradeMsg({ kind: "err", text: "Trade failed: " + (e?.message || e) });
    } finally { setTradeBusy(false); }
  };

  useEffect(() => {
    if (!isAuthenticated) { navigate("/"); }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (tradesQuery.data) {
      const totalPnl = tradesQuery.data.reduce((sum, trade) => {
        const pnlValue = parseFloat(trade.profitLoss?.toString() || "0");
        return sum + pnlValue;
      }, 0);
      setPnl(totalPnl);
    }
  }, [tradesQuery.data]);

  useEffect(() => {
    if (botRunsQuery.data) {
      const running = botRunsQuery.data.some(run => run.status === "running");
      setBotRunning(running);
    }
  }, [botRunsQuery.data]);

  useEffect(() => {
    const unsub = derivWS.onBalance((b) => {
      const list = Array.isArray(b.balance) ? b.balance : (b.accounts || [b]);
      const acct = list[0] || b;
      setBalance(parseFloat(acct?.balance != null ? acct.balance : (acct?.display_balance || "0")) || 0);
      setBalanceInfo({
        currency: acct?.currency || "USD",
        accountType: (acct?.account_type || b.account_type || "").toString().toLowerCase(),
      });
    });
    return () => {};
  }, []);

  useEffect(() => {
    setTokenSaved(Boolean(tokenQuery.data?.token));
    if (tokenQuery.data?.token) {
      derivWS.setApiToken(tokenQuery.data.token);
      if (derivWS.isAuthorized()) derivWS.fetchBalance();
    }
    const authTimer = setInterval(() => {
      if (tokenQuery.data?.token) {
        derivWS.ensureAuthorized();
        if (derivWS.isAuthorized()) derivWS.fetchBalance();
      }
    }, 5000);
    return () => clearInterval(authTimer);
  }, [tokenQuery.data]);

  useEffect(() => {
    return paperEngine.onBalance(setPaperBal);
  }, []);

  // Three distinct token states: none saved | saved but invalid/unauthorized | connected.
  const tokenStatus: "none" | "invalid" | "connected" =
    !tokenSaved ? "none" : tokenError || !derivWS.isAuthorized() ? "invalid" : "connected";

  useEffect(() => {
    const unsub = derivWS.onTokenError((msg) => setTokenError(msg));
    return () => { /* tokenListeners is a Set; ignore */ };
  }, []);

  const [symbols, setSymbols] = useState<DerivSymbol[]>([]);
  useEffect(() => {
    const unsub = derivWS.onSymbols((syms) => {
      setSymbols(syms);
      if (syms.length > 0 && !syms.find(s => s.symbol === selectedSymbol)) {
        const vi = syms.filter(s => IT_SYMBOLS.includes(s.symbol));
        if (vi.length > 0) setSelectedSymbol(vi[0].symbol);
      }
    });
    return () => {};
  }, []);

  const symbolList = symbols.length > 0 ? symbols : VOLATILITY_FALLBACK;
  const pickerSymbols = symbols.length > 0 ? symbols : VOLATILITY_FALLBACK;
  const vol1sSymbols = pickerSymbols.filter(s => /^1HZ/i.test(s.symbol) || /\(1s\)/i.test(s.displayName));
  const volRegularSymbols = pickerSymbols.filter(s => /volatility/i.test(s.displayName) && !/\(1s\)/i.test(s.displayName) && !/^1HZ/i.test(s.symbol));

  const selectedDisplay = symbolList.find(s => s.symbol === selectedSymbol)?.displayName || selectedSymbol;
  const decimalPlaces = derivWS.decimalPlacesFor(selectedSymbol);
  const { status: derivStatus, accountType } = useDerivStatus();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Market Overview</h1>
          <p className="text-[var(--text-muted)] text-sm font-medium">Volatility Indices &middot; Live Trading</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg panel-secondary">
            <Wallet className="w-4 h-4 text-[var(--green)]" />
            <span className="text-sm font-bold text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {balanceInfo?.currency || "USD"}
            </span>
            {balanceInfo?.accountType ? (
              <span className={`badge ${balanceInfo.accountType === "demo" ? "badge-amber" : "badge-red"}`}>
                {balanceInfo.accountType}
              </span>
            ) : tokenStatus === "invalid" ? (
              <span className="badge badge-red" title={tokenError || "Token saved but not authorized by Deriv"}>token invalid</span>
            ) : tokenStatus === "none" ? (
              <span className="badge badge-gray">no token</span>
            ) : (
              <span className="badge badge-green">connected</span>
            )}
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg panel-secondary hover:bg-[var(--amber-soft)] transition-colors"
            title="Paper Trading Balance"
          >
            <Wallet className="w-4 h-4 text-[var(--amber-hover)]" />
            <span className="text-sm font-bold text-white">
              ${paperBal.toFixed(2)}
            </span>
            <span className="badge badge-amber">paper</span>
          </button>
          <Button onClick={() => setShowTokenModal(true)} className="btn btn-primary gap-2 w-full sm:w-auto">
            <Zap className="w-4 h-4 shrink-0" /> <span className="sm:inline">Connect Deriv</span>
          </Button>
          <Button onClick={() => setShowSymbolPicker(s => !s)} className="btn btn-outline gap-2 w-full sm:w-auto">
            <Activity className="w-4 h-4 shrink-0" /> <span className="truncate max-w-[120px] sm:max-w-none">{selectedDisplay}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Token error banner */}
      {tokenError && (
        <div className="flex items-center justify-between gap-3 bg-[var(--amber-soft)] border border-[var(--amber-border)] text-[var(--amber)] text-sm rounded-[var(--radius)] px-4 py-2 mb-6">
          <span>Deriv token issue: {tokenError}. Update it to trade.</span>
          <Button onClick={() => setShowTokenModal(true)} className="btn btn-outline text-[var(--amber)] border-[var(--amber-border)] text-xs px-3 py-1">UPDATE TOKEN</Button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left column - Chart & History */}
        <div className="xl:col-span-2 space-y-8">

          {/* Chart container */}
          <div className="chart-container">
            <div className="chart-header">
              <h2 className="card-title text-sm">Live Chart &mdash; {selectedDisplay}</h2>
              <div className="chart-toolbar">
                <button className="chart-toolbar-btn active">1m</button>
                <button className="chart-toolbar-btn">5m</button>
                <button className="chart-toolbar-btn">15m</button>
                <button className="chart-toolbar-btn">1h</button>
              </div>
            </div>
            {showSymbolPicker ? (
              <div className="max-h-[300px] md:max-h-[420px] overflow-y-auto space-y-5 p-4">
                <div>
                  <h3 className="section-title mb-2">Volatility 1s Indices</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {vol1sSymbols.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); }}
                        className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--amber-soft)] text-[var(--amber-hover)] border border-[var(--amber-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
                      >
                        {s.displayName || s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="section-title mb-2">Volatility Indices</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {volRegularSymbols.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); }}
                        className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSymbol === s.symbol ? "bg-[var(--amber-soft)] text-[var(--amber-hover)] border border-[var(--amber-border)]" : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-transparent"}`}
                      >
                        {s.displayName || s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chart-plot h-[300px] md:h-[420px]">
                <TickChart symbol={selectedSymbol} maxDataPoints={50} decimalPlaces={decimalPlaces} />
              </div>
            )}
          </div>

          {/* History panel */}
          <div className="panel">
            <div className="panel-header">
              <h2 className="card-title text-sm">History</h2>
              <div className="tabs">
                <button onClick={() => setHistoryTab("trades")} className={`tab ${historyTab === "trades" ? "active" : ""}`}>Trades</button>
                <button onClick={() => setHistoryTab("prices")} className={`tab ${historyTab === "prices" ? "active" : ""}`}>Price History</button>
              </div>
            </div>
            {historyTab === "trades" ? (
              <div>
                {(() => {
                  const symTrades = (tradesQuery.data || []).filter((t: any) => (t.symbol || "") === selectedSymbol);
                  const wins = symTrades.filter((t: any) => t.result === "win").length;
                  const grossProfit = symTrades.filter((t: any) => parseFloat(t.profitLoss?.toString() || "0") >= 0).reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
                  const grossLoss = symTrades.filter((t: any) => parseFloat(t.profitLoss?.toString() || "0") < 0).reduce((a: number, t: any) => a + parseFloat(t.profitLoss?.toString() || "0"), 0);
                  const net = grossProfit + grossLoss;
                  const winRate = symTrades.length ? Math.round((wins / symTrades.length) * 100) : 0;
                  return (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-[var(--border)]">
                      <div className="kpi-card">
                        <div className="kpi-label">Trades</div>
                        <div className="kpi-value text-lg">{symTrades.length}</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">Win Rate</div>
                        <div className="kpi-value text-lg">{winRate}%</div>
                      </div>
                      <div className="kpi-card kpi-card-green">
                        <div className="kpi-label">Gross Profit</div>
                        <div className="kpi-value text-lg text-[var(--green)]">+{grossProfit.toFixed(2)}</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-label">Net P&L</div>
                        <div className={`kpi-value text-lg ${net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{net >= 0 ? "+" : ""}{net.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="table-container border-0 rounded-none">
                  {(() => {
                    const symTrades = (tradesQuery.data || []).filter((t: any) => (t.symbol || "") === selectedSymbol);
                    if (symTrades.length === 0) {
                      return <div className="empty-state"><p className="empty-state-desc">No trades for {selectedSymbol} yet.</p></div>;
                    }
                    return (
                      <table className="table">
                        <thead>
                          <tr><th>#</th><th>TYPE</th><th>STAKE</th><th>ENTRY</th><th>RESULT</th><th className="text-right">P&L</th></tr>
                        </thead>
                        <tbody>
                          {symTrades.slice(0, 10).map((trade: any, i: number) => (
                            <tr key={trade.id}>
                              <td className="text-[var(--text-muted)] font-mono">{i + 1}</td>
                              <td><span className="tag">{trade.contractType || "-"}</span></td>
                              <td>${trade.stake}</td>
                              <td className="font-mono">{trade.entryPrice}</td>
                              <td>
                                <span className={`badge ${trade.result === "win" ? "badge-green" : "badge-red"}`}>
                                  {trade.result.toUpperCase()}
                                </span>
                              </td>
                              <td className={`text-right font-bold font-mono ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                {parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "+" : ""}{trade.profitLoss}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-4">
                {priceQuery.isLoading ? (
                  <div className="flex items-center justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--amber)]" /></div>
                ) : priceQuery.data?.ticks?.length ? (
                  <div className="table-container border-0 rounded-none">
                    <table className="table">
                      <thead>
                        <tr><th>#</th><th>TIME</th><th className="text-right">PRICE</th><th className="text-right">LAST DIGIT</th></tr>
                      </thead>
                      <tbody>
                        {displayTicks.map((t: any, i: number) => (
                          <tr key={i}>
                            <td className="text-[var(--text-muted)] font-mono">{i + 1}</td>
                            <td>{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                            <td className="text-right text-white font-mono">{Number(t.price).toFixed(decimalPlaces)}</td>
                            <td className="text-right font-mono">{t.lastDigit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state"><p className="empty-state-desc">No price history for {selectedSymbol} yet.</p></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column - Trade Studio & AI Insight */}
        <div className="space-y-8">

          {/* Trade Studio */}
          <div className="trade-studio p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="section-title text-[11px]">Trade Studio</h3>
              <span className={`badge ${accountType === "real" ? "badge-red" : accountType === "demo" ? "badge-amber" : tokenStatus === "invalid" ? "badge-red" : "badge-gray"}`}>
                {accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : tokenStatus === "invalid" ? "INVALID" : "NO TOKEN"}
              </span>
            </div>
            <div className="space-y-4">
              <div className="input-group">
                <label className="input-label">Symbol</label>
                <div className="input bg-[var(--surface-secondary)] cursor-default">{selectedSymbol}</div>
              </div>
              <ContractTypeSelector selection={contract} onChange={setContract} />
              <div className="input-group">
                <label className="input-label">Stake ($)</label>
                <input
                  type="number"
                  min={0.35}
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                />
              </div>
              <Button onClick={handleQuickTrade} disabled={tradeBusy} className="btn btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (contract.direction === "fall" ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />)}
                {tradeBusy ? "Placing..." : "Buy"}
              </Button>
              {tradeMsg && (
                <p className={`text-xs ${tradeMsg.kind === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{tradeMsg.text}</p>
              )}
              {!derivWS.isAuthorized() && (
                <p className="text-xs text-[var(--text-muted)]">Connect a Deriv token in Settings to enable trading.</p>
              )}
            </div>
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <DigitStats symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
            </div>
          </div>

          {/* AI Insight */}
          <div className="ai-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="section-title text-[11px]">369AI Insight</h3>
            </div>
            {(() => {
              const sigs = (signalsQuery.data as any[]) || [];
              const latest = sigs[0];
              if (!latest) {
                return <div className="empty-state py-6"><p className="empty-state-desc">No signals yet. Ask 369AI to watch a market, or wait for the always-on scanner to surface a pattern.</p></div>;
              }
              return (
                <div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{latest.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <span className="ai-badge">{latest.symbol}</span>
                    <span className="text-[var(--text-muted)]">win rate <b className="text-[var(--green)]">{latest.winRate}%</b></span>
                    <span className="text-[var(--text-muted)]">{new Date((latest.discoveredAt || 0) * 1000).toLocaleString()}</span>
                  </div>
                  <button onClick={() => navigate("/marketplace")} className="mt-3 text-xs text-[var(--cyan)] hover:text-[var(--cyan)]/80 transition-colors flex items-center gap-1">
                    View all signals <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </div>
  );
}
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Search,
  LayoutGrid,
  List,
  Zap,
  Brain,
  ChevronDown,
  Wallet,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";
import DigitStats from "@/components/DigitStats";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import { useDerivStatus } from "@/hooks/useDerivStatus";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";

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
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("R_50");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });
  const [stake, setStake] = useState<number>(1);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 });
  const signalsQuery = trpc.signals.list.useQuery({}, { refetchInterval: 30000 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const tokenQuery = trpc.deriv.getToken.useQuery();
  const [historyTab, setHistoryTab] = useState<"trades" | "prices">("trades");
  const priceQuery = trpc.market.getHistory.useQuery({ symbol: selectedSymbol, limit: 200 }, { enabled: historyTab === "prices", refetchInterval: historyTab === "prices" ? 3000 : false });

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
      setTradeMsg({ kind: "ok", text: "Trade placed (contract #" + purchase.contractId + "). Settlement will appear in history." });
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
    if (tokenQuery.data?.token) {
      derivWS.setApiToken(tokenQuery.data.token);
    }
  }, [tokenQuery.data]);

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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Market Overview</h1>
          <p className="text-slate-500 text-sm font-medium">Volatility Indices &middot; Live Trading</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161B22] border border-[#30363D]">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {balanceInfo?.currency || "USD"}
            </span>
            {balanceInfo?.accountType ? (
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${balanceInfo.accountType === "demo" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                {balanceInfo.accountType}
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">
                no token
              </span>
            )}
          </div>
          <Button onClick={() => setShowTokenModal(true)} className="btn-primary gap-2">
            <Zap className="w-4 h-4" /> Connect Deriv
          </Button>
          <Button onClick={() => setShowSymbolPicker(s => !s)} className="btn-outline gap-2">
            <Activity className="w-4 h-4" /> {selectedDisplay}
            <ChevronDown className={`w-4 h-4 transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {tokenError && (
        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-400 text-sm rounded-lg px-4 py-2 mb-4">
          <span>Deriv token issue: {tokenError}. Update it to trade.</span>
          <Button onClick={() => setShowTokenModal(true)} className="btn-outline text-amber-400 border-amber-500/40 text-xs px-3 py-1">UPDATE TOKEN</Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <div className="bloomberg-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white uppercase text-xs tracking-widest">
                Live Chart &mdash; {selectedDisplay}
              </h2>
            </div>

            {showSymbolPicker ? (
              <div className="max-h-[420px] overflow-y-auto space-y-5 pr-1">
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Volatility 1s Indices</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {vol1sSymbols.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); }}
                        className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${selectedSymbol === s.symbol ? "bg-blue-600/20 text-blue-400 border border-blue-600/40" : "bg-white/5 text-slate-300 hover:bg-white/10 border border-transparent"}`}
                      >
                        {s.displayName || s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Volatility Indices</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {volRegularSymbols.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); }}
                        className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${selectedSymbol === s.symbol ? "bg-blue-600/20 text-blue-400 border border-blue-600/40" : "bg-white/5 text-slate-300 hover:bg-white/10 border border-transparent"}`}
                      >
                        {s.displayName || s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-black/40 h-[420px]">
                <TickChart symbol={selectedSymbol} maxDataPoints={50} decimalPlaces={decimalPlaces} />
              </div>
            )}
          </div>

          <div className="bloomberg-panel">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
              <h2 className="font-bold text-white uppercase text-xs tracking-widest">History</h2>
              <div className="flex gap-1 p-1 bg-[#0D1117] rounded-lg border border-[#30363D]">
                <button onClick={() => setHistoryTab("trades")} className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${historyTab === "trades" ? "bg-blue-600/20 text-blue-400" : "text-slate-500 hover:text-white"}`}>Trades</button>
                <button onClick={() => setHistoryTab("prices")} className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${historyTab === "prices" ? "bg-blue-600/20 text-blue-400" : "text-slate-500 hover:text-white"}`}>Price History</button>
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
                    <div className="p-4 grid grid-cols-4 gap-3 border-b border-[#30363D]">
                      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Trades</div>
                        <div className="text-lg font-bold text-white mt-1">{symTrades.length}</div>
                      </div>
                      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Win Rate</div>
                        <div className="text-lg font-bold text-white mt-1">{winRate}%</div>
                      </div>
                      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Gross Profit</div>
                        <div className="text-lg font-bold text-emerald-500 mt-1">+{grossProfit.toFixed(2)}</div>
                      </div>
                      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Net P&L</div>
                        <div className={`text-lg font-bold mt-1 ${net >= 0 ? "text-emerald-500" : "text-red-500"}`}>{net >= 0 ? "+" : ""}{net.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="overflow-x-auto">
                  {(() => {
                    const symTrades = (tradesQuery.data || []).filter((t: any) => (t.symbol || "") === selectedSymbol);
                    if (symTrades.length === 0) {
                      return <div className="p-10 text-center text-slate-600 italic text-sm">No trades for {selectedSymbol} yet. Deploy a bot or place a quick trade.</div>;
                    }
                    return (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-[#30363D]">
                            <th className="p-3 font-bold">#</th>
                            <th className="p-3 font-bold">TYPE</th>
                            <th className="p-3 font-bold">STAKE</th>
                            <th className="p-3 font-bold">ENTRY</th>
                            <th className="p-3 font-bold">RESULT</th>
                            <th className="p-3 font-bold text-right">P&L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#30363D]">
                          {symTrades.slice(0, 10).map((trade: any, i: number) => (
                            <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 text-slate-600 font-mono">{i + 1}</td>
                              <td className="p-3"><span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 font-semibold">{trade.contractType || "-"}</span></td>
                              <td className="p-3 text-slate-400">${trade.stake}</td>
                              <td className="p-3 text-slate-400 font-mono">{trade.entryPrice}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-sm font-bold text-[10px] ${
                                  trade.result === "win" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                }`}>
                                  {trade.result.toUpperCase()}
                                </span>
                              </td>
                              <td className={`p-3 text-right font-bold font-mono ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-emerald-500" : "text-red-500"}`}>
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
                  <div className="p-10 text-center text-slate-600 italic text-sm">Loading price history...</div>
                ) : priceQuery.data?.ticks?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-[#30363D]">
                          <th className="p-3 font-bold">#</th>
                          <th className="p-3 font-bold">TIME</th>
                          <th className="p-3 font-bold text-right">PRICE</th>
                          <th className="p-3 font-bold text-right">LAST DIGIT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#30363D]">
                        {priceQuery.data.ticks.slice().reverse().slice(0, 50).map((t: any, i: number) => {
                          const priceStr = String(t.price);
                          const lastDigit = t.lastDigit;
                          return (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 text-slate-600 font-mono">{i + 1}</td>
                              <td className="p-3 text-slate-400">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                              <td className="p-3 text-right text-white font-mono">{Number(t.price).toFixed(decimalPlaces)}</td>
                              <td className="p-3 text-right text-slate-400 font-mono">{lastDigit}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-slate-600 italic text-sm">No price history for {selectedSymbol} yet. It populates as ticks arrive.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bloomberg-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quick Trade</h3>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${accountType === "real" ? "bg-red-500/20 text-red-400" : accountType === "demo" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-400"}`}>
                {accountType === "real" ? "REAL" : accountType === "demo" ? "DEMO" : "NO TOKEN"}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</label>
                <div className="mt-1 px-3 py-2 rounded-lg bg-[#0D1117] border border-[#30363D] text-sm text-white">{selectedSymbol}</div>
              </div>
              <ContractTypeSelector selection={contract} onChange={setContract} />
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stake ($)</label>
                <input
                  type="number"
                  min={0.35}
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="mt-1 w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <Button onClick={handleQuickTrade} disabled={tradeBusy} className="w-full btn-primary flex items-center justify-center gap-2">
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (contract.direction === "fall" ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />)}
                {tradeBusy ? "Placing..." : "Buy"}
              </Button>
              {tradeMsg && (
                <p className={`text-xs ${tradeMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{tradeMsg.text}</p>
              )}
              {!derivWS.isAuthorized() && (
                <p className="text-[10px] text-slate-500">Connect a Deriv token in Settings to enable trading.</p>
              )}
            </div>
          </div>


          <div className="bloomberg-panel p-6 border-l-4 border-l-purple-600">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Digit Analysis</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-bold text-purple-500 uppercase">Live</span>
              </div>
            </div>
            <ContractTypeSelector selection={contract} onChange={setContract} />
            <DigitStats symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
          </div>


          <div className="bloomberg-panel p-6 bg-amber-400/5 border-amber-400/20">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">369AI Insight</h3>
            </div>
            {(() => {
              const sigs = (signalsQuery.data as any[]) || [];
              const latest = sigs[0];
              if (!latest) {
                return <p className="text-xs text-slate-500 leading-relaxed">No signals yet. Ask 369AI to watch a market, or wait for the always-on scanner to surface a pattern.</p>;
              }
              return (
                <div>
                  <p className="text-xs text-slate-300 leading-relaxed">{latest.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-400 font-bold uppercase">{latest.symbol}</span>
                    <span className="text-slate-500">win rate <b className="text-emerald-400">{latest.winRate}%</b></span>
                    <span className="text-slate-500">{new Date((latest.discoveredAt || 0) * 1000).toLocaleString()}</span>
                  </div>
                  <button onClick={() => navigate("/marketplace")} className="mt-3 text-[11px] text-amber-400 hover:underline flex items-center gap-1">
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
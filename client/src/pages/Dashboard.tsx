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
  ChevronDown
} from "lucide-react";
import { useLocation } from "wouter";
import TickChart from "@/components/TickChart";
import DigitStats from "@/components/DigitStats";
import { derivWS, DerivSymbol } from "@/services/derivWebSocket";
import DerivTokenModal from "@/components/DerivTokenModal";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";

const IT_SYMBOLS = ["R_10","R_25","R_50","R_75","R_100","R_150","R_200"];

const VOLATILITY_FALLBACK: DerivSymbol[] = [
  { symbol: "R_10_1", displayName: "Volatility 10 (1s) Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_25_1", displayName: "Volatility 25 (1s) Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_50_1", displayName: "Volatility 50 (1s) Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_75_1", displayName: "Volatility 75 (1s) Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_100_1", displayName: "Volatility 100 (1s) Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_10", displayName: "Volatility 10 Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_25", displayName: "Volatility 25 Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_50", displayName: "Volatility 50 Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_75", displayName: "Volatility 75 Index", market: "volatility", submarket: "volatility" },
  { symbol: "R_100", displayName: "Volatility 100 Index", market: "volatility", submarket: "volatility" },
];

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(0);
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("R_50");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [contract, setContract] = useState<ContractSelection>({ category: "rise_fall", direction: "rise" });

  const tradesQuery = trpc.trades.list.useQuery({ limit: 20 });
  const botRunsQuery = trpc.bot.getRuns.useQuery();
  const tokenQuery = trpc.deriv.getToken.useQuery();

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
      const acct = b.accounts?.[0] || b;
      setBalance(parseFloat(acct?.balance || acct?.display_balance || "0"));
    });
    return () => {};
  }, []);

  useEffect(() => {
    if (tokenQuery.data?.token) {
      derivWS.setApiToken(tokenQuery.data.token);
    }
  }, [tokenQuery.data]);

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
  const vol1sSymbols = symbolList.filter(s => /\(1s\)/i.test(s.displayName) || s.symbol.endsWith("_1"));
  const volRegularSymbols = symbolList.filter(s => /volatility/i.test(s.displayName) && !/\(1s\)/i.test(s.displayName) && !s.symbol.endsWith("_1"));

  const selectedDisplay = symbolList.find(s => s.symbol === selectedSymbol)?.displayName || selectedSymbol;

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
          <Button onClick={() => setShowTokenModal(true)} className="btn-primary gap-2">
            <Zap className="w-4 h-4" /> Connect Deriv
          </Button>
          <Button onClick={() => setShowSymbolPicker(s => !s)} className="btn-outline gap-2">
            <Activity className="w-4 h-4" /> {selectedDisplay}
            <ChevronDown className={`w-4 h-4 transition-transform ${showSymbolPicker ? "rotate-180" : ""}`} />
          </Button>
          <Button onClick={logout} className="btn-outline gap-2 text-slate-400">
            <ArrowUpRight className="w-4 h-4" /> Logout
          </Button>
        </div>
      </div>

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
              <h2 className="font-bold text-white uppercase text-xs tracking-widest">Recent Executions</h2>
              <div className="flex gap-2">
                <button onClick={() => setViewMode("grid")} className={`p-1 ${viewMode === "grid" ? "text-blue-500" : "text-slate-600"}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setViewMode("list")} className={`p-1 ${viewMode === "list" ? "text-blue-500" : "text-slate-600"}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-[#30363D]">
                    <th className="p-4 font-bold">SYMBOL</th>
                    <th className="p-4 font-bold">TYPE</th>
                    <th className="p-4 font-bold">STAKE</th>
                    <th className="p-4 font-bold">ENTRY</th>
                    <th className="p-4 font-bold">RESULT</th>
                    <th className="p-4 font-bold text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D]">
                  {tradesQuery.data?.slice(0, 8).map(trade => (
                    <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-semibold text-white">{trade.symbol || "-"}</td>
                      <td className="p-4 text-slate-400">{trade.contractType || "-"}</td>
                      <td className="p-4 text-slate-400">${trade.stake}</td>
                      <td className="p-4 text-slate-400">{trade.entryPrice}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-sm font-bold text-[10px] ${
                          trade.result === "win" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        }`}>
                          {trade.result.toUpperCase()}
                        </span>
                      </td>
                      <td className={`p-4 text-right font-bold ${parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {parseFloat(trade.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${trade.profitLoss}
                      </td>
                    </tr>
                  ))}
                  {(!tradesQuery.data || tradesQuery.data.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-600 italic">No recent trades found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bloomberg-panel p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Quick Launch</h3>
            <div className="space-y-3">
              <Button onClick={() => navigate("/strategy-builder")} className="w-full btn-primary justify-start gap-3">
                <Zap className="w-4 h-4" /> New Strategy
              </Button>
              <Button onClick={() => navigate("/ai-assistant")} className="w-full btn-secondary justify-start gap-3">
                <Brain className="w-4 h-4" /> Ask 369AI
              </Button>
              <Button onClick={() => navigate("/marketplace")} className="w-full btn-outline justify-start gap-3">
                <LayoutGrid className="w-4 h-4" /> Browse Marketplace
              </Button>
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

          <div className="bloomberg-panel p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Market Status</h3>
            <div className="space-y-4">
              {volRegularSymbols.slice(0, 6).map(m => (
                <div key={m.symbol} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{m.symbol}</span>
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bloomberg-panel p-6 bg-blue-600/5 border-blue-600/20">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest">369AI Insight</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic">
              "Volatility 50 index is showing a strong bullish divergence on the 15m RSI.
              Consider a Mean Reversion strategy for the next 10 ticks."
            </p>
          </div>
        </div>
      </div>

      <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
    </div>
  );
}
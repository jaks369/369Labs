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

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(0);
  const [botRunning, setBotRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("R_50");
  const [marketSearch, setMarketSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [symbols, setSymbols] = useState<DerivSymbol[]>([]);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState("");
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


  const filteredSymbols = symbols.filter(s =>
    (s.symbol || "").toLowerCase().includes(searchSymbol.toLowerCase()) ||
    (s.displayName || "").toLowerCase().includes(searchSymbol.toLowerCase())
  );
  const volatilitySymbols = filteredSymbols.filter(s => 
    s.market === "volatility" || s.market === "synthetic_index" || s.submarket?.includes("volatility") || s.submarket?.includes("synthetic") || IT_SYMBOLS.includes(s.symbol)
  );
  const forexSymbols = symbols.filter(s => s.market === "forex");
  const syntheticsSymbols = filteredSymbols.filter(s =>
    s.market === "indices" ||
    s.displayName?.toLowerCase().includes("boom") ||
    s.displayName?.toLowerCase().includes("crash") ||
    s.displayName?.toLowerCase().includes("step") ||
    s.displayName?.toLowerCase().includes("jump") ||
    s.displayName?.toLowerCase().includes("range") ||
    s.displayName?.toLowerCase().includes("daily reset") ||
    (!volatilitySymbols.includes(s) && s.market !== "forex")
  );
  const otherSymbols = symbols.filter(s => s.market !== "volatility" && s.market !== "forex");

  const groupedSymbols = [
    { label: "Volatility Indices", items: volatilitySymbols },
    { label: "Synthetics (Boom/Crash/Step/Jump)", items: syntheticsSymbols },
    { label: "Forex", items: forexSymbols },
    { label: "Other", items: otherSymbols },
  ].filter(g => g.items.length > 0);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Market Overview</h1>
          <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search markets..." className="bg-[#161B22] border-[#30363D] pl-10 pr-4 py-2 rounded-lg text-sm focus:border-blue-500 transition-colors w-64" />
          </div>
          <Button className="btn-primary" onClick={() => setShowTokenModal(true)}>Connect Account</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bloomberg-panel p-5 border-l-4 border-l-blue-600">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Balance</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-white">${balance.toFixed(2)}</span>
            <span className="text-xs text-slate-500 mb-1">USD</span>
          </div>
        </div>
        <div className={`bloomberg-panel p-5 border-l-4 ${pnl >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Net Profit/Loss</p>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </span>
            {pnl >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <div className="bloomberg-panel p-5 border-l-4 border-l-slate-700">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Bots</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">
              {botRunsQuery.data?.filter(r => r.status === "running").length || 0}
            </span>
            <div className={`status-dot ${botRunning ? "status-dot-success" : "bg-slate-700"}`} />
          </div>
        </div>
        <div className="bloomberg-panel p-5 border-l-4 border-l-slate-700">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Win Rate</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-white">
              <DerivTokenModal open={showTokenModal} onClose={() => setShowTokenModal(false)} />
          {tradesQuery.data && tradesQuery.data.length > 0 
                ? ((tradesQuery.data.filter(t => t.result === "win").length / tradesQuery.data.length) * 100).toFixed(1)
                : "0.0"}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bloomberg-panel overflow-hidden">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-white">Live Market Feed</h2>
                <div className="relative">
                  <button
                    onClick={() => setShowSymbolPicker(!showSymbolPicker)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#161B22] border border-[#30363D] rounded-lg text-xs font-bold text-white hover:border-blue-500 transition-colors"
                  >
                    {selectedSymbol} <ChevronDown className="w-3 h-3" />
                  </button>
                  {showSymbolPicker && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto">
                      <div className="p-3 border-b border-[#30363D]">
                        <input
                          value={searchSymbol}
                          onChange={e => setSearchSymbol(e.target.value)}
                          placeholder="Search symbols..."
                          className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500"
                          autoFocus
                        />
                      </div>
                      {searchSymbol ? (
                        <div className="p-2 space-y-0.5">
                          {filteredSymbols.slice(0, 50).map(s => (
                            <button
                              key={s.symbol}
                              onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); setSearchSymbol(""); }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between hover:bg-white/5 ${selectedSymbol === s.symbol ? "bg-blue-600/10 text-blue-500" : "text-slate-300"}`}
                            >
                              <span className="font-bold">{s.displayName || s.symbol}</span>
                              <span className="text-slate-500 text-[10px]">{s.symbol}</span>
                            </button>
                          ))}
                          {filteredSymbols.length === 0 && <p className="text-xs text-slate-600 text-center py-4">No symbols match</p>}
                        </div>
                      ) : (
                        <div className="p-2 space-y-2">
                          {groupedSymbols.map(g => (
                            <div key={g.label}>
                              <p className="px-3 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider">{g.label}</p>
                              {g.items.slice(0, 15).map(s => (
                                <button
                                  key={s.symbol}
                                  onClick={() => { setSelectedSymbol(s.symbol); setShowSymbolPicker(false); }}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between hover:bg-white/5 ${selectedSymbol === s.symbol ? "bg-blue-600/10 text-blue-500" : "text-slate-300"}`}
                                >
                                  <span className="font-bold">{s.displayName || s.symbol}</span>
                              <span className="text-slate-500 text-[10px]">{s.symbol}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
            </div>
            <div className="p-6 bg-black/40 h-[400px]">
              <TickChart symbol={selectedSymbol} maxDataPoints={50} />
            </div>
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
                      <td className="p-4 font-semibold text-white">{trade.symbol || "—"}</td>
                      <td className="p-4 text-slate-400">{trade.contractType || "—"}</td>
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
            <DigitStats symbol={selectedSymbol} />
          </div>

          <div className="bloomberg-panel p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Market Status</h3>
            <div className="space-y-4">
              {volatilitySymbols.slice(0, 6).map(m => (
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
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CandlestickChart, Sparkles, TrendingUp, Clock, Bot, Loader2, ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import { useLocation } from "wouter";

const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ50V", "1HZ100V"];

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const createBotMutation = trpc.strategies.save.useMutation();
  const [sentId, setSentId] = useState<number | null>(null);
  const signalsQuery = trpc.signals.list.useQuery(
    symbol ? { symbol } : {},
    { refetchInterval: 30000 }
  );

  const sendToBot = async (sig: any) => {
    try {
      const strategy = await createBotMutation.mutateAsync({
        name: sig.title || (sig.symbol + " insight"),
        description: sig.description || "Created from a 369AI signal.",
        config: { rule: sig.rule, source: "ai_signal", signalId: sig.id },
      });
      setSentId(sig.id);
      setTimeout(() => navigate("/bots"), 600);
    } catch (e) {
      alert("Failed to create bot from signal: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!isAuthenticated) { navigate("/login"); return null; }
  const signals = (signalsQuery.data as any[]) || [];

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-[#0D1117]/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400/10 rounded-xl flex items-center justify-center border border-amber-400/30">
            <CandlestickChart className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI <span className="text-amber-400">Signals</span></h1>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" /> What 369AI discovered from live market data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none">
            <option value="">All symbols</option>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button onClick={() => navigate("/ai-assistant")} className="bg-amber-500 hover:bg-amber-400 text-black text-xs px-4 py-2 rounded-lg flex items-center gap-1">
            <Bot className="w-4 h-4" /> Ask 369AI
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {signalsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-5 h-5 animate-spin" /> Scanning market intelligence...
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto bg-amber-400/10 rounded-2xl flex items-center justify-center border border-amber-400/30 mb-4">
              <CandlestickChart className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white">No signals yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Tell 369AI to watch a market e.g. "Watch R_50 for 30 minutes and find repeatable patterns" or wait for the always-on scanner to surface setups here with full evidence.
            </p>
            <Button onClick={() => navigate("/ai-assistant")} className="mt-4 bg-amber-500 hover:bg-amber-400 text-black text-sm px-4 py-2 rounded-lg">
              Start a watch
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {signals.map((sig: any) => {
              const win = parseFloat(sig.winRate);
              const isOpen = expanded === sig.id;
              const ev = (sig.evidence || []).slice(0, 12);
              return (
                <div key={sig.id} className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden">
                  <div className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[10px] font-bold uppercase">{sig.symbol}</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[10px] font-bold uppercase">{sig.patternType}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sig.source === "always-on" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"}`}>{sig.source}</span>
                      </div>
                      <h3 className="font-bold text-white mt-2">{sig.title}</h3>
                      <p className="text-sm text-slate-400 mt-1">{sig.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><TrendingUp className="w-3 h-3" /> Win rate <b className={win >= 65 ? "text-emerald-400" : "text-amber-400"}>{win}%</b></span>
                        <span className="text-slate-500">Samples <b className="text-white">{sig.sampleSize}</b></span>
                        <span className="text-slate-500">Confidence <b className="text-white">{sig.confidence}%</b></span>
                        <span className="flex items-center gap-1 text-slate-500"><Clock className="w-3 h-3" /> {new Date((sig.discoveredAt || 0) * 1000).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button onClick={() => navigate("/backtesting?signal=" + sig.id)} className="bg-amber-500 hover:bg-amber-400 text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <FlaskConical className="w-3.5 h-3.5" /> Backtest
                      </Button>
                      <button onClick={() => setExpanded(isOpen ? null : sig.id)} className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 justify-center">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Evidence
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[#30363D] bg-[#0A0D12] p-4">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Raw evidence (tick window)</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="text-slate-500 border-b border-[#30363D]">
                              <th className="p-2">#</th><th className="p-2">Time</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Digit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#30363D]">
                            {ev.map((t: any, i: number) => (
                              <tr key={i}>
                                <td className="p-2 text-slate-600">{i + 1}</td>
                                <td className="p-2 text-slate-400">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                                <td className="p-2 text-right text-white">{Number(t.price).toFixed(4)}</td>
                                <td className="p-2 text-right text-amber-400">{t.lastDigit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <pre className="mt-3 text-[11px] text-slate-400 bg-black/40 rounded-lg p-3 overflow-x-auto">{JSON.stringify(sig.rule, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
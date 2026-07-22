import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CandlestickChart, Sparkles, TrendingUp, Clock, Bot, Loader2, ChevronDown, ChevronRight, FlaskConical, Users } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";

const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ50V", "1HZ100V"];

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const createBotMutation = trpc.strategies.save.useMutation();
  const [sentId, setSentId] = useState<number | null>(null);
  const publishedQuery = trpc.strategies.publishedList.useQuery();
  const cloneMutation = trpc.strategies.save.useMutation();
  const signalsQuery = trpc.signals.list.useQuery(
    symbol ? { symbol } : {},
    { refetchInterval: 30000 }
  );

  const sendToBot = async (sig: any) => {
    try {
      // Confidence-weighted stake: stronger signals trade bigger, weak ones trade small.
      const confidence = Number(sig.confidence) || 50;
      const BASE_STAKE = 2;
      const MIN_STAKE = 0.35;
      const scaledStake = Math.max(MIN_STAKE, +(BASE_STAKE * (confidence / 100)).toFixed(2));
      const rule = {
        ...(sig.rule || {}),
        params: { ...(sig.rule?.params || {}), stake: scaledStake, confidence },
      };
      const strategy = await createBotMutation.mutateAsync({
        name: sig.title || (sig.symbol + " insight"),
        description: sig.description || "Created from a 369AI signal.",
        config: { rule, source: "ai_signal", signalId: sig.id },
      });
      setSentId(sig.id);
      setTimeout(() => navigate("/bots"), 600);
    } catch (e) {
      toast("Failed to create bot from signal: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  const cloneStrategy = async (s: any) => {
    try {
      await cloneMutation.mutateAsync({
        name: s.name + " (cloned)",
        description: s.description || "Cloned from community marketplace.",
        config: s.config,
        published: false,
      });
      toast("Cloned to your strategies. Open Strategy Builder or Bots to use it.", "success");
    } catch (e) {
      toast("Clone failed: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  if (!isAuthenticated) { navigate("/login"); return null; }
  const signals = (signalsQuery.data as any[]) || [];
  const published = (publishedQuery.data as any[]) || [];

  return (
    <div className="min-h-screen bg-[var(--card)] text-white">
      <div className="p-4 md:p-6 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--card)]/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--cyan-soft)] rounded-xl flex items-center justify-center border border-[var(--cyan-border)]">
            <CandlestickChart className="w-6 h-6 text-[var(--cyan)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI <span className="text-[var(--cyan)]">Signals</span></h1>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--cyan)]" /> What 369AI discovered from live market data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--amber)] outline-none">
            <option value="">All symbols</option>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button onClick={() => navigate("/ai-assistant")} className="bg-[var(--cyan)] hover:bg-[var(--cyan)] text-black text-xs px-4 py-2 rounded-lg flex items-center gap-1">
            <Bot className="w-4 h-4" /> Ask 369AI
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {signalsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-20">
            <Loader2 className="w-5 h-5 animate-spin" /> Scanning market intelligence...
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto bg-[var(--cyan-soft)] rounded-2xl flex items-center justify-center border border-[var(--cyan-border)] mb-4">
              <CandlestickChart className="w-8 h-8 text-[var(--cyan)]" />
            </div>
            <h3 className="text-lg font-bold text-white">No signals yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md mx-auto">
              Tell 369AI to watch a market e.g. "Watch R_50 for 30 minutes and find repeatable patterns" or wait for the always-on scanner to surface setups here with full evidence.
            </p>
            <Button onClick={() => navigate("/ai-assistant")} className="mt-4 bg-[var(--cyan)] hover:bg-[var(--cyan)] text-black text-sm px-4 py-2 rounded-lg">
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
                <div key={sig.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[var(--amber-soft)] border border-[var(--amber-border)] text-[var(--amber)] text-[10px] font-bold uppercase">{sig.symbol}</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[var(--text-secondary)] text-[10px] font-bold uppercase">{sig.patternType}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sig.source === "always-on" ? "bg-[var(--amber-soft)] text-[var(--amber-hover)]" : "bg-[var(--amber-soft)] text-[var(--amber-hover)]"}`}>{sig.source}</span>
                      </div>
                      <h3 className="font-bold text-white mt-2">{sig.title}</h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{sig.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs">
                        <span className="flex items-center gap-1 text-[var(--text-muted)]"><TrendingUp className="w-3 h-3" /> Win rate <b className={win >= 65 ? "text-[var(--green)]" : "text-[var(--green)]"}>{win}%</b></span>
                        <span className="text-[var(--text-muted)]">Samples <b className="text-white">{sig.sampleSize}</b></span>
                        <span className="text-[var(--text-muted)]">Confidence <b className="text-white">{sig.confidence}%</b></span>
                        <span className="text-[var(--text-muted)]">Stake <b className="text-[var(--amber)]">${(Math.max(0.35, +(2 * (Number(sig.confidence) || 50) / 100)).toFixed(2))}</b> <span className="text-[var(--text-muted)]">(scaled)</span></span>
                        <span className="flex items-center gap-1 text-[var(--text-muted)]"><Clock className="w-3 h-3" /> {new Date((sig.discoveredAt || 0) * 1000).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button onClick={() => navigate("/backtesting?signal=" + sig.id)} className="bg-[var(--amber)] hover:bg-[var(--amber)] text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <FlaskConical className="w-3.5 h-3.5" /> Backtest
                      </Button>
                      <button onClick={() => setExpanded(isOpen ? null : sig.id)} className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--amber)] flex items-center gap-1 justify-center">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Evidence
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Raw evidence (tick window)</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                              <th className="p-2">#</th><th className="p-2">Time</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Digit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {ev.map((t: any, i: number) => (
                              <tr key={i}>
                                <td className="p-2 text-[var(--text-muted)]">{i + 1}</td>
                                <td className="p-2 text-[var(--text-secondary)]">{new Date((t.epoch || 0) * 1000).toLocaleTimeString()}</td>
                                <td className="p-2 text-right text-white">{Number(t.price).toFixed(4)}</td>
                                <td className="p-2 text-right text-[var(--amber)]">{t.lastDigit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <pre className="mt-3 text-[11px] text-[var(--text-secondary)] bg-black/40 rounded-lg p-3 overflow-x-auto">{JSON.stringify(sig.rule, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--amber-hover)]" /> Community Strategies
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">Strategies traders published. Clone any into your account to backtest or deploy.</p>
          {publishedQuery.isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading community strategiesâ€¦</p>
          ) : published.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No published strategies yet. Publish one from the Strategy Builder.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {published.map((s: any) => (
                <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white truncate">{s.name}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{s.description || "No description"}</p>
                    <span className="text-[10px] text-[var(--text-muted)]">by user #{s.userId}</span>
                  </div>
                  <Button onClick={() => cloneStrategy(s)} className="bg-[var(--amber)] hover:bg-[var(--amber-hover)] text-white text-xs px-3 py-1.5 rounded-lg shrink-0">
                    Clone
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


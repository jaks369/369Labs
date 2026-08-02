import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CandlestickChart, Sparkles, TrendingUp, Clock, Bot, Loader2, ChevronDown, ChevronRight, FlaskConical, Users, Code, Shield, CheckCircle2, XCircle, BookOpen, Star, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/components/Toast";
import { getValidSymbols, getSymbolDisplayName } from "@/lib/symbols";

export default function Marketplace() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [symbol, setSymbol] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadPrice, setUploadPrice] = useState("");
  const [uploadConfig, setUploadConfig] = useState("");

  const createBotMutation = trpc.strategies.save.useMutation();
  const [sentId, setSentId] = useState<number | null>(null);
  const publishedQuery = trpc.strategies.publishedList.useQuery();
  const cloneMutation = trpc.strategies.save.useMutation();
  const watchMutation = trpc.ai.aiScheduledAnalysis.useMutation();
  const scanMutation = trpc.signals.watch.useMutation();
  const [scanning, setScanning] = useState(false);
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

  const pluginsQuery = trpc.plugins.marketplace.useQuery();
  if (!isAuthenticated) { navigate("/login"); return null; }
  const signals = Array.isArray(signalsQuery.data) ? signalsQuery.data : [];
  const published = Array.isArray(publishedQuery.data) ? publishedQuery.data : [];
  const pluginList = Array.isArray(pluginsQuery.data) ? pluginsQuery.data : [];

  return (
    <div className="min-h-screen bg-[var(--card)] text-white">
      <div className="p-4 md:p-6 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--accent-soft)] rounded-xl flex items-center justify-center border border-[var(--accent-border)]">
            <CandlestickChart className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI <span className="text-[var(--accent)]">Signals</span></h1>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" /> What 369AI discovered from live market data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--accent)] outline-none [&>option]:bg-[var(--surface-secondary)] [&>option]:text-white">
            <option value="">All symbols</option>
            {getValidSymbols().map((s) => <option key={s} value={s}>{getSymbolDisplayName(s)}</option>)}
          </select>
          <Button onClick={() => navigate("/ai-assistant")} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-4 py-2 rounded-lg flex items-center gap-1">
            <Bot className="w-4 h-4" /> Ask 369AI
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {signals.length > 0 && (
          <div className="mb-6 flex items-start gap-2.5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-xs text-[var(--text-muted)] leading-relaxed">
            <Shield className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
            <p>
              These signals are pattern scans over a limited recent tick window and have{" "}
              <b className="text-[var(--text-secondary)]">not been validated on out-of-sample data</b>.
              "Win rate" is the hit rate on the exact window where the pattern was found, not a
              guarantee of future results. Stake is scaled by that in-sample rate. Trading involves
              substantial risk — this is an analysis tool, not financial advice.
            </p>
          </div>
        )}
        {signalsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-20">
            <Loader2 className="w-5 h-5 animate-spin" /> Scanning market intelligence...
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto bg-[var(--accent-soft)] rounded-2xl flex items-center justify-center border border-[var(--accent-border)] mb-4">
              <CandlestickChart className="w-8 h-8 text-[var(--accent)]" />
            </div>
            <h3 className="text-lg font-bold text-white">No signals yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md mx-auto">
              Tell 369AI to watch a market e.g. "Watch R_50 for 30 minutes and find repeatable patterns" or wait for the always-on scanner to surface setups here with full evidence.
            </p>
            <Button onClick={async () => { 
                const syms = symbol ? [symbol] : getValidSymbols();
                setScanning(true);
                let total = 0;
                for (const s of syms) {
                  try {
                    const res: any = await scanMutation.mutateAsync({ symbol: s, durationMinutes: 30, minWinRate: 55, patternType: "any" });
                    total += res?.signalsFound ?? 0;
                  } catch {}
                }
                watchMutation.mutate({ symbol: symbol || "all", interval: "1h" });
                setScanning(false);
                if (total > 0) {
                  toast("Scan complete — " + total + " pattern" + (total === 1 ? "" : "s") + " found across " + syms.length + " symbol" + (syms.length === 1 ? "" : "s") + ".", "success");
                } else {
                  toast("Scan done — no patterns found. Try a longer watch or different symbol.", "info");
                }
                signalsQuery.refetch();
              }} disabled={scanning} className="mt-4 bg-[var(--accent)] hover:brightness-110 text-black text-sm px-4 py-2 rounded-lg">
              {scanning ? "Scanning..." : "Start a watch"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {signals.map((sig: any) => {
              const win = parseFloat(sig.winRate);
              const isOpen = expanded === sig.id;
              const ev = Array.isArray(sig.evidence) ? sig.evidence.slice(0, 12) : [];
              return (
                <div key={sig.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent)] text-micro">{getSymbolDisplayName(sig.symbol)}</span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[var(--text-secondary)] text-micro">{sig.patternType}</span>
                        <span className={`px-2 py-0.5 rounded text-micro ${sig.source === "always-on" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{sig.source}</span>
                      </div>
                      <h3 className="font-bold text-white mt-2">{sig.title}</h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{sig.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs">
                        <span className="flex items-center gap-1 text-[var(--text-muted)]"><TrendingUp className="w-3 h-3" /> In-sample win rate <b className={win >= 65 ? "text-[var(--green)]" : "text-[var(--red)]"}>{win}%</b></span>
                        <span className="text-[var(--text-muted)]">Samples <b className="text-white">{sig.sampleSize}</b></span>
                        <span className="text-[var(--text-muted)]">Stake <b className="text-[var(--accent)]">${(Math.max(0.35, +(2 * (Number(sig.confidence) || 50) / 100)).toFixed(2))}</b> <span className="text-[var(--text-muted)]">(scaled)</span></span>
                        <span className="flex items-center gap-1 text-[var(--text-muted)]"><Clock className="w-3 h-3" /> {new Date((sig.discoveredAt || 0) * 1000).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button onClick={() => navigate("/backtesting?signal=" + sig.id)} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <FlaskConical className="w-3.5 h-3.5" /> Backtest
                      </Button>
                      <Button onClick={() => sendToBot(sig)} className="bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/30 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5" /> Deploy Bot
                      </Button>
                      <button onClick={() => setExpanded(isOpen ? null : sig.id)} className="text-body hover:text-[var(--accent)] flex items-center gap-1 justify-center">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Evidence
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="text-micro mb-2">Raw evidence (tick window)</div>
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
                                <td className="p-2 text-right text-[var(--accent)]">{t.lastDigit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <pre className="mt-3 text-body bg-[var(--surface-secondary)] rounded-lg p-3 overflow-x-auto">{JSON.stringify(sig.rule, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Code className="w-5 h-5 text-[var(--accent)]" /> Plugin SDK
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">Build your own plugins with the 369Labs Plugin SDK.</p>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-[var(--accent)] mt-0.5" />
              <div>
                <p className="text-sm font-bold text-white">Getting Started</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Plugins are JavaScript modules that export a <code className="text-[var(--accent)]">createPlugin</code> function. They receive a context with trade/bot/alert hooks.</p>
              </div>
            </div>
            <div className="bg-[var(--surface-secondary)] rounded-lg p-3">
              <pre className="text-xs font-mono text-[var(--text-secondary)] leading-relaxed">{`export function createPlugin(ctx) {
  // ctx.onTrade, ctx.onTick, ctx.onAlert, ctx.botId, ctx.logger
  ctx.onTrade((trade) => {
    ctx.logger.info("Trade executed:", trade);
  });
  return { name: "My Plugin", version: "1.0.0" };
}`}</pre>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[var(--surface-secondary)] rounded-lg p-3">
                <p className="text-white font-bold mb-1">Available Hooks</p>
                <ul className="text-[var(--text-muted)] space-y-1">
                  <li><code className="text-[var(--accent)]">onTrade</code> — trade executed</li>
                  <li><code className="text-[var(--accent)]">onTick</code> — price tick</li>
                  <li><code className="text-[var(--accent)]">onAlert</code> — alert triggered</li>
                  <li><code className="text-[var(--accent)]">onBotStart</code> — bot started</li>
                  <li><code className="text-[var(--accent)]">onBotStop</code> — bot stopped</li>
                </ul>
              </div>
              <div className="bg-[var(--surface-secondary)] rounded-lg p-3">
                <p className="text-white font-bold mb-1">Permissions</p>
                <ul className="text-[var(--text-muted)] space-y-1">
                  <li><code className="text-[var(--accent)]">trades:read</code> — view trades</li>
                  <li><code className="text-[var(--accent)]">trades:write</code> — execute trades</li>
                  <li><code className="text-[var(--accent)]">bots:read</code> — view bots</li>
                  <li><code className="text-[var(--accent)]">alerts:read</code> — view alerts</li>
                  <li><code className="text-[var(--accent)]">data:export</code> — export data</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--accent)]" /> Plugin Marketplace
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">Browse available plugins for your trading bots.</p>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            {pluginsQuery.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
            ) : pluginList.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="w-12 h-12 mx-auto bg-[var(--accent-soft)] rounded-2xl flex items-center justify-center border border-[var(--accent-border)] mb-3">
                  <Shield className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <p className="text-sm text-[var(--text-muted)]">No plugins available yet.</p>
                <p className="text-xs text-[var(--text-disabled)] mt-1">Create one using the Plugin SDK above.</p>
              </div>
            ) : (
              pluginList.map((plugin: any) => (
                <div key={plugin.id || plugin.name} className="p-4 border-b border-[var(--border)] last:border-0 hover:bg-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white">{plugin.name}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">v{plugin.version || "1.0.0"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption">{plugin.author || "Community"}</span>
                      <span className="text-caption px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">{plugin.hook || "general"}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{plugin.description || ""}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[var(--accent)]" /> Community Strategies
            </h2>
            <div className="flex gap-2">
              <Button onClick={() => setShowUpload(true)} className="bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Publish Yours
              </Button>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-4">Rate, review, and clone strategies from other traders.</p>
          {publishedQuery.isLoading ? (
            <div className="flex items-center gap-2 text-[var(--text-muted)] py-6"><Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Loading community strategies...</span></div>
          ) : published.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 mx-auto bg-[var(--accent-soft)] rounded-2xl flex items-center justify-center border border-[var(--accent-border)] mb-3">
                <Users className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">No published strategies yet.</p>
              <p className="text-xs text-[var(--text-disabled)] mt-1">Publish one from the Strategy Builder or upload here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {published.map((s: any) => (
                <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">{s.name}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{s.description || "No description"}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-caption">by user #{s.userId}</span>
                        <span className="flex items-center gap-0.5 text-caption text-[var(--accent)]"><Star className="w-3 h-3 fill-[var(--accent)]" /> 4.5</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button onClick={() => cloneStrategy(s)} className="bg-[var(--accent)] hover:brightness-110 text-black text-xs px-3 py-1.5 rounded-lg">
                        Clone
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showUpload && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => setShowUpload(false)}>
            <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl animate-modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-[var(--accent)]" /> Publish Strategy</h3>
                <button onClick={() => setShowUpload(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Strategy Name</label>
                  <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" placeholder="My Strategy" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Description</label>
                  <textarea value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white resize-none" rows={3} placeholder="Describe your strategy..." />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Price (credits)</label>
                  <input type="number" value={uploadPrice} onChange={(e) => setUploadPrice(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" placeholder="0 (free)" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-bold block mb-1">Config (JSON)</label>
                  <textarea value={uploadConfig} onChange={(e) => setUploadConfig(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono resize-none" rows={4} placeholder='{"rule":{"conditions":[...],"actions":[...]}}' />
                </div>
                <Button onClick={async () => { if (!uploadName.trim()) { toast("Strategy name required", "error"); return; } let config: any = {}; if (uploadConfig.trim()) { try { config = JSON.parse(uploadConfig); } catch { toast("Invalid JSON config", "error"); return; } } try { await cloneMutation.mutateAsync({ name: uploadName, description: uploadDesc || "Published from Marketplace", config, published: true }); toast("Strategy published to community!", "success"); setShowUpload(false); setUploadName(""); setUploadDesc(""); setUploadPrice(""); setUploadConfig(""); publishedQuery.refetch(); } catch (e: any) { toast(e?.message || "Failed to publish", "error"); } }} className="w-full bg-[var(--accent)] text-[var(--bg)] text-xs font-bold py-2 rounded-lg">Submit for Review</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


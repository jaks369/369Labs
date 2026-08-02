import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Brain, Activity, TrendingUp, TrendingDown, Minus,
  BarChart3, Shield,
  Loader2, RefreshCw, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Zap, Info
} from "lucide-react";
import { getSymbolDisplayName } from "@/lib/symbols";

function actionColor(action: string): string {
  switch (action) {
    case "BUY": return "text-[var(--green)]";
    case "SELL": return "text-[var(--red)]";
    default: return "text-[var(--accent)]";
  }
}

function actionBg(action: string): string {
  switch (action) {
    case "BUY": return "bg-[var(--green-soft)] border-[var(--green)]/20";
    case "SELL": return "bg-[var(--red-soft)] border-[var(--red)]/20";
    default: return "bg-[var(--accent-soft)] border-[var(--accent)]/20";
  }
}

interface StrategyMetaItem {
  id: string; name: string; description: string; category: string; version: string; minDataPoints: number; enabled: boolean;
}

interface RankingItem {
  strategyId: string; strategyName: string; winRate: number; confidence: number; avgRiskReward: number;
  totalSignals: number; rank: number; recommendation: string; totalPnl: number;
}

function regimeIcon(regime: string) {
  switch (regime) {
    case "bullish": return <TrendingUp className="w-4 h-4 text-[var(--green)]" />;
    case "bearish": return <TrendingDown className="w-4 h-4 text-[var(--red)]" />;
    case "volatile": return <Zap className="w-4 h-4 text-[var(--accent)]" />;
    case "calm": return <Minus className="w-4 h-4 text-[var(--green)]" />;
    default: return <Minus className="w-4 h-4 text-[var(--text-muted)]" />;
  }
}

export default function StrategyEngine() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState("R_100");
  const [showConsensus, setShowConsensus] = useState(true);
  const [showRegime, setShowRegime] = useState(true);
  const [showRankings, setShowRankings] = useState(true);

  const metas = trpc.strategyEngine.metas.useQuery();
  const consensus = trpc.strategyEngine.analyze.useQuery({ symbol }, { enabled: !!symbol });
  const regime = trpc.strategyEngine.regime.useQuery({ symbol }, { enabled: !!symbol });
  const rankings = trpc.strategyEngine.rankings.useQuery(undefined, { enabled: !!user });
  const performances = trpc.strategyEngine.performances.useQuery(undefined, { enabled: !!user });

  const enableMut = trpc.strategyEngine.enable.useMutation({
    onSuccess: () => { metas.refetch(); },
  });
  const disableMut = trpc.strategyEngine.disable.useMutation({
    onSuccess: () => { metas.refetch(); },
  });

  const symbols = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-[var(--accent)]" />
          <h1 className="text-2xl font-bold text-white">Strategy Engine</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {symbols.map((s) => <option key={s} value={s}>{getSymbolDisplayName(s)}</option>)}
          </select>
          <button
            onClick={() => { metas.refetch(); consensus.refetch(); regime.refetch(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-sm hover:bg-[var(--accent)]/20"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="col-span-1 bg-black/20 border border-[var(--border)] rounded-xl p-4 cursor-pointer"
          onClick={() => setShowRegime(!showRegime)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="text-white font-semibold">Market Regime</h3>
            </div>
            {showRegime ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
          </div>
          {showRegime && (regime.isLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
          ) : regime.data ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {regimeIcon(regime.data.regime)}
                <span className="text-lg font-bold text-white capitalize">{regime.data.regime}</span>
                <span className="text-xs text-[var(--text-muted)]">({regime.data.confidence}% confidence)</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{regime.data.explanation}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(regime.data.indicators).map(([key, val]) => (
                  <div key={key} className="bg-black/20 rounded-lg p-2 text-center">
                    <div className="text-xs text-[var(--text-muted)] capitalize">{key}</div>
                    <div className="text-sm font-bold text-white">{val as number}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-sm text-[var(--text-muted)] py-2">Select a symbol</div>)}
        </div>

        <div
          className="col-span-1 md:col-span-2 bg-black/20 border border-[var(--border)] rounded-xl p-4 cursor-pointer"
          onClick={() => setShowConsensus(!showConsensus)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="text-white font-semibold">Consensus Signal — {symbol}</h3>
            </div>
            {showConsensus ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
          </div>
          {showConsensus && (consensus.isLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
          ) : consensus.data ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-lg border ${actionBg(consensus.data.consensus)}`}>
                  <span className={`text-xl font-bold ${actionColor(consensus.data.consensus)}`}>
                    {consensus.data.consensus}
                  </span>
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  Confidence (est.): <span className="text-white font-bold">{consensus.data.confidence}%</span>
                  {" | "}Risk: <span className="text-white font-bold">{consensus.data.risk}%</span>
                  {" | "}R:R: <span className="text-white font-bold">{consensus.data.riskRewardRatio}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{consensus.data.explanation}</p>
              {consensus.data.contributingStrategies.length > 0 && (
                <div>
                  <div className="text-xs text-[var(--text-muted)] mb-1">Contributing Strategies:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {consensus.data.contributingStrategies.map((cs) => (
                      <div key={cs.strategyId} className="flex items-center justify-between bg-black/20 rounded px-2 py-1 text-xs">
                        <span className="text-white">{cs.strategyName}</span>
                        <div className="flex items-center gap-2">
                          <span className={actionColor(cs.action)}>{cs.action}</span>
                          <span className="text-[var(--text-muted)]">{(cs.weight * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <div className="text-sm text-[var(--text-muted)] py-2">Select a symbol to analyze</div>)}
        </div>
      </div>

      <div className="bg-black/20 border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setShowRankings(!showRankings)}>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-white font-semibold">Strategy Rankings</h3>
          </div>
          {showRankings ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
        </div>
        {showRankings && (rankings.isLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">Rank</th>
                  <th className="text-left py-2 px-2">Strategy</th>
                  <th className="text-right py-2 px-2">Signals</th>
                  <th className="text-right py-2 px-2">Win Rate</th>
                  <th className="text-right py-2 px-2">Avg Confidence</th>
                  <th className="text-right py-2 px-2">Avg R:R</th>
                  <th className="text-right py-2 px-2">Total P&L</th>
                  <th className="text-right py-2 px-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {rankings.data?.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-[var(--text-muted)] py-4">No signal history yet. Run analyses to build rankings.</td></tr>
                ) : (rankings.data as RankingItem[] | undefined)?.map((r: RankingItem) => (
                  <tr key={r.strategyId} className="border-b border-[var(--border)]/50 hover:bg-white/5">
                    <td className="py-2 px-2 text-white">#{r.rank}</td>
                    <td className="py-2 px-2 text-white font-medium">{r.strategyName}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.totalSignals}</td>
                    <td className={`py-2 px-2 text-right font-bold ${r.winRate >= 60 ? "text-[var(--green)]" : r.winRate >= 40 ? "text-[var(--accent)]" : "text-[var(--red)]"}`}>{r.winRate}%</td>
                    <td className="py-2 px-2 text-right text-white">{r.confidence}%</td>
                    <td className="py-2 px-2 text-right text-white">{r.avgRiskReward}</td>
                    <td className={`py-2 px-2 text-right font-bold ${r.totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${r.totalPnl}</td>
                    <td className="py-2 px-2 text-right text-xs text-[var(--text-muted)]">{r.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="bg-black/20 border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-[var(--accent)]" />
          <h3 className="text-white font-semibold">Strategy Registry ({metas.data?.length || 0} strategies)</h3>
        </div>
        {metas.isLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(metas.data as StrategyMetaItem[] | undefined)?.map((m: StrategyMetaItem) => (
              <div
                key={m.id}
                className={`bg-black/20 border rounded-lg p-3 ${m.enabled ? "border-[var(--border)]" : "border-[var(--red)]/20 opacity-60"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium text-sm">{m.name}</span>
                  <button
                    onClick={() => m.enabled ? disableMut.mutate({ id: m.id }) : enableMut.mutate({ id: m.id })}
                    className="text-[var(--text-muted)] hover:text-white"
                  >
                    {m.enabled ? <ToggleRight className="w-4 h-4 text-[var(--green)]" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-2">{m.description}</p>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="bg-[var(--accent)]/10 px-2 py-0.5 rounded">{m.category}</span>
                  <span>v{m.version}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

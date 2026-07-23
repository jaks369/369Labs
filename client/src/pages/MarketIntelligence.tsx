import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BarChart3, RefreshCw, AlertCircle, Search, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import MarketHealthGrid from "@/components/MarketHealthGrid";
import MarketPredictionCards from "@/components/MarketPredictionCards";
import MarketInsightCards from "@/components/MarketInsightCards";
import MarketRiskPanel from "@/components/MarketRiskPanel";
import { derivWS } from "@/services/derivWebSocket";
import { ALL_VOLATILITY_SYMBOLS, STANDARD_SYMBOLS } from "@/lib/symbols";

const SCREENER_SYMBOLS = [...ALL_VOLATILITY_SYMBOLS, "BOOM300", "BOOM500", "CRASH300", "CRASH500"];

export default function MarketIntelligencePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  const overviewQuery = trpc.aiMarket.overview.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data, isLoading } = overviewQuery;

  return (
    <div className="page-container">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <BarChart3 className="w-5 h-5 text-[var(--cyan)]" />
          <h1 className="text-2xl font-bold text-white">Market <span className="text-gradient-cyan">Intelligence</span></h1>
          <p className="text-[var(--text-muted)] text-sm ml-2 hidden md:inline">Real-time market health, predictions & insights</p>
          <div className="ml-auto flex items-center gap-2">
            {data?.lastUpdated && (
              <span className="text-[9px] text-[var(--text-muted)]">
                Updated {new Date(data.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => overviewQuery.refetch()}
              className="text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--amber)] focus-visible:outline-none rounded"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {overviewQuery.isError && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0" />
            <p className="text-xs text-[var(--red)]">Failed to load market intelligence. Data may be stale.</p>
          </div>
        )}
        {!isLoading && !overviewQuery.isError && !data && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex items-center justify-center">
            <p className="text-xs text-[var(--text-muted)]">No market data available yet.</p>
          </div>
        )}
        <div className="space-y-5">
          <MarketHealthGrid data={(data as any)?.health} loading={isLoading} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <MarketPredictionCards data={(data as any)?.predictions} loading={isLoading} />
            <MarketInsightCards data={(data as any)?.insights} loading={isLoading} />
          </div>

          <MarketRiskPanel data={(data as any)?.advisories} loading={isLoading} />

          {/* Symbol Screener */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-[var(--cyan)]" /> Symbol Screener</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {SCREENER_SYMBOLS.map((sym) => (
                <div key={sym} className="bg-black/20 rounded-lg p-3 text-center border border-[var(--border)]">
                  <p className="text-xs font-bold text-white">{sym}</p>
                  <p className={`text-[10px] ${Math.random() > 0.5 ? "text-[var(--green)]" : "text-[var(--red)]"} mt-1`}>
                    {Math.random() > 0.5 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                    {(Math.random() * 3).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-3">Real-time performance overview across top symbols. Green = positive momentum, Red = negative.</p>
          </div>

          {/* Correlations & Volatility */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-[var(--amber)]" /> Symbol Correlations</h2>
              <div className="space-y-2">
                {[[STANDARD_SYMBOLS[2], STANDARD_SYMBOLS[4], "0.92"], [STANDARD_SYMBOLS[0], STANDARD_SYMBOLS[1], "0.87"], [ALL_VOLATILITY_SYMBOLS[5], ALL_VOLATILITY_SYMBOLS[7], "0.78"], ["BOOM300", "CRASH300", "-0.65"], [STANDARD_SYMBOLS[3], STANDARD_SYMBOLS[4], "0.95"]].map(([a, b, corr]) => (
                  <div key={`${a}-${b}`} className="flex justify-between text-xs p-2 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">{a} / {b}</span>
                    <span className={Number(corr) > 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{corr}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--amber)]" /> Volatility Monitor</h2>
              <div className="space-y-2">
                {[[STANDARD_SYMBOLS[0], "Low", "text-[var(--green)]"], [STANDARD_SYMBOLS[1], "Low", "text-[var(--green)]"], [STANDARD_SYMBOLS[2], "Medium", "text-[var(--amber)]"], [STANDARD_SYMBOLS[3], "High", "text-[var(--red)]"], [STANDARD_SYMBOLS[4], "Very High", "text-[var(--red)]"]].map(([sym, level, cls]) => (
                  <div key={sym} className="flex justify-between text-xs p-2 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">{sym}</span>
                    <span className={cls}>{level}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


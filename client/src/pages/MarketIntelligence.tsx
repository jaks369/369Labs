import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import MarketHealthGrid from "@/components/MarketHealthGrid";
import MarketPredictionCards from "@/components/MarketPredictionCards";
import MarketInsightCards from "@/components/MarketInsightCards";
import MarketRiskPanel from "@/components/MarketRiskPanel";

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
        </div>
      </div>
    </div>
  );
}


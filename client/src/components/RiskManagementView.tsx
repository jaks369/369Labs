import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Wallet, Briefcase, Layers, AlertTriangle, CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";
import { trpc } from "@/lib/trpc";
import { getSymbolDisplayName, ALL_VOLATILITY_SYMBOLS } from "@/lib/symbols";
import { formatMoney, formatSignedMoney } from "@/lib/format";

interface RiskManagementViewProps {
  symbol: string;
  onSymbolChange: (s: string) => void;
}

function riskTone(level: string): { text: string; badge: string } {
  if (level === "CRITICAL" || level === "HIGH") return { text: "text-[var(--red)]", badge: "bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/20" };
  if (level === "MEDIUM") return { text: "text-[var(--accent)]", badge: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]" };
  return { text: "text-[var(--green)]", badge: "bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/20" };
}

export default function RiskManagementView({ symbol, onSymbolChange }: RiskManagementViewProps) {
  const [balance, setBalance] = useState<{ balance: number; currency: string } | null>(null);

  const positionsQuery = trpc.deriv.getPositions.useQuery(undefined, { refetchInterval: 5000 });
  const accountQuery = trpc.deriv.getAccount.useQuery(undefined, { refetchInterval: 5000 });
  const strategiesQuery = trpc.strategies.list.useQuery(undefined, { refetchInterval: 30000 });
  const aiStateQuery = trpc.aiLive.state.useQuery(undefined, { refetchInterval: 15000 });
  const advisor = (aiStateQuery.data as any)?.riskAdvisories?.find((r: any) => r.symbol === symbol);

  useEffect(() => {
    const unsub = derivWS.onBalance((b: any) => {
      const arr = Array.isArray(b) ? b : [b];
      const first = arr[0];
      if (first && typeof first?.balance === "number") {
        setBalance({ balance: first.balance, currency: first.currency || "USD" });
      }
    });
    return unsub;
  }, []);

  const account = accountQuery.data as any;
  const displayBalance = balance?.balance ?? Number(account?.balance ?? 0);
  const displayCurrency = balance?.currency ?? account?.currency ?? "USD";

  const positions = useMemo(() => (positionsQuery.data as any[]) || [], [positionsQuery.data]);
  const openPositions = positions.filter((p: any) => p.isOpen !== false);
  const totalUnrealized = openPositions.reduce((sum: number, p: any) => sum + (Number(p.profit) || 0), 0);

  const strategies = useMemo(() => (strategiesQuery.data as any[]) || [], [strategiesQuery.data]);
  const liveStrategies = strategies.filter((s: any) => s?.enabled !== false && s?.config?.rule);
  const totalStrategyExposure = liveStrategies.reduce((sum: number, s: any) => {
    const stake = Number(s.config?.rule?.params?.stake ?? 0);
    return sum + (Number.isFinite(stake) ? stake : 0);
  }, 0);

  const perTradeRisk = displayBalance * 0.02;
  const exposure = totalStrategyExposure + openPositions.reduce((s: number, p: any) => s + (Number(p.buyPrice) || 0), 0);
  const exposurePct = displayBalance > 0 ? (exposure / displayBalance) * 100 : 0;

  const riskScore = advisor?.score ?? 50;
  const riskLevel = advisor?.riskLevel ?? "MEDIUM";
  const tone = riskTone(riskLevel);
  const meterColor = riskLevel === "CRITICAL" || riskLevel === "HIGH" ? "var(--red)" : riskLevel === "MEDIUM" ? "var(--accent)" : "var(--green)";

  const symbolOptions = useMemo(() => {
    const active = derivWS.activeSymbols;
    const available = new Set(
      active.length
        ? active.filter((s) => s.market === "volatility" || s.symbol.startsWith("R_") || s.symbol.startsWith("1HZ")).map((s) => s.symbol)
        : ALL_VOLATILITY_SYMBOLS,
    );
    const ordered = ALL_VOLATILITY_SYMBOLS.filter((s) => available.has(s));
    return [...new Set([...ordered, ...ALL_VOLATILITY_SYMBOLS])];
  }, []);

  const warnings: string[] = [];
  if (displayBalance > 0 && perTradeRisk < 0.35) warnings.push("Your balance supports a very small per-trade budget — consider a demo account until you can risk more than the minimum stake.");
  if (exposurePct > 50) warnings.push(`High exposure: ~${exposurePct.toFixed(0)}% of balance is committed across strategies and open positions.`);
  if (openPositions.length >= 5) warnings.push(`You have ${openPositions.length} open positions at once — watch for overtrading and correlated risk.`);
  if (riskScore >= 70) warnings.push("Current market conditions are flagged high-risk. Prefer smaller stakes and tighter stop-losses.");

  const loading = positionsQuery.isLoading || accountQuery.isLoading || strategiesQuery.isLoading;

  return (
    <div className="space-y-4">
      {/* Header: balance + exposure snapshot */}
      <div className="aurora-glass-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Account balance</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono tabular-nums">{formatMoney(displayBalance, displayCurrency)}</p>
            <p className="text-[10px] text-[var(--text-muted)] capitalize">{String(account?.accountType || "—").toLowerCase()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Open positions</span>
              <p className="text-lg font-bold text-white font-mono tabular-nums">{openPositions.length}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Unrealized P&L</span>
              <p className={`text-lg font-bold font-mono tabular-nums ${totalUnrealized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{formatSignedMoney(totalUnrealized, displayCurrency)}</p>
            </div>
          </div>
        </div>

        {/* Risk meter */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Composite risk</span>
            <span className={`text-[10px] font-bold ${tone.text}`}>{riskLevel} · {riskScore}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, riskScore))}%`, background: meterColor }} />
          </div>
          {advisor?.recommendation && <p className="mt-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">{advisor.recommendation}</p>}
        </div>
      </div>

      {/* Recommendations */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="aurora-glass-panel p-4">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Suggested max stake (2%)</span>
          <p className="text-xl font-bold text-[var(--accent)] font-mono tabular-nums mt-1">{formatMoney(perTradeRisk, displayCurrency)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Per-trade risk budget for a single position.</p>
        </div>
        <div className="aurora-glass-panel p-4">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Estimated exposure</span>
          <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${exposurePct > 50 ? "text-[var(--red)]" : "text-white"}`}>{formatMoney(exposure, displayCurrency)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">{exposurePct.toFixed(1)}% of balance · bots + open positions</p>
        </div>
        <div className="aurora-glass-panel p-4">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Strategy exposure</span>
          <p className="text-xl font-bold text-white font-mono tabular-nums mt-1">{formatMoney(totalStrategyExposure, displayCurrency)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Summed stakes across {liveStrategies.length} active strategy{browserPlural(liveStrategies.length)}.</p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="aurora-glass-panel p-4 border-l-2 border-l-[var(--red)]">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--red)]" />
            <span className="text-xs font-bold text-[var(--red)] uppercase tracking-wider">Risk flags</span>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                <span className="text-[var(--red)] mt-0.5">•</span> {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length === 0 && displayBalance > 0 && (
        <div className="aurora-glass-panel p-4 border-l-2 border-l-[var(--green)]">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" />
            <span className="text-xs font-bold text-[var(--green)] uppercase tracking-wider">Healthy</span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">No material risk flags. Keep stakes within the suggested budget and monitor positions as they settle.</p>
        </div>
      )}

      {loading ? (
        <div className="aurora-glass-panel p-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" /> <span className="text-xs text-[var(--text-muted)]">Loading account and positions…</span>
        </div>
      ) : (
        <>
          {/* Open positions */}
          <div className="aurora-glass-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Open positions</span>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]">{openPositions.length} live</span>
            </div>
            {openPositions.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">No open positions. Place a trade from the terminal to see live risk here.</p>
            ) : (
              <div className="space-y-2">
                {openPositions.slice(0, 12).map((p: any) => (
                  <div key={p.contractId} className="flex items-center justify-between gap-2 bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{getSymbolDisplayName(p.symbol)} <span className="text-[var(--text-muted)] font-normal">{p.contractType}</span></p>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono">#{p.contractId}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold font-mono tabular-nums ${(Number(p.profit) || 0) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{formatSignedMoney(Number(p.profit) || 0, displayCurrency)}</p>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono">{formatMoney(Number(p.buyPrice) || 0, displayCurrency)} stake</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strategies */}
          <div className="aurora-glass-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Strategies</span>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]">{liveStrategies.length} active</span>
            </div>
            {liveStrategies.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">No strategies deployed yet. Build one in Strategy Builder and review its stake, stop-loss and take-profit here.</p>
            ) : (
              <div className="space-y-2">
                {liveStrategies.slice(0, 12).map((s: any) => {
                  const rule = s.config?.rule || {};
                  const stake = Number(rule.params?.stake ?? 0);
                  const sl = Number(rule.params?.stopLoss ?? 0);
                  const tp = Number(rule.params?.takeProfit ?? 0);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 bg-[var(--card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white truncate">{s.name}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">{getSymbolDisplayName(rule.symbol || "R_100")}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono shrink-0">
                        {sl > 0 ? <span className="px-1.5 py-0.5 rounded bg-[var(--red-soft)] text-[var(--red)]">SL ${sl}</span> : null}
                        {tp > 0 ? <span className="px-1.5 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)]">TP ${tp}</span> : null}
                        <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">Stake ${stake}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Advisory symbol picker */}
      <div className="aurora-glass-panel p-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">369AI advisory</span>
        </div>
        <div className="relative">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-bold text-white focus:border-[var(--accent)] focus:outline-none cursor-pointer"
          >
            {symbolOptions.map((s) => (
              <option key={s} value={s} className="bg-[var(--bg-base-2)] text-white">
                {getSymbolDisplayName(s)}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-[var(--text-muted)] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

function browserPlural(n: number): string {
  return n === 1 ? "" : "s";
}

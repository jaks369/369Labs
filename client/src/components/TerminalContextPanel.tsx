import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Sparkles, ShieldCheck, Bell, BellOff, Plus, X, TrendingUp, TrendingDown, ChevronDown, Wallet, ArrowRight } from "lucide-react";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import DigitProbability from "@/components/DigitProbability";
import SymbolInsights from "@/components/SymbolInsights";
import AIVerdicts from "@/components/AIVerdicts";
import { getSymbolDisplayName } from "@/lib/symbols";
import { formatMoney, formatNumber } from "@/lib/format";

interface TerminalContextPanelProps {
  selectedSymbol: string;
  selectedDisplay: string;
  decimalPlaces: number;
  accountType: string;
  tokenStatus: "none" | "invalid" | "connected";
  isAuthorized: boolean;
  contract: ContractSelection;
  onContractChange: (c: ContractSelection) => void;
  stake: number;
  onStakeChange: (n: number) => void;
  stopLoss: number;
  takeProfit: number;
  onStopLossChange: (n: number) => void;
  onTakeProfitChange: (n: number) => void;
  onQuickTrade: (dir?: "rise" | "fall") => void;
  tradeBusy: boolean;
  openPositions: any[];
  onSelectSymbol: (s: string) => void;
  signals: any[];
  ticks: any[];
  trades: any[];
  onViewSignals: () => void;
  alerts: any[];
  alertsLoading: boolean;
  alertsOpen: boolean;
  onToggleAlerts: () => void;
  newAlertSym: string;
  newAlertDir: "above" | "below";
  newAlertPrice: string;
  onNewAlertSym: (v: string) => void;
  onNewAlertDir: (d: "above" | "below") => void;
  onNewAlertPrice: (v: string) => void;
  onCreateAlert: () => void;
  createAlertPending: boolean;
  onDisableAlert: (id: number) => void;
}

export default function TerminalContextPanel(props: TerminalContextPanelProps) {
  const {
    selectedSymbol,
    selectedDisplay,
    decimalPlaces,
    accountType,
    tokenStatus,
    isAuthorized,
    contract,
    onContractChange,
    stake,
    onStakeChange,
    stopLoss,
    takeProfit,
    onStopLossChange,
    onTakeProfitChange,
    onQuickTrade,
    tradeBusy,
    openPositions,
    onSelectSymbol,
    signals,
    ticks,
    trades,
    onViewSignals,
    alerts,
    alertsLoading,
    alertsOpen,
    onToggleAlerts,
    newAlertSym,
    newAlertDir,
    newAlertPrice,
    onNewAlertSym,
    onNewAlertDir,
    onNewAlertPrice,
    onCreateAlert,
    createAlertPending,
    onDisableAlert,
  } = props;

  const [moreOpen, setMoreOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [positionsOpen, setPositionsOpen] = useState(true);
  const [marketOpen, setMarketOpen] = useState(false);
  const showRiskChips = !riskOpen && (stopLoss > 0 || takeProfit > 0);

  const isRiseFall = contract.category === "rise_fall";
  const isFall = isRiseFall && contract.direction === "fall";
  const accountBadge =
    accountType === "real" ? "REAL"
    : accountType === "demo" ? "DEMO"
    : tokenStatus === "connected" ? "LIVE"
    : tokenStatus === "invalid" ? "UNAUTHORIZED"
    : "NO TOKEN";
  const accountBadgeCls =
    accountType === "real" ? "badge-gray" : accountType === "demo" ? "badge-accent" : tokenStatus === "connected" ? "badge-green" : tokenStatus === "invalid" ? "badge-red" : "badge-gray";

  const buyLabel = (() => {
    switch (contract.category) {
      case "rise_fall": return "Buy";
      case "over_under": return "Buy";
      case "even_odd": return "Buy";
      case "digits": return "Buy";
      case "accumulator": return "Buy";
      default: return "Buy";
    }
  })();

  const payoutEst = stake > 0 ? formatMoney(stake * 1.95) : "—";

  const latestSignal = (() => {
    const sigs = Array.isArray(signals) ? signals : [];
    const forSymbol = sigs.find((s: any) => s.symbol === selectedSymbol);
    return forSymbol || sigs[0] || null;
  })();
  const hasSymbolSignal = Array.isArray(signals) && signals.some((s: any) => s.symbol === selectedSymbol);

  return (
    <div className="flex flex-col gap-3">
      {/* EXECUTION */}
      <div className="panel">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="text-sm font-bold text-white truncate">{selectedDisplay}</span>
            </div>
            <span className={`badge ${accountBadgeCls}`}>{accountBadge}</span>
          </div>

          {/* Execution — single Buy button driven by the selected direction */}
          {isRiseFall ? (
            <button
              onClick={() => onQuickTrade(isFall ? "fall" : "rise")}
              disabled={tradeBusy}
              className={`w-full h-[56px] flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110 ${
                isFall ? "bg-[var(--red)]" : "bg-[var(--green)]"
              }`}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : isFall ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {buyLabel}
            </button>
          ) : (
            <button
              onClick={() => onQuickTrade()}
              disabled={tradeBusy}
              className="w-full h-[56px] flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110 bg-[var(--accent)]"
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {buyLabel}
            </button>
          )}

          <ContractTypeSelector selection={contract} onChange={onContractChange} />

          {/* Stake stepper + payout */}
          <div className="input-group">
            <label className="input-label flex items-center justify-between">
              <span>Stake ($)</span>
              <span className="text-[10px] text-[var(--text-muted)] normal-case">min 0.35</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onStakeChange(Math.max(0.35, Math.round((stake - 0.5) * 100) / 100))}
                className="w-10 h-10 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-colors text-lg font-bold"
                aria-label="Decrease stake"
              >
                −
              </button>
              <input
                type="number"
                min={0.35}
                step="0.01"
                value={stake}
                onChange={(e) => onStakeChange(Math.max(0, parseFloat(e.target.value) || 0))}
                className="input text-center font-mono font-bold tabular-nums"
              />
              <button
                onClick={() => onStakeChange(Math.round((stake + 0.5) * 100) / 100)}
                className="w-10 h-10 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-colors text-lg font-bold"
                aria-label="Increase stake"
              >
                +
              </button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[1, 5, 10].map((p) => (
                <button
                  key={p}
                  onClick={() => onStakeChange(p)}
                  className={`flex-1 py-1 rounded-md text-caption font-bold transition-colors ${stake === p ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-white"}`}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)]">
            <span className="text-caption text-[var(--text-muted)]">
              Potential payout <span className="text-[10px]">(est.)</span>
            </span>
            <span className="text-caption font-bold font-mono tabular-nums text-[var(--green)]">${payoutEst}</span>
          </div>

          {/* Secondary controls */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-caption font-bold text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <span>Contract & Risk</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>
          {moreOpen && (
            <div className="space-y-3 pt-1">
              {showRiskChips ? (
                <div className="flex items-center gap-3 text-xs">
                  {stopLoss > 0 && <span className="text-[var(--red)]">SL: {formatMoney(stopLoss)}</span>}
                  {takeProfit > 0 && <span className="text-[var(--green)]">TP: {formatMoney(takeProfit)}</span>}
                  <button onClick={() => setRiskOpen(true)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
                    Edit
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="input-group">
                    <label className="input-label text-[var(--red)]">Stop Loss ($)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={stopLoss || ""}
                      onChange={(e) => onStopLossChange(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input border-[var(--red)]/40"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label text-[var(--green)]">Take Profit ($)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={takeProfit || ""}
                      onChange={(e) => onTakeProfitChange(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input border-[var(--green)]/40"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {!isAuthorized && <p className="text-xs text-[var(--text-muted)]">Connect a Deriv token in Settings to enable trading.</p>}
        </div>

        <div className="px-4 pb-4">
          <DigitProbability symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
        </div>
      </div>

      {/* AI */}
      <div className="panel">
        <button onClick={() => setAiOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)] animate-breathe" />
            <h3 className="text-caption font-semibold text-white">369AI Insight</h3>
            {hasSymbolSignal && <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">● Live context</span>}
          </div>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${aiOpen ? "rotate-180" : ""}`} />
        </button>
        {aiOpen && (
          <div className="p-4 pt-0 space-y-4">
            {!latestSignal ? (
              <div className="empty-state py-4">
                <p className="empty-state-desc">No signals for {selectedDisplay} yet. Ask 369AI to watch a market, or wait for the always-on scanner.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="ai-badge">{getSymbolDisplayName(latestSignal.symbol)}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{latestSignal.description}</p>
                <div className="flex items-center gap-3 mt-3 text-xs">
                  <span className="text-[var(--text-muted)]">
                    win rate <b className="text-[var(--green)]">{latestSignal.winRate}%</b>
                  </span>
                  <span className="text-[var(--text-muted)]">{new Date((latestSignal.discoveredAt || 0) * 1000).toLocaleString()}</span>
                </div>
                <button
                  onClick={onViewSignals}
                  className="mt-3 text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors flex items-center gap-1"
                >
                  View all signals <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
            <AIVerdicts symbol={selectedSymbol} ticks={ticks} trades={trades} decimalPlaces={decimalPlaces} />
          </div>
        )}
      </div>

      {/* POSITIONS */}
      <div className="panel">
        <button onClick={() => setPositionsOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-caption font-semibold text-white">Positions</h3>
            {openPositions.length > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-black text-[10px] font-bold flex items-center justify-center">
                {openPositions.length}
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${positionsOpen ? "rotate-180" : ""}`} />
        </button>
        {positionsOpen && (
          <div className="p-4 pt-0">
            {openPositions.length === 0 ? (
              <div className="empty-state py-4">
                <p className="empty-state-desc">No open positions. Place a trade to see it live here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {openPositions.map((t: any) => (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                      <div className="min-w-0">
                        <button
                          onClick={() => onSelectSymbol(t.symbol)}
                          className="text-sm font-bold text-white truncate hover:text-[var(--accent)] transition-colors"
                        >
                          {getSymbolDisplayName(t.symbol)} <span className="text-[var(--text-muted)] font-medium">{t.contractType}</span>
                        </button>
                        <p className="text-xs text-[var(--text-muted)]">
                          #{t.contractId} · {new Date(t.entryTime).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--accent)] font-mono tabular-nums">{formatMoney(t.stake)}</p>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">entry {formatNumber(t.entryPrice, decimalPlaces)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MARKET */}
      <div className="panel">
        <button onClick={() => setMarketOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-caption font-semibold text-white">Market & Alerts</h3>
          </div>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${marketOpen ? "rotate-180" : ""}`} />
        </button>
        {marketOpen && (
          <div className="p-4 pt-0 space-y-4">
            <SymbolInsights symbol={selectedSymbol} ticks={ticks} trades={trades} decimalPlaces={decimalPlaces} />

            <div className="border-t border-[var(--border)] pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <h3 className="text-micro text-[var(--text-muted)] uppercase tracking-widest">Price Alerts</h3>
                </div>
                <button onClick={onToggleAlerts} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  {alertsOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
              {alertsOpen && (
                <div className="space-y-2 pb-3">
                  <input
                    type="text"
                    value={newAlertSym || selectedSymbol}
                    onChange={(e) => onNewAlertSym(e.target.value)}
                    placeholder="Symbol (e.g. R_100)"
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <div className="flex rounded-lg bg-[var(--card)] p-0.5">
                    <button
                      onClick={() => onNewAlertDir("above")}
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)]" : "text-[var(--text-muted)] hover:text-white"}`}
                    >
                      Above
                    </button>
                    <button
                      onClick={() => onNewAlertDir("below")}
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--text-muted)] hover:text-white"}`}
                    >
                      Below
                    </button>
                  </div>
                  <input
                    type="number"
                    value={newAlertPrice}
                    onChange={(e) => onNewAlertPrice(e.target.value)}
                    placeholder="Target price"
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <Button
                    onClick={onCreateAlert}
                    disabled={createAlertPending || !newAlertPrice}
                    className="w-full text-xs font-bold bg-[var(--cta-fill)] text-[var(--cta-text)] py-2 rounded-lg"
                  >
                    {createAlertPending ? "Creating..." : "Create Alert"}
                  </Button>
                </div>
              )}
              <div className="space-y-1">
                {alertsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                ) : (alerts || []).length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-state-desc">No price alerts set.</p>
                  </div>
                ) : (
                  (alerts || []).slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                      <div>
                        <span className="text-xs font-bold text-white">{getSymbolDisplayName(a.symbol)}</span>
                        <span className={`text-caption ml-2 ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {a.direction === "above" ? "↑" : "↓"} {a.targetPrice}
                        </span>
                        <span className={`text-caption ml-2 ${a.status === "triggered" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                          {a.status}
                        </span>
                      </div>
                      {a.status === "active" && (
                        <button onClick={() => onDisableAlert(a.id)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
                          <BellOff className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

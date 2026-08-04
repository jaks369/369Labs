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
    <div className="flex flex-col h-full">
      {/* EXECUTION */}
      <div className="aurora-glass-panel border-b border-[rgba(255,255,255,0.08)]">
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="text-xs font-bold text-white truncate">{selectedDisplay}</span>
            </div>
            <span className={`badge text-[9px] ${accountBadgeCls}`}>{accountBadge}</span>
          </div>

          {/* Stake stepper */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Stake ($)</span>
              <span className="text-[9px] text-[var(--text-muted)]">min 0.35</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onStakeChange(Math.max(0.35, Math.round((stake - 0.5) * 100) / 100))}
                className="w-8 h-8 shrink-0 rounded-lg bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors text-sm font-bold"
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
                className="flex-1 text-center font-mono font-bold tabular-nums text-sm bg-white/5 border border-[var(--border)] rounded-lg py-1.5 text-white focus:border-[rgba(255,255,255,0.20)] focus:outline-none"
              />
              <button
                onClick={() => onStakeChange(Math.round((stake + 0.5) * 100) / 100)}
                className="w-8 h-8 shrink-0 rounded-lg bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors text-sm font-bold"
                aria-label="Increase stake"
              >
                +
              </button>
            </div>
            <div className="flex gap-1 mt-1.5">
              {[1, 5, 10].map((p) => (
                <button
                  key={p}
                  onClick={() => onStakeChange(p)}
                  className={`flex-1 py-0.5 rounded text-[10px] font-bold transition-colors ${stake === p ? "bg-[var(--accent)] text-black" : "bg-white/5 text-[var(--text-muted)] hover:text-white"}`}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>

          {/* Payout estimate */}
          <div className="flex items-center justify-between px-2 py-1 rounded bg-[var(--green-soft)] border border-[var(--green)]/20">
            <span className="text-[10px] text-[var(--text-muted)]">Payout (est.)</span>
            <span className="text-[11px] font-bold font-mono tabular-nums text-[var(--green)]">{payoutEst}</span>
          </div>

          {/* Buy button */}
          {isRiseFall ? (
            <button
              onClick={() => onQuickTrade(isFall ? "fall" : "rise")}
              disabled={tradeBusy}
              className={`w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110 ${
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
              className="w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {buyLabel}
            </button>
          )}

          {!isAuthorized && <p className="text-[10px] text-[var(--text-muted)]">Connect a Deriv token to enable trading.</p>}
        </div>
      </div>

      {/* Digit Probability */}
      <div className="border-b border-[rgba(255,255,255,0.08)] p-3">
        <DigitProbability symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
      </div>

      {/* Contract Type Selector (compact) */}
      <div className="border-b border-[rgba(255,255,255,0.08)] p-3">
        <ContractTypeSelector selection={contract} onChange={onContractChange} />
      </div>

      {/* Risk Controls (collapsed) */}
      <div className="border-b border-[rgba(255,255,255,0.08)] p-3">
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5"
        >
          <span>Risk Controls</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {moreOpen ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-[var(--red)] uppercase">Stop Loss ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={stopLoss || ""}
                onChange={(e) => onStopLossChange(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white/5 border border-[var(--red)]/30 rounded px-2 py-1 text-[11px] text-white focus:border-[var(--red)] focus:outline-none"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-[var(--green)] uppercase">Take Profit ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={takeProfit || ""}
                onChange={(e) => onTakeProfitChange(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white/5 border border-[var(--green)]/30 rounded px-2 py-1 text-[11px] text-white focus:border-[var(--green)] focus:outline-none"
                placeholder="Optional"
              />
            </div>
          </div>
        ) : showRiskChips ? (
          <div className="flex items-center gap-2 text-[10px]">
            {stopLoss > 0 && <span className="text-[var(--red)]">SL: {formatMoney(stopLoss)}</span>}
            {takeProfit > 0 && <span className="text-[var(--green)]">TP: {formatMoney(takeProfit)}</span>}
          </div>
        ) : null}
      </div>

      {/* AI + Positions + Alerts — collapsible */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* AI */}
        <div className="border-b border-[rgba(255,255,255,0.08)]">
          <button onClick={() => setAiOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] animate-breathe" />
              <span className="text-[10px] font-bold text-white">AI Insight</span>
              {hasSymbolSignal && <span className="text-[8px] uppercase tracking-wider text-[var(--accent)] font-bold">● Live</span>}
            </div>
            <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${aiOpen ? "rotate-180" : ""}`} />
          </button>
          {aiOpen && (
            <div className="px-3 pb-3 space-y-2">
              {!latestSignal ? (
                <p className="text-[10px] text-[var(--text-muted)]">No signals for {selectedDisplay}.</p>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="ai-badge text-[8px]">{getSymbolDisplayName(latestSignal.symbol)}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{latestSignal.description}</p>
                  <button onClick={onViewSignals} className="mt-1 text-[9px] text-[var(--accent)] hover:text-[var(--accent)]/80 flex items-center gap-0.5">
                    View all <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <AIVerdicts symbol={selectedSymbol} ticks={ticks} trades={trades} decimalPlaces={decimalPlaces} />
            </div>
          )}
        </div>

        {/* POSITIONS */}
        <div className="border-b border-[rgba(255,255,255,0.08)]">
          <button onClick={() => setPositionsOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-white">Positions</span>
              {openPositions.length > 0 && (
                <span className="min-w-[14px] h-3.5 px-0.5 rounded-full bg-[var(--accent)] text-black text-[8px] font-bold flex items-center justify-center">
                  {openPositions.length}
                </span>
              )}
            </div>
            <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${positionsOpen ? "rotate-180" : ""}`} />
          </button>
          {positionsOpen && (
            <div className="px-3 pb-3">
              {openPositions.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)]">No open positions.</p>
              ) : (
                <div className="space-y-1.5">
                  {openPositions.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                        <button onClick={() => onSelectSymbol(t.symbol)} className="text-[11px] font-bold text-white truncate hover:text-[var(--accent)] transition-colors">
                          {getSymbolDisplayName(t.symbol)}
                        </button>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-bold text-[var(--accent)] font-mono tabular-nums">{formatMoney(t.stake)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MARKET */}
        <div>
          <button onClick={() => setMarketOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-white">Alerts</span>
            </div>
            <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${marketOpen ? "rotate-180" : ""}`} />
          </button>
          {marketOpen && (
            <div className="px-3 pb-3 space-y-2">
              <SymbolInsights symbol={selectedSymbol} ticks={ticks} trades={trades} decimalPlaces={decimalPlaces} />
              <div className="border-t border-[var(--border)] pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Price Alerts</span>
                  <button onClick={onToggleAlerts} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                    {alertsOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  </button>
                </div>
                {alertsOpen && (
                  <div className="space-y-1.5 pb-2">
                    <input
                      type="text"
                      value={newAlertSym || selectedSymbol}
                      onChange={(e) => onNewAlertSym(e.target.value)}
                      placeholder="Symbol"
                      className="w-full bg-white/5 border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white"
                    />
                    <div className="flex rounded bg-white/5 p-0.5">
                      <button
                        onClick={() => onNewAlertDir("above")}
                        className={`flex-1 py-1 text-center text-[10px] font-bold rounded transition-all ${newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)]" : "text-[var(--text-muted)]"}`}
                      >
                        Above
                      </button>
                      <button
                        onClick={() => onNewAlertDir("below")}
                        className={`flex-1 py-1 text-center text-[10px] font-bold rounded transition-all ${newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--text-muted)]"}`}
                      >
                        Below
                      </button>
                    </div>
                    <input
                      type="number"
                      value={newAlertPrice}
                      onChange={(e) => onNewAlertPrice(e.target.value)}
                      placeholder="Target price"
                      className="w-full bg-white/5 border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white"
                    />
                    <button
                      onClick={onCreateAlert}
                      disabled={createAlertPending || !newAlertPrice}
                      className="w-full py-1.5 rounded text-[10px] font-bold text-black transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}
                    >
                      {createAlertPending ? "Creating..." : "Create Alert"}
                    </button>
                  </div>
                )}
                <div className="space-y-1 max-h-[80px] overflow-y-auto">
                  {(alerts || []).slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-white">{getSymbolDisplayName(a.symbol)}</span>
                        <span className={`text-[9px] ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {a.direction === "above" ? "↑" : "↓"} {a.targetPrice}
                        </span>
                      </div>
                      {a.status === "active" && (
                        <button onClick={() => onDisableAlert(a.id)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
                          <BellOff className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

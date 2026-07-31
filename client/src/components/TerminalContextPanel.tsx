import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Zap,
  Sparkles,
  ShieldCheck,
  Bell,
  BellOff,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Wallet,
  Gauge,
  ArrowRight,
} from "lucide-react";
import ContractTypeSelector, { ContractSelection } from "@/components/ContractTypeSelector";
import DigitProbability from "@/components/DigitProbability";
import SymbolInsights from "@/components/SymbolInsights";
import AIVerdicts from "@/components/AIVerdicts";

export type ContextMode = "execution" | "ai" | "positions" | "market";

interface TerminalContextPanelProps {
  mode: ContextMode;
  onModeChange: (m: ContextMode) => void;
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
  onQuickTrade: (dir: "rise" | "fall") => void;
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
    mode, onModeChange,
    selectedSymbol, selectedDisplay, decimalPlaces,
    accountType, tokenStatus, isAuthorized,
    contract, onContractChange,
    stake, onStakeChange, stopLoss, takeProfit,
    onStopLossChange, onTakeProfitChange,
    onQuickTrade, tradeBusy,
    openPositions, onSelectSymbol,
    signals, ticks, trades, onViewSignals,
    alerts, alertsLoading, alertsOpen, onToggleAlerts,
    newAlertSym, newAlertDir, newAlertPrice,
    onNewAlertSym, onNewAlertDir, onNewAlertPrice,
    onCreateAlert, createAlertPending, onDisableAlert,
  } = props;

  const [moreOpen, setMoreOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const showRiskChips = !riskOpen && (stopLoss > 0 || takeProfit > 0);

  const isRiseFall = contract.category === "rise_fall";
  const accountBadge =
    accountType === "real" ? "REAL"
    : accountType === "demo" ? "DEMO"
    : tokenStatus === "invalid" ? "UNAUTHORIZED"
    : "NO TOKEN";
  const accountBadgeCls =
    accountType === "real" ? "badge-red"
    : accountType === "demo" ? "badge-green"
    : tokenStatus === "invalid" ? "badge-red"
    : "badge-gray";

  const payoutEst = stake > 0 ? (stake * 1.95).toFixed(2) : "—";

  const latestSignal = (() => {
    const sigs = Array.isArray(signals) ? signals : [];
    const forSymbol = sigs.find((s: any) => s.symbol === selectedSymbol);
    return forSymbol || sigs[0] || null;
  })();
  const hasSymbolSignal = Array.isArray(signals) && signals.some((s: any) => s.symbol === selectedSymbol);

  const TABS: { id: ContextMode; label: string; icon: any; badge?: number }[] = [
    { id: "execution", label: "Execution", icon: Zap },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "positions", label: "Positions", icon: ShieldCheck, badge: openPositions.length },
    { id: "market", label: "Market", icon: Gauge },
  ];

  return (
    <div className="panel flex flex-col overflow-hidden">
      {/* Context tab strip */}
      <div className="flex gap-1 p-1 bg-black/20 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onModeChange(t.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-caption font-bold rounded-md transition-colors cursor-pointer ${
              mode === t.id ? "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
            {t.badge != null && t.badge > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-black text-[10px] font-bold flex items-center justify-center">{t.badge}</span>
            )}
            {t.id === "ai" && hasSymbolSignal && mode !== "ai" && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-live-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* EXECUTION */}
      {mode === "execution" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="text-sm font-bold text-white truncate">{selectedDisplay}</span>
              </div>
              <span className={`badge ${accountBadgeCls}`}>{accountBadge}</span>
            </div>

            {/* Execution — large, immediate */}
            {isRiseFall ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onQuickTrade("fall")}
                  disabled={tradeBusy}
                  className="h-[52px] flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110"
                  style={{ background: "linear-gradient(180deg, var(--red) 0%, color-mix(in srgb, var(--red) 85%, black) 100%)" }}
                >
                  {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
                  SELL
                </button>
                <button
                  onClick={() => onQuickTrade("rise")}
                  disabled={tradeBusy}
                  className="h-[52px] flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110"
                  style={{ background: "linear-gradient(180deg, var(--green) 0%, color-mix(in srgb, var(--green) 85%, black) 100%)" }}
                >
                  {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                  BUY
                </button>
              </div>
            ) : (
              <button
                onClick={() => onQuickTrade("rise")}
                disabled={tradeBusy}
                className="w-full h-[52px] flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110"
                style={{ background: "linear-gradient(180deg, var(--green) 0%, color-mix(in srgb, var(--green) 85%, black) 100%)" }}
              >
                {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                BUY {contract.category.replace("_", " ").toUpperCase()}
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
                <button onClick={() => onStakeChange(Math.max(0.35, Math.round((stake - 0.5) * 100) / 100))} className="w-10 h-10 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-colors text-lg font-bold" aria-label="Decrease stake">−</button>
                <input
                  type="number" min={0.35} step="0.01" value={stake}
                  onChange={(e) => onStakeChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input text-center font-mono font-bold tabular-nums"
                />
                <button onClick={() => onStakeChange(Math.round((stake + 0.5) * 100) / 100)} className="w-10 h-10 shrink-0 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-colors text-lg font-bold" aria-label="Increase stake">+</button>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[1, 5, 10].map((p) => (
                  <button key={p} onClick={() => onStakeChange(p)} className={`flex-1 py-1 rounded-md text-caption font-bold transition-colors ${stake === p ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-white"}`}>${p}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)]">
              <span className="text-caption text-[var(--text-muted)]">Potential payout <span className="text-[10px]">(est.)</span></span>
              <span className="text-caption font-bold font-mono tabular-nums text-[var(--green)]">${payoutEst}</span>
            </div>

            {/* Secondary controls */}
            <button onClick={() => setMoreOpen((v) => !v)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-caption font-bold text-[var(--text-secondary)] hover:text-white transition-colors">
              <span>Contract & Risk</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div className="space-y-3 pt-1">
                {showRiskChips ? (
                  <div className="flex items-center gap-3 text-xs">
                    {stopLoss > 0 && <span className="text-[var(--red)]">SL: ${stopLoss.toFixed(2)}</span>}
                    {takeProfit > 0 && <span className="text-[var(--green)]">TP: ${takeProfit.toFixed(2)}</span>}
                    <button onClick={() => setRiskOpen(true)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Edit</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="input-group">
                      <label className="input-label text-[var(--red)]">Stop Loss ($)</label>
                      <input type="number" min={0} step="0.01" value={stopLoss || ""} onChange={(e) => onStopLossChange(Math.max(0, parseFloat(e.target.value) || 0))} className="input border-[var(--red)]/40" placeholder="Optional" />
                    </div>
                    <div className="input-group">
                      <label className="input-label text-[var(--green)]">Take Profit ($)</label>
                      <input type="number" min={0} step="0.01" value={takeProfit || ""} onChange={(e) => onTakeProfitChange(Math.max(0, parseFloat(e.target.value) || 0))} className="input border-[var(--green)]/40" placeholder="Optional" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isAuthorized && (
              <p className="text-xs text-[var(--text-muted)]">Connect a Deriv token in Settings to enable trading.</p>
            )}
          </div>

          <div className="px-4 pb-4">
            <DigitProbability symbol={selectedSymbol} decimalPlaces={decimalPlaces} />
          </div>
        </div>
      )}

      {/* AI */}
      {mode === "ai" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)] animate-breathe" />
              <h3 className="text-caption font-semibold text-white">369AI Insight</h3>
              {hasSymbolSignal && <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold ml-auto">● Live context</span>}
            </div>
            {!latestSignal ? (
              <div className="empty-state py-4"><p className="empty-state-desc">No signals for {selectedDisplay} yet. Ask 369AI to watch a market, or wait for the always-on scanner.</p></div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="ai-badge">{latestSignal.symbol}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{latestSignal.description}</p>
                <div className="flex items-center gap-3 mt-3 text-xs">
                  <span className="text-[var(--text-muted)]">win rate <b className="text-[var(--green)]">{latestSignal.winRate}%</b></span>
                  <span className="text-[var(--text-muted)]">{new Date((latestSignal.discoveredAt || 0) * 1000).toLocaleString()}</span>
                </div>
                <button onClick={onViewSignals} className="mt-3 text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors flex items-center gap-1">
                  View all signals <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
            <AIVerdicts symbol={selectedSymbol} ticks={ticks} trades={trades} decimalPlaces={decimalPlaces} />
          </div>
        </div>
      )}

      {/* POSITIONS */}
      {mode === "positions" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {openPositions.length === 0 ? (
              <div className="empty-state py-8"><p className="empty-state-desc">No open positions. Place a trade to see it live here.</p></div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {openPositions.map((t: any) => (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                      <div className="min-w-0">
                        <button onClick={() => onSelectSymbol(t.symbol)} className="text-sm font-bold text-white truncate hover:text-[var(--accent)] transition-colors">{t.symbol} <span className="text-[var(--text-muted)] font-medium">{t.contractType}</span></button>
                        <p className="text-xs text-[var(--text-muted)]">#{t.contractId} · {new Date(t.entryTime).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--accent)] font-mono tabular-nums">${Number(t.stake).toFixed(2)}</p>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">entry {Number(t.entryPrice).toFixed(decimalPlaces)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MARKET */}
      {mode === "market" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
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
                  <input type="text" value={newAlertSym || selectedSymbol} onChange={(e) => onNewAlertSym(e.target.value)} placeholder="Symbol (e.g. R_100)" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white" />
                  <div className="flex rounded-lg bg-[var(--card)] p-0.5">
                    <button onClick={() => onNewAlertDir("above")} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)]" : "text-[var(--text-muted)] hover:text-white"}`}>Above</button>
                    <button onClick={() => onNewAlertDir("below")} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--text-muted)] hover:text-white"}`}>Below</button>
                  </div>
                  <input type="number" value={newAlertPrice} onChange={(e) => onNewAlertPrice(e.target.value)} placeholder="Target price" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white" />
                  <Button onClick={onCreateAlert} disabled={createAlertPending || !newAlertPrice} className="w-full text-xs font-bold bg-[var(--cta-fill)] text-[var(--cta-text)] py-2 rounded-lg">
                    {createAlertPending ? "Creating..." : "Create Alert"}
                  </Button>
                </div>
              )}
              <div className="space-y-1">
                {alertsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                ) : (alerts || []).length === 0 ? (
                  <div className="empty-state"><p className="empty-state-desc">No price alerts set.</p></div>
                ) : (
                  (alerts || []).slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                      <div>
                        <span className="text-xs font-bold text-white">{a.symbol}</span>
                        <span className={`text-caption ml-2 ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{a.direction === "above" ? "↑" : "↓"} {a.targetPrice}</span>
                        <span className={`text-caption ml-2 ${a.status === "triggered" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{a.status}</span>
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
        </div>
      )}
    </div>
  );
}

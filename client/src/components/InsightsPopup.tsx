import { useEffect, useRef, useState } from "react";
import { X, Brain, ShieldCheck, Bell, BellOff, Plus, ChevronDown, ArrowRight, Sparkles } from "lucide-react";
import DigitProbability from "@/components/DigitProbability";
import SymbolInsights from "@/components/SymbolInsights";
import AIVerdicts from "@/components/AIVerdicts";
import { getSymbolDisplayName } from "@/lib/symbols";
import { formatMoney } from "@/lib/format";

interface InsightsPopupProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  stopLoss: number;
  takeProfit: number;
  onStopLossChange: (n: number) => void;
  onTakeProfitChange: (n: number) => void;
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

function Section({ title, icon, defaultOpen = true, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[rgba(255,255,255,0.08)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer group"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--accent)]">{icon}</span>
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">{title}</span>
        </div>
        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform group-hover:text-white ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

export default function InsightsPopup(props: InsightsPopupProps) {
  const { open, onClose } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const latestSignal = (() => {
    const sigs = Array.isArray(props.signals) ? props.signals : [];
    const forSymbol = sigs.find((s: any) => s.symbol === props.symbol);
    return forSymbol || sigs[0] || null;
  })();

  const showRiskChips = props.stopLoss > 0 || props.takeProfit > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ top: "0px" }}>
      <div className="animate-modal-backdrop absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative animate-slideInRight aurora-glass-panel rounded-none md:rounded-l-2xl shadow-2xl overflow-hidden flex flex-col h-full"
        style={{ width: "min(440px, 100vw)", maxHeight: "100vh", background: "rgba(10,14,23,0.82)" }}
      >
        {/* Aurora glow behind the drawer header */}
        <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-40" style={{ background: "radial-gradient(circle, rgba(167,139,250,0.5) 0%, rgba(232,121,249,0.35) 40%, transparent 70%)", filter: "blur(28px)" }} />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(45,212,191,0.5) 0%, rgba(45,212,191,0.15) 45%, transparent 70%)", filter: "blur(28px)" }} />

        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.08)] shrink-0 relative">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2dd4bf, #a78bfa, #e879f9)" }}>
              <Brain className="w-3.5 h-3.5 text-[#0A0C10]" />
            </div>
            <span className="text-sm font-bold text-white">Insights</span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold hidden sm:inline">{props.displayName}</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Risk Controls */}
          <Section title="Risk Controls" icon={<ShieldCheck className="w-3.5 h-3.5" />} defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-[var(--red)] uppercase">Stop Loss ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={props.stopLoss || ""}
                  onChange={(e) => props.onStopLossChange(Math.max(0, parseFloat(e.target.value) || 0))}
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
                  value={props.takeProfit || ""}
                  onChange={(e) => props.onTakeProfitChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white/5 border border-[var(--green)]/30 rounded px-2 py-1 text-[11px] text-white focus:border-[var(--green)] focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>
            {showRiskChips && (
              <div className="flex items-center gap-2 text-[10px]">
                {props.stopLoss > 0 && <span className="text-[var(--red)]">SL: {formatMoney(props.stopLoss)}</span>}
                {props.takeProfit > 0 && <span className="text-[var(--green)]">TP: {formatMoney(props.takeProfit)}</span>}
              </div>
            )}
          </Section>

          {/* Digit Frequency */}
          <Section title="Digit Frequency" icon={<span className="text-[10px] font-black">0-9</span>}>
            <DigitProbability symbol={props.symbol} decimalPlaces={props.decimalPlaces} />
          </Section>

          {/* AI Insight + 369AI Verdicts */}
          <Section title="AI Insight" icon={<Sparkles className="w-3.5 h-3.5" />} defaultOpen={false}>
            {!latestSignal ? (
              <p className="text-[10px] text-[var(--text-muted)]">No signals for {props.displayName}.</p>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="ai-badge text-[8px]">{getSymbolDisplayName(latestSignal.symbol)}</span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{latestSignal.description}</p>
                <button onClick={props.onViewSignals} className="mt-1 text-[9px] text-[var(--accent)] hover:text-[var(--accent)]/80 flex items-center gap-0.5">
                  View all <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </Section>

          {/* 369AI Verdicts */}
          <Section title="369AI Verdicts" icon={<Brain className="w-3.5 h-3.5" />} defaultOpen={false}>
            <AIVerdicts symbol={props.symbol} ticks={props.ticks} trades={props.trades} decimalPlaces={props.decimalPlaces} />
          </Section>

          {/* Symbol Insights */}
          <Section title="Market Pulse" icon={<span className="text-[10px] font-black">◎</span>} defaultOpen={false}>
            <SymbolInsights symbol={props.symbol} ticks={props.ticks} trades={props.trades} decimalPlaces={props.decimalPlaces} />
          </Section>

          {/* Positions */}
          <Section title="Positions" icon={<span className="text-[10px] font-black">◈</span>}>
            {props.openPositions.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)]">No open positions.</p>
            ) : (
              <div className="space-y-1.5">
                {props.openPositions.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-live-pulse shrink-0" />
                      <button onClick={() => props.onSelectSymbol(t.symbol)} className="text-[11px] font-bold text-white truncate hover:text-[var(--accent)] transition-colors">
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
          </Section>

          {/* Alerts */}
          <Section title="Price Alerts" icon={<Bell className="w-3.5 h-3.5" />} defaultOpen={false}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Create alert</span>
              <button onClick={props.onToggleAlerts} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                {props.alertsOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              </button>
            </div>
            {props.alertsOpen && (
              <div className="space-y-1.5 pb-2">
                <input
                  type="text"
                  value={props.newAlertSym || props.symbol}
                  onChange={(e) => props.onNewAlertSym(e.target.value)}
                  placeholder="Symbol"
                  className="w-full bg-white/5 border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white"
                />
                <div className="flex rounded bg-white/5 p-0.5">
                  <button
                    onClick={() => props.onNewAlertDir("above")}
                    className={`flex-1 py-1 text-center text-[10px] font-bold rounded transition-all ${props.newAlertDir === "above" ? "bg-[var(--green)]/20 text-[var(--green)]" : "text-[var(--text-muted)]"}`}
                  >
                    Above
                  </button>
                  <button
                    onClick={() => props.onNewAlertDir("below")}
                    className={`flex-1 py-1 text-center text-[10px] font-bold rounded transition-all ${props.newAlertDir === "below" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--text-muted)]"}`}
                  >
                    Below
                  </button>
                </div>
                <input
                  type="number"
                  value={props.newAlertPrice}
                  onChange={(e) => props.onNewAlertPrice(e.target.value)}
                  placeholder="Target price"
                  className="w-full bg-white/5 border border-[var(--border)] rounded px-2 py-1 text-[10px] text-white"
                />
                <button
                  onClick={props.onCreateAlert}
                  disabled={props.createAlertPending || !props.newAlertPrice}
                  className="w-full py-1.5 rounded text-[10px] font-bold text-black transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2dd4bf, #a78bfa, #e879f9)" }}
                >
                  {props.createAlertPending ? "Creating..." : "Create Alert"}
                </button>
              </div>
            )}
            <div className="space-y-1 max-h-[120px] overflow-y-auto">
              {(props.alerts || []).slice(0, 5).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-white">{getSymbolDisplayName(a.symbol)}</span>
                    <span className={`text-[9px] ${a.direction === "above" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {a.direction === "above" ? "↑" : "↓"} {a.targetPrice}
                    </span>
                  </div>
                  {a.status === "active" && (
                    <button onClick={() => props.onDisableAlert(a.id)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
                      <BellOff className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

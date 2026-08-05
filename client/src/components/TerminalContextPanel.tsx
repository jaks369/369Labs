import { Loader2, Zap, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import type { ContractSelection } from "@/components/ContractTypeSelector";
import { formatMoney } from "@/lib/format";

interface TerminalContextPanelProps {
  selectedSymbol: string;
  selectedDisplay: string;
  decimalPlaces: number;
  accountType: string;
  tokenStatus: "none" | "invalid" | "connected";
  isAuthorized: boolean;
  contract: ContractSelection;
  stake: number;
  onStakeChange: (n: number) => void;
  onQuickTrade: (dir?: "rise" | "fall") => void;
  tradeBusy: boolean;
}

export default function TerminalContextPanel(props: TerminalContextPanelProps) {
  const {
    selectedDisplay,
    accountType,
    tokenStatus,
    isAuthorized,
    contract,
    stake,
    onStakeChange,
    onQuickTrade,
    tradeBusy,
  } = props;

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

  const payoutEst = stake > 0 ? formatMoney(stake * 1.95) : "—";

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
              Buy
            </button>
          ) : (
            <button
              onClick={() => onQuickTrade()}
              disabled={tradeBusy}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #2dd4bf, #a78bfa, #e879f9)" }}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Buy
            </button>
          )}

          {!isAuthorized && <p className="text-[10px] text-[var(--text-muted)]">Connect a Deriv token to enable trading.</p>}
        </div>
      </div>
    </div>
  );
}

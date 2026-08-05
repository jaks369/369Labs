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
  onContractChange: (c: ContractSelection) => void;
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
    onContractChange,
    onQuickTrade,
    tradeBusy,
  } = props;

  const isRiseFall = contract.category === "rise_fall";
  const isFall = isRiseFall && contract.direction === "fall";

  const buyLabel = (() => {
    switch (contract.category) {
      case "rise_fall":
        return contract.direction === "fall" ? "Buy Fall" : "Buy Rise";
      case "over_under":
        return `Buy ${contract.overUnder === "under" ? "Under" : "Over"} ${contract.barrier ?? ""}`.replace(/\s+$/g, "");
      case "even_odd":
        return contract.digitMatch === "differ" ? "Buy Odd" : "Buy Even";
      case "digits":
        return `${contract.digitMatch === "differ" ? "Buy Differs" : "Buy Matches"} ${contract.digit ?? ""}`.replace(/\s+$/g, "");
      default:
        return "Buy Accumulator";
    }
  })();

  const buyIsDown = isFall || (contract.category === "even_odd" && contract.digitMatch === "differ");
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
    <div className="flex flex-col h-full terminal-chart-panel" style={{ backgroundBlendMode: 'screen' }}>
      {/* EXECUTION */}
      <div className="border-b border-[rgba(255,255,255,0.08)]" style={{ background: 'rgba(10, 14, 23, 0.40)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="text-xs font-bold text-white truncate">{selectedDisplay}</span>
            </div>
            <span className={`badge text-[9px] ${accountBadgeCls}`}>{accountBadge}</span>
          </div>

          {/* Contract option picker — pick your side/barrier per contract type */}
          {contract.category === "rise_fall" && (
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => onContractChange({ ...contract, direction: "rise" })}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                  contract.direction === "rise"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Rise
              </button>
              <button
                onClick={() => onContractChange({ ...contract, direction: "fall" })}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                  contract.direction === "fall"
                    ? "bg-[var(--red)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" /> Fall
              </button>
            </div>
          )}

          {contract.category === "even_odd" && (
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => onContractChange({ ...contract, digitMatch: "match" })}
                className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                  contract.digitMatch === "match"
                    ? "bg-[var(--green)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Even
              </button>
              <button
                onClick={() => onContractChange({ ...contract, digitMatch: "differ" })}
                className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                  contract.digitMatch === "differ"
                    ? "bg-[var(--red)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Odd
              </button>
            </div>
          )}

          {contract.category === "over_under" && (
            <div className="space-y-1.5">
              <div className="flex rounded-lg bg-white/5 p-0.5">
                <button
                  onClick={() => onContractChange({ ...contract, overUnder: "over" })}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                    contract.overUnder === "over"
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  Over
                </button>
                <button
                  onClick={() => onContractChange({ ...contract, overUnder: "under" })}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                    contract.overUnder === "under"
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  Under
                </button>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Barrier (0-9)</span>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => onContractChange({ ...contract, barrier: i })}
                      className="min-w-0 w-full aspect-square flex items-center justify-center rounded text-[10px] font-bold transition-all"
                      style={{
                        background: contract.barrier === i ? "var(--accent)" : "var(--card)",
                        color: contract.barrier === i ? "white" : "var(--text-secondary)",
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {contract.category === "digits" && (
            <div className="space-y-1.5">
              <div className="flex rounded-lg bg-white/5 p-0.5">
                <button
                  onClick={() => onContractChange({ ...contract, digitMatch: "match" })}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                    contract.digitMatch === "match"
                      ? "bg-[var(--green)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  Matches
                </button>
                <button
                  onClick={() => onContractChange({ ...contract, digitMatch: "differ" })}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-all ${
                    contract.digitMatch === "differ"
                      ? "bg-[var(--red)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  Differs
                </button>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Digit (0-9)</span>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => onContractChange({ ...contract, digit: i })}
                      className="min-w-0 w-full aspect-square flex items-center justify-center rounded text-[10px] font-bold transition-all"
                      style={{
                        background: contract.digit === i ? "var(--accent)" : "var(--card)",
                        color: contract.digit === i ? "white" : "var(--text-secondary)",
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {contract.category === "accumulator" && (
            <div>
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Growth Rate</span>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {[1, 2, 3, 5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => onContractChange({ ...contract, growthRate: rate })}
                    className="py-2 rounded-lg text-[10px] font-bold transition-all"
                    style={{
                      background: contract.growthRate === rate ? "var(--accent)" : "var(--card)",
                      color: contract.growthRate === rate ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
          )}

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
              onClick={() => onQuickTrade(contract.direction)}
              disabled={tradeBusy}
              className={`w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110 ${
                buyIsDown ? "bg-[var(--red)]" : "bg-[var(--green)]"
              }`}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : buyIsDown ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {buyLabel}
            </button>
          ) : (
            <button
              onClick={() => onQuickTrade()}
              disabled={tradeBusy}
              className={`w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 hover:brightness-110 ${
                contract.category === "even_odd" ? (buyIsDown ? "bg-[var(--red)]" : "bg-[var(--green)]") : ""
              }`}
              style={contract.category === "even_odd" ? undefined : { background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple), var(--aurora-magenta))" }}
            >
              {tradeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {buyLabel}
            </button>
          )}

          {!isAuthorized && <p className="text-[10px] text-[var(--text-muted)]">Connect a Deriv token to enable trading.</p>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { RotateCcw, TrendingUp, TrendingDown, DollarSign, Coins } from "lucide-react";
import { paperEngine } from "@/services/PaperEngine";

const PAPER_BALANCE_KEY = "369labs_paper_balance";

export default function PaperTrading() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [balance, setBalance] = useState(paperEngine.getBalance());
  const [trades, setTrades] = useState<{ symbol: string; type: string; stake: number; pnl: number; time: string }[]>([]);

  useEffect(() => { if (!isAuthenticated) navigate("/login"); }, [isAuthenticated, navigate]);
  useEffect(() => { const unsub = paperEngine.onBalance(setBalance); return unsub; }, []);

  const reset = () => {
    paperEngine.resetBalance();
    setBalance(paperEngine.getBalance());
    setTrades([]);
  };

  const addFunds = () => {
    const cur = paperEngine.getBalance();
    const newBal = cur + 1000;
    localStorage.setItem(PAPER_BALANCE_KEY, String(newBal));
    setBalance(newBal);
  };

  const simTrade = (result: "win" | "loss") => {
    const stake = 1 + Math.random() * 4;
    const pnl = result === "win" ? stake * 0.95 : -stake;
    const cur = paperEngine.getBalance();
    const newBal = cur + pnl;
    localStorage.setItem(PAPER_BALANCE_KEY, String(newBal));
    setBalance(newBal);
    setTrades((t) => [{ symbol: "R_50", type: result === "win" ? "RISE" : "FALL", stake, pnl, time: new Date().toLocaleTimeString() }, ...t].slice(0, 50));
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Coins className="w-7 h-7 text-[var(--amber)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Paper Trading</h1>
              <p className="text-xs text-[var(--text-muted)]">Practice trading with virtual funds — no real money involved</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addFunds} className="bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/30 text-xs"><DollarSign className="w-3.5 h-3.5 mr-1" /> Add $1,000</Button>
            <Button onClick={reset} className="bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/30 text-xs"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset</Button>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--amber)]/30 rounded-xl p-8 text-center">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Paper Balance</p>
          <p className="text-5xl font-bold text-white mb-2">${balance.toFixed(2)}</p>
          <p className="text-xs text-[var(--text-muted)]">Virtual USD</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => simTrade("win")} className="p-6 rounded-xl bg-[var(--green-soft)] border border-[var(--green)]/30 hover:bg-[var(--green)]/20 transition-all">
            <TrendingUp className="w-8 h-8 text-[var(--green)] mx-auto mb-2" />
            <p className="text-sm font-bold text-[var(--green)]">Simulate Win</p>
          </button>
          <button onClick={() => simTrade("loss")} className="p-6 rounded-xl bg-[var(--red-soft)] border border-[var(--red)]/30 hover:bg-[var(--red)]/20 transition-all">
            <TrendingDown className="w-8 h-8 text-[var(--red)] mx-auto mb-2" />
            <p className="text-sm font-bold text-[var(--red)]">Simulate Loss</p>
          </button>
        </div>

        {trades.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-4">Trade History</h2>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {trades.map((t, i) => (
                <div key={i} className="flex justify-between text-xs p-2 bg-black/20 rounded-lg">
                  <span className="text-[var(--text-secondary)]">{t.symbol} {t.type}</span>
                  <span className="text-[var(--text-muted)]">${t.stake.toFixed(2)}</span>
                  <span className={t.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}</span>
                  <span className="text-[var(--text-muted)]">{t.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

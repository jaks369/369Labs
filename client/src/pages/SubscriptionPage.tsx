import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Crown, CheckCircle2, Zap, Shield, BarChart3, Bot, Sparkles, CreditCard, Loader2 } from "lucide-react";
import { toast } from "@/components/Toast";

const plans = [
  { name: "Starter", price: "$0", period: "free", features: ["1 bot", "Basic backtesting", "Paper trading", "3-day history"], cta: "Current Plan", popular: false },
  { name: "Pro", price: "$29", period: "/mo", features: ["10 bots", "Advanced backtesting", "All indicators", "Full history", "Telegram alerts", "API access"], cta: "Upgrade", popular: true },
  { name: "Enterprise", price: "$99", period: "/mo", features: ["Unlimited bots", "Team sharing (5 seats)", "Priority support", "Custom plugins", "Dedicated server", "Audit logs"], cta: "Contact Sales", popular: false },
];

export default function SubscriptionPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(0);

  const activeBots = trpc.bot.listActive.useQuery(undefined, { enabled: isAuthenticated });
  const tradeCount = trpc.trades.list.useQuery({ limit: 5000 }, { enabled: isAuthenticated });
  const activeCount = (activeBots.data as any[])?.length ?? 0;
  const totalTrades = (tradeCount.data as any[])?.length ?? 0;

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown className="w-6 h-6 text-[var(--amber)]" />
            <h1 className="text-3xl font-bold text-white">Subscription Plans</h1>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">Choose the plan that fits your trading needs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <div key={plan.name} className={`relative bg-[var(--card)] border rounded-xl p-6 flex flex-col ${plan.popular ? "border-[var(--amber)] ring-1 ring-[var(--amber)]/30" : "border-[var(--border)]"}`}>
              {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--amber)] text-black text-[10px] font-bold rounded-full">Most Popular</span>}
              <div className="flex items-center gap-2 mb-4">
                {i === 1 ? <Zap className="w-5 h-5 text-[var(--amber)]" /> : i === 2 ? <Shield className="w-5 h-5 text-[var(--cyan)]" /> : <BarChart3 className="w-5 h-5 text-[var(--text-muted)]" />}
                <h2 className="text-lg font-bold text-white">{plan.name}</h2>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{plan.price}<span className="text-sm text-[var(--text-muted)] font-normal">{plan.period}</span></p>
              <div className="mt-6 space-y-3 flex-1">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" />
                    <span className="text-[var(--text-secondary)]">{f}</span>
                  </div>
                ))}
              </div>
              <Button
                onClick={() => { setSelected(i); if (i !== 0) toast("Payment integration coming soon. No charges will be made yet.", "info"); }}
                className={`mt-6 w-full text-xs font-bold py-2 rounded-lg ${i === selected ? "bg-[var(--amber)] text-black" : "bg-white/5 text-[var(--text-secondary)] border border-[var(--border)] hover:bg-white/10"}`}
              >
                {i === selected ? (plan.cta === "Current Plan" ? "Current Plan" : "Selected") : plan.cta}
              </Button>
            </div>
          ))}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Bot className="w-4 h-4 text-[var(--amber)]" /> Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Active Bots</p>
              {activeBots.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--amber)]" />
              ) : (
                <>
                  <p className="text-xl font-bold text-white">{activeCount} <span className="text-sm text-[var(--text-muted)] font-normal">/ 10 (Pro)</span></p>
                  <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--amber)] rounded-full" style={{ width: `${Math.min((activeCount / 10) * 100, 100)}%` }} />
                  </div>
                </>
              )}
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Total Trades</p>
              {tradeCount.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--green)]" />
              ) : (
                <>
                  <p className="text-xl font-bold text-white">{totalTrades.toLocaleString()}</p>
                  <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--green)] rounded-full" style={{ width: `${Math.min((totalTrades / 10000) * 100, 100)}%` }} />
                  </div>
                </>
              )}
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Account</p>
              <p className="text-xl font-bold text-white">{user?.email || "—"}</p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-5 h-5 text-[var(--amber)]" />
            <h2 className="text-sm font-bold text-white">Payment</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-4">To upgrade or manage your subscription, visit the billing portal.</p>
          <Button onClick={() => window.open("https://billing.stripe.com", "_blank")} className="bg-[var(--amber)] text-black text-xs font-bold px-6 py-2.5 rounded-lg">
            Manage Billing
          </Button>
        </div>

        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--amber)]" /> All plans include paper trading, basic backtesting, and community strategies.
          </p>
        </div>
      </div>
    </div>
  );
}

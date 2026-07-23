import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Crown, CheckCircle2, Zap, Shield, BarChart3, Users, Bot, Sparkles, CreditCard, X, Loader2 } from "lucide-react";

const plans = [
  { name: "Starter", price: "$0", period: "free", features: ["1 bot", "Basic backtesting", "Paper trading", "3-day history"], cta: "Current Plan", popular: false },
  { name: "Pro", price: "$29", period: "/mo", features: ["10 bots", "Advanced backtesting", "All indicators", "Full history", "Telegram alerts", "API access"], cta: "Upgrade", popular: true },
  { name: "Enterprise", price: "$99", period: "/mo", features: ["Unlimited bots", "Team sharing (5 seats)", "Priority support", "Custom plugins", "Dedicated server", "Audit logs"], cta: "Contact Sales", popular: false },
];

export default function SubscriptionPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(0);
  const [checkout, setCheckout] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const handleSubscribe = async () => {
    if (selected === 0) return;
    setCheckout(true);
  };

  const handlePay = async () => {
    setPaying(true);
    await new Promise((r) => setTimeout(r, 1500));
    setPaying(false);
    setPaid(true);
    setCheckout(false);
    setTimeout(() => setPaid(false), 3000);
  };

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
                onClick={() => { setSelected(i); if (i > 0) handleSubscribe(); }}
                className={`mt-6 w-full text-xs font-bold py-2 rounded-lg ${i === selected ? "bg-[var(--amber)] text-black" : "bg-white/5 text-[var(--text-secondary)] border border-[var(--border)] hover:bg-white/10"}`}
              >
                {i === selected ? (plan.cta === "Current Plan" ? "Current Plan" : "Selected") : plan.cta}
              </Button>
            </div>
          ))}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Bot className="w-4 h-4 text-[var(--amber)]" /> Usage Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Active Bots</p>
              <p className="text-xl font-bold text-white">1 <span className="text-sm text-[var(--text-muted)] font-normal">/ 10 (Pro)</span></p>
              <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--amber)] rounded-full" style={{ width: "10%" }} />
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Daily API Calls</p>
              <p className="text-xl font-bold text-white">247 <span className="text-sm text-[var(--text-muted)] font-normal">/ 1,000 (Pro)</span></p>
              <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--green)] rounded-full" style={{ width: "24.7%" }} />
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-[var(--text-muted)] mb-1">Storage Used</p>
              <p className="text-xl font-bold text-white">12 MB <span className="text-sm text-[var(--text-muted)] font-normal">/ 500 MB (Pro)</span></p>
              <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--cyan)] rounded-full" style={{ width: "2.4%" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--amber)]" /> All plans include paper trading, basic backtesting, and community strategies.
          </p>
        </div>
      </div>

      {paid && (
        <div className="fixed bottom-6 right-6 bg-[var(--green)]/20 border border-[var(--green)]/40 rounded-xl p-4 text-sm text-[var(--green)] font-bold shadow-2xl z-50 animate-cardEnter">
          <CheckCircle2 className="w-4 h-4 inline mr-2" />Subscribed to {plans[selected].name}!
        </div>
      )}

      {checkout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !paying && setCheckout(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><CreditCard className="w-5 h-5 text-[var(--amber)]" /> Payment</h2>
              <button onClick={() => setCheckout(false)} className="text-[var(--text-muted)] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{plans[selected].name} — {plans[selected].price}{plans[selected].period}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">Card Number</label>
                <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">Cardholder Name</label>
                <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Doe" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">Expiry</label>
                  <input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="12/26" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">CVC</label>
                  <input value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white font-mono" />
                </div>
              </div>
              <Button onClick={handlePay} disabled={paying || !cardNumber || !cardName || !cardExpiry || !cardCvc} className="w-full bg-[var(--amber)] text-black font-bold py-2.5 rounded-lg text-sm mt-2">
                {paying ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Processing...</> : `Pay ${plans[selected].price}${plans[selected].period}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

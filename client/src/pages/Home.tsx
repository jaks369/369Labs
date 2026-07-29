
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, Star, CheckCircle2 } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--card)] text-[var(--text-primary)] selection:bg-[var(--amber)]/30">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[var(--amber-soft)] blur-[120px] rounded-full opacity-50" />
        <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      <nav className="relative z-50 border-b border-white/5 backdrop-blur-xl bg-black/20 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-7 h-7 bg-[var(--amber)] rounded-lg flex items-center justify-center shadow-lg shadow-[var(--amber)]/20 group-hover:scale-110 transition-transform">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--text-secondary)]">
              <button onClick={() => navigate("/dashboard")} className="hover:text-white transition-colors">Dashboard</button>
              <button onClick={() => navigate("/strategy-builder")} className="hover:text-white transition-colors">Strategy Builder</button>
              <button onClick={() => navigate("/marketplace")} className="hover:text-white transition-colors">Marketplace</button>
              <button onClick={() => navigate("/backtesting")} className="hover:text-white transition-colors">Backtesting</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/login")} className="text-sm font-medium hover:text-white transition-colors px-3">Login</button>
            <Button onClick={() => navigate("/login")} className="btn btn-primary text-sm flex items-center gap-1.5 px-4 py-2">
              Get Started <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider mb-6" style={{background: "var(--amber)", color: "#000"}}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/75 rounded-full" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            V1.0 NOW LIVE
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 tracking-tighter leading-[1.1]">
            Build. Backtest.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--amber)] to-[var(--green)]">Automate.</span>
          </h1>
          <p className="text-base mb-8 mx-auto leading-relaxed" style={{color: "var(--text-muted)", maxWidth: "560px"}}>
            Professional trading automation powered by AI. Design strategies, backtest against historical data, and deploy to the cloud.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button onClick={() => navigate("/login")} className="btn btn-primary px-8 py-3 w-full sm:w-auto text-sm">
              Get Started
            </button>
            <button onClick={() => navigate("/dashboard")} className="btn btn-outline px-8 py-3 w-full sm:w-auto text-sm">
              Live Demo
            </button>
          </div>
        </section>

        {/* Features + Testimonials combined */}
        <section className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div onClick={() => navigate("/ai-assistant")} className="md:col-span-2 card-hover cursor-pointer border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[var(--cyan-soft)]">
                <Brain className="w-5 h-5 text-[var(--cyan)]" />
              </div>
              <h3 className="text-sm font-semibold mb-1 text-white">369AI Assistant</h3>
              <p className="text-xs leading-relaxed" style={{color: "var(--text-muted)"}}>Describe your strategy in plain English and let AI generate the logic and risk parameters.</p>
            </div>
            <div onClick={() => navigate("/analytics")} className="md:col-span-2 card-hover cursor-pointer border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[var(--amber-soft)]">
                <BarChart3 className="w-5 h-5 text-[var(--amber)]" />
              </div>
              <h3 className="text-sm font-semibold mb-1 text-white">Advanced Analytics</h3>
              <p className="text-xs leading-relaxed" style={{color: "var(--text-muted)"}}>Monitor ROI, Drawdown, and Profit Factor in real-time with professional-grade metrics.</p>
            </div>
            <div onClick={() => navigate("/cloud-bots")} className="md:col-span-2 card-hover cursor-pointer border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[var(--amber-soft)]">
                <Globe className="w-5 h-5 text-[var(--amber)]" />
              </div>
              <h3 className="text-sm font-semibold mb-1 text-white">Cloud Execution</h3>
              <p className="text-xs leading-relaxed" style={{color: "var(--text-muted)"}}>Deploy bots to our cloud. Your strategies run 24/7 without your computer.</p>
            </div>
            {/* Testimonial inline */}
            <div className="md:col-span-3 border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
              <div className="flex gap-1 mb-2">
                {[1,2,3,4,5].map((s) => <Star key={s} className="w-3.5 h-3.5" style={{color: "var(--amber)", fill: "var(--amber)"}} />)}
              </div>
              <p className="text-xs mb-2 italic" style={{color: "var(--text-muted)"}}>"The AI insights are uncanny. Completely changed how I approach trading."</p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[var(--amber)]/20 flex items-center justify-center text-xs font-bold" style={{color: "var(--amber)"}}>A</div>
                <div><p className="text-xs font-semibold text-white">Alex K.</p><p className="text-[10px]" style={{color: "var(--text-disabled)"}}>Algorithmic Trader</p></div>
              </div>
            </div>
            <div className="md:col-span-3 border border-[var(--border)] rounded-xl p-4 bg-[var(--card)]">
              <div className="flex gap-1 mb-2">
                {[1,2,3,4,5].map((s) => <Star key={s} className="w-3.5 h-3.5" style={{color: "var(--amber)", fill: "var(--amber)"}} />)}
              </div>
              <p className="text-xs mb-2 italic" style={{color: "var(--text-muted)"}}>"Best backtesting engine I've used. The parameter sweep is a game changer."</p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[var(--amber)]/20 flex items-center justify-center text-xs font-bold" style={{color: "var(--amber)"}}>S</div>
                <div><p className="text-xs font-semibold text-white">Sarah M.</p><p className="text-[10px]" style={{color: "var(--text-disabled)"}}>Quant Developer</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">Simple, Transparent Pricing</h2>
            <p className="text-xs mt-1" style={{color: "var(--text-muted)"}}>Start free, upgrade as you grow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
              { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
              { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
            ].map((plan) => (
              <div key={plan.name} className={`relative bg-[var(--card)] border ${plan.popular ? "border-[var(--amber)]" : "border-[var(--border)]"} rounded-xl p-5 ${plan.popular ? "ring-1 ring-[var(--amber)]" : ""}`}>
                {plan.popular && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--amber)] text-black text-[10px] font-bold rounded-full">Most Popular</div>}
                <h3 className="text-base font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-2xl font-extrabold text-white mb-3">{plan.price}<span className="text-xs text-[var(--text-muted)] font-normal">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs" style={{color: "var(--text-muted)"}}><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" /> {f}</li>
                  ))}
                </ul>
                <button onClick={() => navigate("/login")} className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${plan.popular ? "bg-[var(--amber)] text-black hover:bg-[var(--amber)]/90" : "border border-[var(--border)] text-white hover:bg-white/5"}`}>{plan.cta}</button>
              </div>
            ))}
          </div>
        </section>

        {/* CTA compact */}
        <section className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-[var(--amber)] rounded-xl p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <h2 className="text-xl font-bold text-[var(--bg)] mb-2 relative z-10">Ready to Automate Your Success?</h2>
            <p className="text-[var(--bg)]/80 text-sm mb-4 max-w-xl mx-auto relative z-10">
              Join the next generation of algorithmic traders. Start building your first strategy today.
            </p>
            <button onClick={() => navigate("/login")} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm relative z-10 bg-white text-[var(--bg)] hover:bg-[var(--text-primary)] rounded-lg font-semibold shadow-lg">
              Launch Dashboard <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto px-6 py-8">
          <h2 className="text-lg font-bold text-white text-center mb-6">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {[
              { q: "How does the AI assistant work?", a: "369AI analyzes live Deriv ticks, detects patterns, suggests strategies, and can execute trades or run backtests on your command." },
              { q: "Do I need programming experience?", a: "No. Use the visual strategy builder to create rules without code, or describe your strategy in plain English to the AI." },
              { q: "What markets are supported?", a: "Deriv's full suite of Volatility Indices (R_10 through R_100, 1-second variants, Boom/Crash) with more coming soon." },
              { q: "Can I run bots 24/7?", a: "Yes. Deploy bots to our cloud infrastructure and they run around the clock without your computer." },
              { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. 2FA is available. We never share your trading data." },
            ].map((faq, i) => (
              <details key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-lg group">
                <summary className="flex items-center justify-between p-3 cursor-pointer text-xs font-bold text-white hover:text-[var(--amber)] transition-colors">
                  {faq.q}
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-open:rotate-90 transition-transform shrink-0" />
                </summary>
                <p className="px-3 pb-3 text-xs" style={{color: "var(--text-muted)", lineHeight: "1.6"}}>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-6 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[var(--amber)]" />
              <span className="text-sm font-bold text-white">369Labs</span>
            </div>
            <div className="text-xs" style={{color: "var(--text-disabled)"}}>
              &copy; 2026 369Labs. All rights reserved.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

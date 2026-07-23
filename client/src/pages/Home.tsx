
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, Star, Users, Shield, MessageCircle, HelpCircle, CheckCircle2 } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--card)] text-[var(--text-primary)] selection:bg-[var(--amber)]/30">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[var(--amber-soft)] blur-[120px] rounded-full opacity-50" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      <nav className="relative z-50 border-b border-white/5 backdrop-blur-xl bg-black/20 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-8 h-8 bg-[var(--amber)] rounded-lg flex items-center justify-center shadow-lg shadow-[var(--amber)]/20 group-hover:scale-110 transition-transform">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--text-secondary)]">
              <button onClick={() => navigate("/dashboard")} className="hover:text-white transition-colors">Dashboard</button>
              <button onClick={() => navigate("/strategy-builder")} className="hover:text-white transition-colors">Strategy Builder</button>
              <button onClick={() => navigate("/marketplace")} className="hover:text-white transition-colors">Marketplace</button>
              <button onClick={() => navigate("/backtesting")} className="hover:text-white transition-colors">Backtesting</button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/login")} className="text-sm font-medium hover:text-white transition-colors px-4">Login</button>
            <Button onClick={() => navigate("/login")} className="btn btn-primary flex items-center gap-2">
              Get Started <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="max-w-7xl mx-auto px-6 pt-32 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--amber-soft)] border border-[var(--amber-border)] text-[var(--amber-hover)] text-xs font-bold tracking-wider mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--amber-hover)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--amber)]"></span>
            </span>
            V1.0 NOW LIVE
          </div>
          <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-8 tracking-tighter leading-[1.1]">
            Build. Backtest.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--amber)] to-[var(--green)]">Automate.</span>
          </h1>
          <p className="text-xl text-[var(--text-secondary)] mb-12 max-w-2xl mx-auto leading-relaxed">
            Professional trading automation powered by AI. Design sophisticated strategies, 
            test against historical data, and deploy to the cloud in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button onClick={() => navigate("/login")} className="btn btn-primary text-lg px-10 py-4 w-full sm:w-auto">
              Get Started
            </button>
            <button onClick={() => navigate("/dashboard")} className="btn btn-outline text-lg px-10 py-4 w-full sm:w-auto">
              Live Demo
            </button>
          </div>

          <div className="mt-24 relative max-w-5xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--amber)] to-[var(--green)] rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-[var(--card)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="h-8 bg-[var(--card)]/50 border-b border-white/5 flex items-center px-4 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--red)]/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--amber)]/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--green)]/50" />
              </div>
              <div className="aspect-video bg-[var(--card)] p-8 flex items-center justify-center">
                 <div className="w-full h-full border border-[var(--amber-border)] rounded-lg relative overflow-hidden bg-[var(--bg)]">
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(37, 99, 235, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(37, 99, 235, 0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[var(--amber)]/10 to-transparent" />
                    <div className="absolute top-1/4 left-0 right-0 h-px bg-[var(--green)]/30" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--red)]/30" />
                    <div className="flex items-center justify-center h-full">
                       <Activity className="w-16 h-16 text-[var(--amber)] animate-pulse" />
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-32">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4">ENGINEERED FOR PERFORMANCE</h2>
            <p className="text-[var(--text-secondary)]">Everything you need to scale your trading operations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div onClick={() => navigate("/ai-assistant")} className="card-hover cursor-pointer group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform bg-[var(--cyan-soft)]">
                <Brain className="w-6 h-6 text-[var(--cyan)]" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">369AI Assistant</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Describe your strategy in plain English and let our AI engine generate the logic, 
                risk parameters, and execution blocks automatically.
              </p>
            </div>
            <div onClick={() => navigate("/analytics")} className="card-hover cursor-pointer group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform bg-[var(--amber-soft)]">
                <BarChart3 className="w-6 h-6 text-[var(--amber)]" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Advanced Analytics</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Monitor ROI, Drawdown, and Profit Factor in real-time. Gain deep insights into 
                your bot's performance with professional-grade metrics.
              </p>
            </div>
            <div onClick={() => navigate("/cloud-bots")} className="card-hover cursor-pointer group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform bg-[var(--amber-soft)]">
                <Globe className="w-6 h-6 text-[var(--amber)]" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Cloud Execution</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Deploy your bots to our secure cloud infrastructure. Your strategies run 24/7 
                without needing your computer to stay online.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-[var(--text-secondary)]">Start free, upgrade as you grow. No hidden fees.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
              { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
              { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
            ].map((plan) => (
              <div key={plan.name} className={`relative bg-[var(--card)] border ${plan.popular ? "border-[var(--amber)]" : "border-[var(--border)]"} rounded-2xl p-8 ${plan.popular ? "ring-2 ring-[var(--amber)]" : ""}`}>
                {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--amber)] text-black text-xs font-bold rounded-full">Most Popular</div>}
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-4xl font-extrabold text-white mb-6">{plan.price}<span className="text-lg text-[var(--text-muted)] font-normal">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><CheckCircle2 className="w-4 h-4 text-[var(--green)] shrink-0" /> {f}</li>
                  ))}
                </ul>
                <button onClick={() => navigate("/login")} className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${plan.popular ? "bg-[var(--amber)] text-black hover:bg-[var(--amber)]/90" : "bg-[var(--card)] border border-[var(--border)] text-white hover:bg-white/5"}`}>{plan.cta}</button>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Trusted by Traders</h2>
            <p className="text-[var(--text-secondary)]">See what our users say about 369Labs.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "Alex K.", role: "Algorithmic Trader", text: "369Labs completely changed how I approach trading. The AI insights are uncanny." },
              { name: "Sarah M.", role: "Quant Developer", text: "Best backtesting engine I've used. The parameter sweep is a game changer." },
              { name: "James R.", role: "Full-time Trader", text: "I've automated my entire strategy. The cloud execution is flawless." },
            ].map((t) => (
              <div key={t.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8">
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map((s) => <Star key={s} className="w-4 h-4 fill-[var(--amber)] text-[var(--amber)]" />)}
                </div>
                <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--amber)]/20 flex items-center justify-center text-sm font-bold text-[var(--amber)]">{t.name.charAt(0)}</div>
                  <div><p className="text-sm font-bold text-white">{t.name}</p><p className="text-xs text-[var(--text-muted)]">{t.role}</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-4xl font-bold text-white text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              { q: "How does the AI assistant work?", a: "369AI analyzes live Deriv ticks, detects patterns, suggests strategies, and can execute trades or run backtests on your command." },
              { q: "Do I need programming experience?", a: "No. Use the visual strategy builder to create rules without code, or describe your strategy in plain English to the AI." },
              { q: "What markets are supported?", a: "Deriv's full suite of Volatility Indices (R_10 through R_100, 1-second variants, Boom/Crash) with more markets coming soon." },
              { q: "Can I run bots 24/7?", a: "Yes. Deploy bots to our cloud infrastructure and they run around the clock without your computer." },
              { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. 2FA is available. We never share your trading data." },
            ].map((faq, i) => (
              <details key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl group">
                <summary className="flex items-center justify-between p-5 cursor-pointer text-sm font-bold text-white hover:text-[var(--amber)] transition-colors">
                  {faq.q}
                  <HelpCircle className="w-4 h-4 text-[var(--text-muted)] group-open:rotate-180 transition-transform" />
                </summary>
                <p className="px-5 pb-5 text-sm text-[var(--text-secondary)] leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="bg-[var(--amber)] rounded-[calc(var(--radius)*2)] p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <h2 className="text-4xl md:text-5xl font-bold text-[#0D1016] mb-6 relative z-10">READY TO AUTOMATE YOUR SUCCESS?</h2>
            <p className="text-[#0D1016]/80 text-lg mb-10 max-w-2xl mx-auto relative z-10">
              Join the next generation of algorithmic traders. Start building your first strategy today.
            </p>
            <button onClick={() => navigate("/login")} className="btn btn-primary inline-flex items-center gap-2 px-8 py-4 text-lg relative z-10 bg-white text-[#0D1016] hover:bg-[var(--text-primary)] shadow-lg">
              Launch Dashboard <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-[var(--amber)]" />
              <span className="text-lg font-bold text-white">369Labs</span>
            </div>
            <div className="flex gap-8 text-sm text-[var(--text-muted)]">
              <span className="hover:text-white transition-colors">&copy; 2026 369Labs. All rights reserved.</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

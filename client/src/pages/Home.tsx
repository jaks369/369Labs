import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, Star, CheckCircle2, Shield, Zap, Clock, TrendingUp, Server } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] selection:bg-[var(--accent)]/20">
      {/* Subtle accent glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-[var(--accent)] blur-[200px] rounded-full opacity-[0.07]" />
      </div>

      {/* Nav */}
      <nav className="relative z-50 border-b border-[var(--border)]/50 sticky top-0 bg-[var(--bg)]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-7 h-7 bg-[var(--accent)] rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-[var(--bg)]" />
              </div>
              <span className="text-base font-bold text-[var(--text-primary)]">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {[{ label: "Dashboard", path: "/dashboard" }, { label: "Strategy Builder", path: "/strategy-builder" }, { label: "Marketplace", path: "/marketplace" }, { label: "Backtesting", path: "/backtesting" }].map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">{item.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/login")} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Login</button>
            <button onClick={() => navigate("/login")} className="text-sm font-semibold px-5 py-2 rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} className="inline-flex mb-6">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-[var(--accent)] border border-[var(--accent-border)] bg-[var(--accent-soft)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)]/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--accent)]" />
                </span>
                V1.0 NOW LIVE
              </span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-bold text-[var(--text-primary)] mb-5 tracking-tight leading-[1.1]">
              Trading Isn't the Product.<br />
              <span className="text-[var(--accent)]">The System Is.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-base mb-8 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              Whether you need a ready-to-go AI trading bot or robust AI APIs to create your own tools, we've got you covered.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button onClick={() => navigate("/login")} className="px-8 py-2.5 w-full sm:w-auto text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started Free</button>
              <button onClick={() => navigate("/dashboard")} className="px-8 py-2.5 w-full sm:w-auto text-sm font-medium rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] transition-all">Live Demo</button>
            </motion.div>
          </motion.div>
        </section>

        {/* Stat strip */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Active Bots", value: "12" },
              { label: "Win Rate", value: "64%" },
              { label: "Total Trades", value: "10,847" },
              { label: "Avg Payout", value: "$4.20" },
              { label: "Signals Today", value: "38" },
              { label: "Uptime", value: "99.9%" },
            ].map((stat, i) => (
              <div key={i} className="border border-[var(--border)]/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{stat.value}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Trust bar */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="flex flex-wrap justify-center gap-4 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Powered by Deriv API</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> AES-256 encrypted</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Real-time WebSocket data</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> 99.9% uptime SLA</span>
          </motion.div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Brain, title: "369AI Assistant", desc: "Describe your strategy in plain English and let our AI engine generate the logic, risk parameters, and execution blocks automatically.", path: "/ai-assistant" },
              { icon: BarChart3, title: "Advanced Analytics", desc: "Monitor ROI, Drawdown, and Profit Factor in real-time. Gain deep insights into your bot's performance with professional-grade metrics.", path: "/analytics" },
              { icon: Globe, title: "Cloud Execution", desc: "Deploy your bots to our secure cloud infrastructure. Your strategies run 24/7 without needing your computer to stay online.", path: "/cloud-bots" },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeUp} onClick={() => navigate(feature.path)} className="group cursor-pointer p-5 border border-[var(--border)]/50 rounded-xl hover:border-[var(--accent-border)] transition-all duration-300">
                <feature.icon className="w-5 h-5 text-[var(--accent)] mb-3" />
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">{feature.title}</h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Testimonials */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="mb-10">
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Trusted by Traders</h2>
              <p className="text-sm text-[var(--text-muted)]">See what our users say about 369Labs.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Alex K.", role: "Algorithmic Trader", initial: "A", quote: "369Labs completely changed how I approach trading. The AI insights are uncanny." },
                { name: "Sarah M.", role: "Quant Developer", initial: "S", quote: "Best backtesting engine I've used. The parameter sweep is a game changer." },
                { name: "James R.", role: "Full-time Trader", initial: "J", quote: "I've automated my entire strategy. The cloud execution is flawless." },
              ].map((t, i) => (
                <motion.div key={i} variants={fadeUp} className="p-5 border border-[var(--border)]/50 rounded-xl">
                  <div className="flex gap-0.5 mb-3">
                    {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-3.5 h-3.5 text-[var(--accent)]" style={{ fill: "var(--accent)" }} />)}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center text-xs font-semibold text-[var(--text-primary)]">{t.initial}</div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-xl font-bold text-[var(--text-primary)] mb-6">Frequently Asked Questions</motion.h2>
            <div className="space-y-2">
              {[
                { q: "How does the AI assistant work?", a: "369AI analyzes live Deriv ticks, detects patterns, suggests strategies, and can execute trades or run backtests on your command." },
                { q: "Do I need programming experience?", a: "No. Use the visual strategy builder to create rules without code, or describe your strategy in plain English to the AI." },
                { q: "What markets are supported?", a: "Deriv's full suite of Volatility Indices (R_10 through R_100, 1-second variants, Boom/Crash) with more coming soon." },
                { q: "Can I run bots 24/7?", a: "Yes. Deploy bots to our cloud infrastructure and they run around the clock without your computer." },
                { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. 2FA is available. We never share your trading data." },
              ].map((faq, i) => (
                <motion.details key={i} variants={fadeUp} className="border border-[var(--border)]/50 rounded-lg group">
                  <summary className="flex items-center justify-between p-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                    {faq.q}
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-open:rotate-90 transition-transform shrink-0" />
                  </summary>
                  <p className="px-3 pb-3 text-sm text-[var(--text-muted)] leading-relaxed">{faq.a}</p>
                </motion.details>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Pricing — moved to end per spec */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="mb-10">
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Simple, Transparent Pricing</h2>
              <p className="text-sm text-[var(--text-muted)]">Start free, upgrade as you grow.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
                { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
                { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
              ].map((plan, i) => (
                <motion.div key={i} variants={fadeUp} className={`relative p-5 border rounded-xl ${plan.popular ? "border-[var(--accent-border)]" : "border-[var(--border)]/50"}`}>
                  {plan.popular && <div className="absolute -top-2.5 left-6 px-3 py-0.5 bg-[var(--accent)] text-[var(--bg)] text-[10px] font-bold rounded-full">Most Popular</div>}
                  <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{plan.name}</h3>
                  <p className="text-2xl font-bold text-[var(--text-primary)] mb-4">{plan.price}<span className="text-xs text-[var(--text-muted)] font-normal ml-1">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" /> {f}</li>
                    ))}
                  </ul>
                  <button onClick={() => navigate("/login")} className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${plan.popular ? "bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)]" : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"}`}>{plan.cta}</button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="border border-[var(--accent-border)]/50 rounded-xl p-10 text-center bg-[var(--accent-soft)]">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Ready to Automate Your Success?</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md mx-auto">Join the next generation of algorithmic traders. Start building your first strategy today.</p>
            <button onClick={() => navigate("/login")} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">
              Launch Dashboard <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        </section>

        <footer className="border-t border-[var(--border)]/30 py-6 px-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">369Labs</span>
            </div>
            <div className="text-xs text-[var(--text-muted)]">&copy; 2026 369Labs. All rights reserved.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}

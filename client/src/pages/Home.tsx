import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, CheckCircle2, Shield, Zap, Clock, TrendingUp, Server, Menu, X, Radar, Wrench, FlaskConical, SearchCheck, MousePointerClick, Bot, GraduationCap, LineChart } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const SYSTEM_FLOW = [
  { icon: Radar, label: "Discover", desc: "Scan live markets", path: "/markets" },
  { icon: LineChart, label: "Analyze", desc: "Health & patterns", path: "/analytics" },
  { icon: Wrench, label: "Build", desc: "Visual strategy lab", path: "/strategy-builder" },
  { icon: FlaskConical, label: "Test", desc: "Backtest & replay", path: "/backtesting" },
  { icon: SearchCheck, label: "Review", desc: "AI risk critique", path: "/ai-assistant" },
  { icon: MousePointerClick, label: "Execute", desc: "One-tap trading", path: "/dashboard" },
  { icon: Bot, label: "Automate", desc: "24/7 cloud bots", path: "/bots" },
  { icon: GraduationCap, label: "Learn", desc: "Journal & improve", path: "/journal" },
];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] selection:bg-[var(--accent)]/20">
      {/* Subtle accent glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-[var(--accent)] blur-[200px] rounded-full opacity-[0.08]" />
        <div className="absolute bottom-0 right-0 w-[420px] h-[320px] bg-[var(--green)] blur-[220px] rounded-full opacity-[0.05]" />
        <div className="absolute top-1/3 left-0 w-[360px] h-[300px] bg-[var(--accent)] blur-[200px] rounded-full opacity-[0.04]" />
      </div>

      {/* Nav */}
      <nav className="relative z-50 border-b border-[var(--border)]/50 sticky top-0 bg-[var(--bg)]">
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
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Login</button>
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm font-semibold px-5 py-2 rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started</button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile full-screen menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--border)]/50 bg-[var(--bg)]">
            <div className="px-6 py-4 space-y-2">
              {[{ label: "Dashboard", path: "/dashboard" }, { label: "Strategy Builder", path: "/strategy-builder" }, { label: "Marketplace", path: "/marketplace" }, { label: "Backtesting", path: "/backtesting" }].map((item) => (
                <button key={item.path} onClick={() => { navigate(item.path); setMobileMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{item.label}</button>
              ))}
              <div className="pt-3 border-t border-[var(--border)]/50 space-y-2">
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-[var(--text-secondary)]">Login</button>
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-center py-2.5 text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)]">Get Started</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-bold text-[var(--text-primary)] mb-5 tracking-tight leading-[1.1]">
              AI Intelligence,<br />
              <span className="text-[var(--accent)]">Automated Execution.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-base mb-8 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              One platform for AI strategy intelligence, automated execution, and trading infrastructure — analyze, build, test, and run without building your own stack.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button onClick={() => navigate("/login")} className="px-8 py-2.5 w-full sm:w-auto text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started Free</button>
              <button onClick={() => navigate("/dashboard")} className="px-8 py-2.5 w-full sm:w-auto text-sm font-medium rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] transition-all">Live Demo</button>
            </motion.div>
          </motion.div>
        </section>

        {/* Stat strip */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex md:grid md:grid-cols-6 gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {[
              { label: "Active Bots", value: "—", demo: true },
              { label: "Win Rate", value: "—", demo: true },
              { label: "Total Trades", value: "—", demo: true },
              { label: "Avg Payout", value: "—", demo: true },
              { label: "Signals Today", value: "—", demo: true },
              { label: "Uptime", value: "99.9%", demo: false },
            ].map((stat, i) => (
              <div key={i} className="border border-[var(--border)]/50 rounded-lg p-3 text-center snap-start shrink-0 w-[120px] md:w-auto">
                <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{stat.value}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{stat.label}</div>
                {stat.demo && <div className="text-[9px] text-[var(--accent)] mt-1">Demo data</div>}
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

        {/* The System — the full 369Labs loop */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-[var(--accent)] border border-[var(--accent-border)] bg-[var(--accent-soft)] mb-4">
                <Activity className="w-3 h-3" /> The System
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight mb-3">
                The full loop, <span className="text-[var(--accent)]">on one platform.</span>
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
                369Labs is a complete loop — from market discovery to automated execution to measurable learning. Every stage feeds the next.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SYSTEM_FLOW.map((step, i) => (
                <motion.div key={step.label} variants={fadeUp} className="relative group cursor-pointer" onClick={() => navigate(step.path)}>
                  <div className="p-4 border border-[var(--border)]/50 rounded-xl bg-[var(--card)]/40 hover:border-[var(--accent-border)] hover:bg-[var(--card)] transition-all duration-300 h-full">
                    <div className="flex items-center justify-between mb-3">
                      <step.icon className="w-5 h-5 text-[var(--accent)]" />
                      <span className="text-[10px] font-mono text-[var(--text-disabled)]">0{i + 1}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{step.label}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{step.desc}</p>
                  </div>
                  {i < SYSTEM_FLOW.length - 1 && (
                    <ChevronRight className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--accent)]/40 z-10" />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* 369AI Introduction */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="relative overflow-hidden rounded-2xl border border-[var(--accent-border)]/50 bg-[var(--card)]/40 p-8 md:p-12">
            <div className="absolute -top-16 right-0 w-[300px] h-[300px] bg-[var(--accent)] blur-[160px] rounded-full opacity-[0.1] pointer-events-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center relative">
              <div>
                <motion.div variants={fadeUp} className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 bg-[var(--accent)] rounded-xl flex items-center justify-center">
                    <Brain className="w-5 h-5 text-[var(--bg)]" />
                  </div>
                  <span className="text-sm font-bold text-[var(--accent)]">369AI</span>
                </motion.div>
                <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight mb-4">
                  Your intelligence layer,<br />embedded where you trade.
                </motion.h2>
                <motion.p variants={fadeUp} className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                  369AI doesn't live in a corner of the app. It watches the market beside your chart, reviews your strategies before you deploy them, and scores every decision you make — turning raw market data into a calm, contextual edge.
                </motion.p>
                <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 max-w-md">
                  {[
                    { icon: Radar, text: "Market health, live" },
                    { icon: SearchCheck, text: "Strategy critique" },
                    { icon: LineChart, text: "Digit intelligence" },
                    { icon: Bot, text: "Trade review" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <item.icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      {item.text}
                    </div>
                  ))}
                </motion.div>
              </div>
              <motion.div variants={fadeUp} className="space-y-3">
                {[
                  { label: "Market Health", value: "Live", note: "Momentum, volatility & digit distribution scored from live ticks", pct: 0 },
                  { label: "Strategy Review", value: "Live", note: "AI critiques risk & logic before you deploy", pct: 0 },
                  { label: "Verdict", value: "Live", note: "Top symbol & contract type ranked from your session", pct: 0 },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-[var(--border)]/50 bg-[var(--card)]/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{row.label}</span>
                      <span className="text-sm font-bold font-mono tabular-nums text-[var(--accent)]">{row.value}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{row.note}</p>
                  </div>
                ))}
              </motion.div>
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

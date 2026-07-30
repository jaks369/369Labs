import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, Star, CheckCircle2, Zap, Shield, TrendingUp, ArrowRight, Lock, Cpu } from "lucide-react";
import { motion } from "framer-motion";
import Particles from "@/components/Particles";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] selection:bg-[var(--amber)]/30 overflow-hidden">
      <Particles count={40} />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[var(--amber)] blur-[180px] rounded-full opacity-20 animate-glow-pulse" />
        <div className="absolute top-[400px] right-[-100px] w-[400px] h-[400px] bg-[var(--cyan)] blur-[150px] rounded-full opacity-10" />
        <div className="absolute bottom-[200px] left-[-100px] w-[300px] h-[300px] bg-[var(--amber)] blur-[120px] rounded-full opacity-10" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      <motion.nav initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-50 glass-strong sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-9 h-9 bg-gradient-to-br from-[var(--amber)] to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-[var(--amber)]/25 group-hover:scale-110 group-hover:shadow-[var(--amber)]/40 transition-all duration-300">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {[{ label: "Dashboard", path: "/dashboard" }, { label: "Strategy Builder", path: "/strategy-builder" }, { label: "Marketplace", path: "/marketplace" }, { label: "Backtesting", path: "/backtesting" }].map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200">{item.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/login")} className="text-sm font-medium text-[var(--text-muted)] hover:text-white transition-colors px-4 py-2">Login</button>
            <Button onClick={() => navigate("/login")} className="btn btn-primary text-sm flex items-center gap-1.5 px-5 py-2.5 rounded-xl btn-glow shadow-lg shadow-[var(--amber)]/20">
              Get Started <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.nav>

      <main className="relative z-10">
        <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--amber)] blur-[200px] rounded-full opacity-15 pointer-events-none" />
          <motion.div initial="hidden" animate="visible" variants={stagger} className="relative z-10">
            <motion.div variants={fadeUp} className="inline-flex mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-gradient-to-r from-[var(--amber)]/20 to-[var(--amber)]/10 border border-[var(--amber)]/30 text-[var(--amber)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--amber)]/75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--amber)]" />
                </span>
                V1.0 NOW LIVE
              </div>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-extrabold text-white mb-6 tracking-tighter leading-[1.05]">
              Trading Isn't the Product.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--amber)] via-amber-400 to-[var(--green)] text-glow-amber">The System Is.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg mb-10 mx-auto leading-relaxed text-[var(--text-muted)] max-w-2xl">
              Whether you need a ready-to-go AI trading bot or robust AI APIs to create your own tools, we've got you covered.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button onClick={() => navigate("/login")} className="btn btn-primary px-10 py-3.5 w-full sm:w-auto text-sm rounded-xl btn-glow shadow-xl shadow-[var(--amber)]/25 hover:shadow-[var(--amber)]/40 transition-all duration-300">Get Started Free</button>
              <button onClick={() => navigate("/dashboard")} className="btn btn-outline px-10 py-3.5 w-full sm:w-auto text-sm rounded-xl glass-card">Live Demo</button>
            </motion.div>
          </motion.div>

          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div animate={{ y: [-10, 10, -10], rotate: [0, 5, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute top-[20%] left-[10%] w-16 h-16 glass-card rounded-2xl flex items-center justify-center">
              <div className="text-2xl font-bold text-[var(--amber)]">ETH</div>
            </motion.div>
            <motion.div animate={{ y: [10, -10, 10], rotate: [0, -5, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} className="absolute top-[15%] right-[10%] w-20 h-20 glass-card rounded-2xl flex items-center justify-center">
              <div className="text-3xl font-bold text-[var(--amber)]">BTC</div>
            </motion.div>
            <motion.div animate={{ y: [-8, 8, -8], rotate: [0, 3, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-[30%] left-[8%] w-14 h-14 glass-card rounded-2xl flex items-center justify-center">
              <div className="text-xl font-bold text-[var(--cyan)]">SOL</div>
            </motion.div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[{ label: "Total PnL", value: "$17.26", icon: TrendingUp }, { label: "Total APY", value: "7,940", icon: Zap }, { label: "Number of Trades", value: "10,000", icon: BarChart3 }, { label: "Position Size", value: "1.5M", icon: Shield }].map((stat, i) => (
              <div key={i} className="text-center">
                <stat.icon className="w-5 h-5 text-[var(--amber)] mx-auto mb-2 opacity-60" />
                <div className="text-2xl font-bold text-white stat-number">{stat.value}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Brain, title: "369AI Assistant", desc: "Describe your strategy in plain English and let our AI engine generate the logic, risk parameters, and execution blocks automatically.", color: "cyan", path: "/ai-assistant" },
              { icon: BarChart3, title: "Advanced Analytics", desc: "Monitor ROI, Drawdown, and Profit Factor in real-time. Gain deep insights into your bot's performance with professional-grade metrics.", color: "amber", path: "/analytics" },
              { icon: Globe, title: "Cloud Execution", desc: "Deploy your bots to our secure cloud infrastructure. Your strategies run 24/7 without needing your computer to stay online.", color: "amber", path: "/cloud-bots" },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeUp} onClick={() => navigate(feature.path)} className="glass-card card-shine cursor-pointer p-6 group">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[var(--${feature.color}-soft)] group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-6 h-6 text-[var(--${feature.color})]`} />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">{feature.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--amber)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  Learn more <ArrowRight className="w-4 h-4" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Trusted by Traders</h2>
              <p className="text-[var(--text-muted)]">See what our users say about 369Labs.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Alex K.", role: "Algorithmic Trader", initial: "A", quote: "369Labs completely changed how I approach trading. The AI insights are uncanny." },
                { name: "Sarah M.", role: "Quant Developer", initial: "S", quote: "Best backtesting engine I've used. The parameter sweep is a game changer." },
                { name: "James R.", role: "Full-time Trader", initial: "J", quote: "I've automated my entire strategy. The cloud execution is flawless." },
              ].map((t, i) => (
                <motion.div key={i} variants={fadeUp} className="glass-card card-shine p-6 hover-lift">
                  <div className="flex gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-4 h-4 text-[var(--amber)]" style={{ fill: "var(--amber)" }} />)}
                  </div>
                  <p className="text-sm mb-4 italic leading-relaxed text-[var(--text-secondary)]">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--amber)] to-amber-600 flex items-center justify-center text-sm font-bold text-white">{t.initial}</div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Simple, Transparent Pricing</h2>
              <p className="text-[var(--text-muted)]">Start free, upgrade as you grow.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
                { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
                { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
              ].map((plan, i) => (
                <motion.div key={i} variants={fadeUp} className={`relative glass-card p-6 hover-lift ${plan.popular ? "ring-1 ring-[var(--amber)] shadow-lg shadow-[var(--amber)]/10" : ""}`}>
                  {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-[var(--amber)] to-amber-500 text-black text-xs font-bold rounded-full shadow-lg shadow-[var(--amber)]/30">Most Popular</div>}
                  <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-3xl font-extrabold text-white mb-4">{plan.price}<span className="text-sm text-[var(--text-muted)] font-normal">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><CheckCircle2 className="w-4 h-4 text-[var(--green)] shrink-0" /> {f}</li>
                    ))}
                  </ul>
                  <button onClick={() => navigate("/login")} className={`w-full py-3 rounded-xl text-sm font-bold transition-all duration-300 ${plan.popular ? "bg-gradient-to-r from-[var(--amber)] to-amber-500 text-black hover:shadow-lg hover:shadow-[var(--amber)]/30" : "border border-[var(--border)] text-white hover:bg-white/5 hover:border-[var(--amber)]/30"}`}>{plan.cta}</button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-12">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--amber)] to-amber-600" />
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
            <div className="relative z-10 p-12 text-center">
              <h2 className="text-3xl font-bold text-black mb-3">Ready to Automate Your Success?</h2>
              <p className="text-black/70 text-base mb-6 max-w-xl mx-auto">Join the next generation of algorithmic traders. Start building your first strategy today.</p>
              <button onClick={() => navigate("/login")} className="inline-flex items-center gap-2 px-8 py-3 text-sm bg-white text-black hover:bg-gray-100 rounded-xl font-bold shadow-xl transition-all duration-300 hover:scale-105">
                Launch Dashboard <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </section>

        <section className="max-w-3xl mx-auto px-6 py-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</motion.h2>
            <div className="space-y-3">
              {[
                { q: "How does the AI assistant work?", a: "369AI analyzes live Deriv ticks, detects patterns, suggests strategies, and can execute trades or run backtests on your command." },
                { q: "Do I need programming experience?", a: "No. Use the visual strategy builder to create rules without code, or describe your strategy in plain English to the AI." },
                { q: "What markets are supported?", a: "Deriv's full suite of Volatility Indices (R_10 through R_100, 1-second variants, Boom/Crash) with more coming soon." },
                { q: "Can I run bots 24/7?", a: "Yes. Deploy bots to our cloud infrastructure and they run around the clock without your computer." },
                { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. 2FA is available. We never share your trading data." },
              ].map((faq, i) => (
                <motion.details key={i} variants={fadeUp} className="glass-card rounded-xl group">
                  <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-semibold text-white hover:text-[var(--amber)] transition-colors">
                    {faq.q}
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-open:rotate-90 transition-transform shrink-0" />
                  </summary>
                  <p className="px-4 pb-4 text-sm text-[var(--text-muted)]" style={{ lineHeight: "1.7" }}>{faq.a}</p>
                </motion.details>
              ))}
            </div>
          </motion.div>
        </section>

        <footer className="border-t border-[var(--border)]/50 py-8 px-6 glass-strong">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-[var(--amber)] to-amber-600 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-white">369Labs</span>
            </div>
            <div className="text-xs text-[var(--text-muted)]">&copy; 2026 369Labs. All rights reserved.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}

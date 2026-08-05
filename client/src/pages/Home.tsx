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
    <div className="h-full text-[var(--text-primary)] selection:bg-[var(--accent)]/20">
      {/* Full-bleed processed nature photo — fixed background, covers entire page */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        {/* Base photo with color grade filters */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/aurora-nature.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
            backgroundAttachment: 'fixed',
            /* Color grade: shift vegetation greens → teal, sky → purple/violet, shadows → navy, reduce brightness 15-20% */
            filter: 'hue-rotate(15deg) saturate(1.1) brightness(0.82) contrast(1.05)',
          }}
        />
        {/* Aurora glow layer — screen blend so light emits from within the photo */}
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(ellipse 1000px 700px at 30% 10%, rgba(52,224,161,0.35), transparent 55%),
            radial-gradient(ellipse 900px 800px at 75% 0%, rgba(167,139,250,0.35), transparent 55%),
            radial-gradient(ellipse 700px 600px at 55% 25%, rgba(232,121,249,0.20), transparent 60%)
          `,
          mixBlendMode: 'screen',
        }} />
        {/* Magenta-to-purple color wash in cloud bank area — soft-light blend */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.12) 30%, transparent 60%)',
          mixBlendMode: 'soft-light',
        }} />
        {/* Bottom fade over final ~25% of viewport for text legibility */}
        <div className="absolute bottom-0 inset-x-0 h-[25vh]" style={{
          background: 'linear-gradient(180deg, transparent 0%, var(--bg-base) 100%)',
        }} />
      </div>

      {/* Nav — glass-surface floating on photo */}
      <nav className="relative z-50 border-b border-[rgba(255,255,255,0.09)] sticky top-0 glass-surface">
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-white">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
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
          <div className="md:hidden border-t border-[rgba(255,255,255,0.09)] glass-surface">
            <div className="px-6 py-4 space-y-2">
              <div className="pt-3 border-t border-[var(--border)]/50 space-y-2">
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-[var(--text-secondary)]">Login</button>
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-center py-2.5 text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)]">Get Started</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="relative z-10">
        {/* Hero — floats on top of the full-bleed photo */}
        <section className="relative max-w-4xl mx-auto px-6 pt-16 pb-8 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.h1 variants={fadeUp} className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-[1.1]">
              AI Intelligence,<br />
              <span className="aurora-gradient-text">Automated Execution.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm mb-6 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              One platform for AI strategy intelligence, automated execution, and trading infrastructure — analyze, build, test, and run without building your own stack.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-2 justify-center items-center">
              <button onClick={() => navigate("/login")} className="px-6 py-2 w-full sm:w-auto text-sm font-semibold rounded-full text-black transition-all hover:brightness-110" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>Get Started Free</button>
              <button onClick={() => navigate("/dashboard")} className="px-6 py-2 w-full sm:w-auto text-sm font-medium rounded-full border border-[rgba(255,255,255,0.15)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.25)] hover:text-white transition-all">Live Demo</button>
            </motion.div>
          </motion.div>
        </section>

        {/* Stat strip */}
        <section className="max-w-5xl mx-auto px-6 pb-8">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex md:grid md:grid-cols-6 gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {[
              { label: "Active Bots", value: "—", demo: true },
              { label: "Win Rate", value: "—", demo: true },
              { label: "Total Trades", value: "—", demo: true },
              { label: "Avg Payout", value: "—", demo: true },
              { label: "Signals Today", value: "—", demo: true },
              { label: "Uptime", value: "99.9%", demo: false },
            ].map((stat, i) => (
              <div key={i} className="glass-surface rounded-lg p-2.5 text-center snap-start shrink-0 w-[110px] md:w-auto">
                <div className="text-base font-bold text-white tabular-nums">{stat.value}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{stat.label}</div>
                {stat.demo && <div className="text-[8px] text-[var(--accent)] mt-0.5">Demo data</div>}
              </div>
            ))}
          </motion.div>
        </section>

        {/* Trust bar */}
        <section className="max-w-4xl mx-auto px-6 pb-8">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="flex flex-wrap justify-center gap-4 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Powered by Deriv API</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> AES-256 encrypted</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Real-time WebSocket data</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> 99.9% uptime SLA</span>
          </motion.div>
</section>

        <footer className="border-t border-[rgba(255,255,255,0.08)] py-4 px-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>
                <Activity className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">369Labs</span>
            </div>
            <div className="text-xs text-[var(--text-muted)]">&copy; 2026 369Labs. All rights reserved.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}

import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, CheckCircle2, Shield, Zap, Clock, TrendingUp, Server, Radar, Wrench, FlaskConical, SearchCheck, MousePointerClick, Bot, GraduationCap, LineChart, ChevronLeft } from "lucide-react";
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

export default function HowItWorks() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="h-full text-[var(--text-primary)] selection:bg-[var(--accent)]/20">
      {/* Full-bleed processed nature photo — fixed background, covers entire page */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/aurora-nature.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
            backgroundAttachment: 'fixed',
            filter: 'hue-rotate(15deg) saturate(1.1) brightness(0.82) contrast(1.05)',
          }}
        />
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(ellipse 1000px 700px at 30% 10%, rgba(52,224,161,0.35), transparent 55%),
            radial-gradient(ellipse 900px 800px at 75% 0%, rgba(167,139,250,0.35), transparent 55%),
            radial-gradient(ellipse 700px 600px at 55% 25%, rgba(232,121,249,0.20), transparent 60%)
          `,
          mixBlendMode: 'screen',
        }} />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.12) 30%, transparent 60%)',
          mixBlendMode: 'soft-light',
        }} />
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
              {[{ label: "Dashboard", path: "/dashboard" }, { label: "Strategy Builder", path: "/strategy-builder" }, { label: "Marketplace", path: "/marketplace" }, { label: "Backtesting", path: "/backtesting" }].map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">{item.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Login</button>
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm font-semibold px-5 py-2 rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero — floats on top of the full-bleed photo */}
        <section className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} className="mb-6 flex items-center justify-center gap-2">
              <ChevronLeft className="w-5 h-5 text-[var(--accent)]" />
              <button onClick={() => navigate("/")} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Back to Home</button>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-bold text-white mb-5 tracking-tight leading-[1.1]">
              The Full Loop,<br />
              <span className="aurora-gradient-text">On One Platform.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-base mb-8 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              369Labs is a complete loop — from market discovery to automated execution to measurable learning. Every stage feeds the next.
            </motion.p>
          </motion.div>
        </section>

        {/* The System — the full 369Labs loop */}
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SYSTEM_FLOW.map((step, i) => (
                <motion.div key={step.label} variants={fadeUp} className="relative group cursor-pointer" onClick={() => navigate(step.path)}>
                  <div className="glass-surface rounded-xl p-4 hover:border-[rgba(255,255,255,0.15)] transition-all duration-300 h-full">
                    <div className="flex items-center justify-between mb-3">
                      <step.icon className="w-5 h-5 text-[var(--accent)]" />
                      <span className="text-[10px] font-mono text-[var(--text-disabled)]">0{i + 1}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{step.label}</h3>
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

        <footer className="border-t border-[rgba(255,255,255,0.08)] py-6 px-6">
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
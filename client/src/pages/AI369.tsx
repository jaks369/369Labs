import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, CheckCircle2, Shield, Zap, Clock, TrendingUp, Server, Radar, Wrench, FlaskConical, SearchCheck, MousePointerClick, Bot, GraduationCap, LineChart, ChevronLeft, SearchCheck as SearchCheckIcon, LineChart as LineChartIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function AI369() {
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
            filter: 'brightness(0.75) contrast(1.05)',
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
      <nav className="relative z-50 border-b border-[rgba(255,255,255,0.12)] sticky top-0" style={{ background: 'rgba(10,14,23,0.55)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-white">369Labs</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Login</button>
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm font-semibold px-5 py-2 rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero */}
        <section className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} className="mb-6 flex items-center justify-center gap-2">
              <ChevronLeft className="w-5 h-5 text-[var(--accent)]" />
              <button onClick={() => navigate("/")} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Back to Home</button>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-bold text-white mb-5 tracking-tight leading-[1.1]">
              Your Intelligence Layer,<br />
              <span className="aurora-gradient-text">Embedded Where You Trade.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-base mb-8 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              369AI doesn't live in a corner of the app. It watches the market beside your chart, reviews your strategies before you deploy them, and scores every decision you make — turning raw market data into a calm, contextual edge.
            </motion.p>
          </motion.div>
        </section>

        {/* 369AI Section */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="relative overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] p-8 md:p-12" style={{ background: 'rgba(10,14,23,0.5)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            <div className="absolute -top-16 right-0 w-[300px] h-[300px] blur-[160px] rounded-full opacity-[0.1] pointer-events-none" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center relative">
              <div>
                <motion.div variants={fadeUp} className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-sm font-bold text-[var(--accent)]">369AI</span>
                </motion.div>
                <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                  Your intelligence layer,<br />embedded where you trade.
                </motion.h2>
                <motion.p variants={fadeUp} className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                  369AI doesn't live in a corner of the app. It watches the market beside your chart, reviews your strategies before you deploy them, and scores every decision you make — turning raw market data into a calm, contextual edge.
                </motion.p>
                <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 max-w-md">
                  {[
                    { icon: Radar, text: "Market health, live" },
                    { icon: SearchCheckIcon, text: "Strategy critique" },
                    { icon: LineChartIcon, text: "Digit intelligence" },
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
                  { label: "Market Health", value: "Live", note: "Momentum, volatility & digit distribution scored from live ticks" },
                  { label: "Strategy Review", value: "Live", note: "AI critiques risk & logic before you deploy" },
                  { label: "Verdict", value: "Live", note: "Top symbol & contract type ranked from your session" },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl p-4" style={{ background: 'rgba(10,14,23,0.45)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
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

        <footer className="border-t border-[rgba(255,255,255,0.1)] py-6 px-6" style={{ background: 'rgba(10,14,23,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
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
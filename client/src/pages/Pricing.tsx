import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Brain, Globe, BarChart3, ChevronRight, Activity, CheckCircle2, Shield, Zap, Clock, TrendingUp, Server, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function Pricing() {
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
              Simple, Transparent<br />
              <span className="aurora-gradient-text">Pricing</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-base mb-8 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              Start free, upgrade as you grow. No hidden fees, no surprises.
            </motion.p>
          </motion.div>
        </section>

        {/* Pricing Cards */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
                { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
                { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
              ].map((plan, i) => (
                <motion.div key={i} variants={fadeUp} className={`relative p-5 rounded-xl ${plan.popular ? "border-[rgba(255,255,255,0.18)]" : ""}`} style={{ background: 'rgba(10,14,23,0.5)', backdropFilter: 'blur(20px) saturate(1.3)', WebkitBackdropFilter: 'blur(20px) saturate(1.3)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                  {plan.popular && <div className="absolute -top-2.5 left-6 px-3 py-0.5 text-[var(--bg)] text-[10px] font-bold rounded-full" style={{ background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' }}>Most Popular</div>}
                  <h3 className="text-base font-semibold text-white mb-1">{plan.name}</h3>
                  <p className="text-2xl font-bold text-white mb-4">{plan.price}<span className="text-xs text-[var(--text-muted)] font-normal ml-1">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" /> {f}</li>
                    ))}
                  </ul>
                  <button onClick={() => navigate("/login")} className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${plan.popular ? "text-black hover:brightness-110" : "border border-[rgba(255,255,255,0.12)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.20)] hover:text-white"}`} style={plan.popular ? { background: 'linear-gradient(135deg, #4ade80, #8b5cf6)' } : undefined}>{plan.cta}</button>
                </motion.div>
              ))}
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
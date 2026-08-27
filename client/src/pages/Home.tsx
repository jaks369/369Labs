import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Brain,
  Activity,
  Shield,
  Zap,
  Clock,
  Server,
  Radar,
  Wrench,
  FlaskConical,
  SearchCheck,
  MousePointerClick,
  Bot,
  GraduationCap,
  LineChart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const GLASS_CARD: React.CSSProperties = {
  background: "linear-gradient(160deg, var(--glass-fill-strong) 0%, var(--bg-base) 100%)",
  backdropFilter: "blur(var(--glass-blur)) saturate(1.3)",
  WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(1.3)",
  border: "1px solid var(--glass-border)",
  boxShadow: "var(--glass-shadow), var(--glass-inner-highlight)",
};

const GLASS_PILL: React.CSSProperties = {
  background: "var(--glass-fill)",
  backdropFilter: "blur(var(--glass-blur)) saturate(1.3)",
  WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(1.3)",
  border: "1px solid var(--glass-border)",
  boxShadow: "var(--glass-shadow), var(--glass-inner-highlight)",
};

const TEXT_SHADOW: React.CSSProperties = { textShadow: "0 2px 12px rgba(0,0,0,0.6)" };

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

const PLANS = [
  { name: "Starter", price: "$0", features: ["Paper trading", "Basic backtesting", "3 active bots", "Community signals"], cta: "Get Started Free" },
  { name: "Pro", price: "$29", features: ["Real trading", "Advanced backtesting", "Unlimited bots", "AI signals & alerts", "Priority support"], cta: "Start Free Trial", popular: true },
  { name: "Enterprise", price: "$99", features: ["Everything in Pro", "Dedicated infrastructure", "Custom AI models", "SLA guarantee", "Team management"], cta: "Contact Sales" },
];

const AI_FEATURES = [
  { icon: Radar, text: "Market health, live" },
  { icon: SearchCheck, text: "Strategy critique" },
  { icon: LineChart, text: "Digit intelligence" },
  { icon: Bot, text: "Trade review" },
];

const AI_ROWS = [
  { label: "Market Health", value: "Live", note: "Momentum, volatility & digit distribution scored from live ticks" },
  { label: "Strategy Review", value: "Live", note: "AI critiques risk & logic before you deploy" },
  { label: "Verdict", value: "Live", note: "Top symbol & contract type ranked from your session" },
];

const SLIDE_NAMES = ["Home", "How it Works", "369AI", "Pricing"];

const STATS = [
  { label: "Active Bots", value: "—", demo: true },
  { label: "Win Rate", value: "—", demo: true },
  { label: "Total Trades", value: "—", demo: true },
  { label: "Avg Payout", value: "—", demo: true },
  { label: "Signals Today", value: "—", demo: true },
  { label: "Uptime", value: "99.9%", demo: true },
];

function getInitialSlide() {
  if (typeof window === "undefined") return 0;
  const match = window.location.search.match(/[?&]slide=(\d+)/);
  const n = match ? parseInt(match[1], 10) : 0;
  return Number.isFinite(n) && n >= 0 && n < SLIDE_NAMES.length ? n : 0;
}

function SlideShell({ maxWidth, children }: { maxWidth: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className={`relative w-full ${maxWidth}`}>
        {/* Dark scrim behind the text zone only — keeps headline/body readable over bright aurora bands */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 900px 500px at 50% 45%, rgba(5,8,15,0.55), transparent 70%)" }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setCurrent(api.selectedScrollSnap());
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  const goTo = useCallback((index: number) => api?.scrollTo(index), [api]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!api) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        api.scrollPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        api.scrollNext();
      } else if (e.key === "Home") {
        e.preventDefault();
        api.scrollTo(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  return (
    <div className="h-screen overflow-hidden text-[var(--text-primary)] selection:bg-[var(--accent)]/20">
      {/* Full-bleed processed nature photo — fixed background, continuous across every slide */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/aurora-nature.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            backgroundAttachment: "fixed",
            filter: "brightness(0.75) contrast(1.05)",
          }}
        />
        {/* Aurora glow layer — screen blend so light emits from within the photo */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 1000px 700px at 30% 10%, rgba(52,224,161,0.35), transparent 55%),
              radial-gradient(ellipse 900px 800px at 75% 0%, rgba(167,139,250,0.35), transparent 55%),
              radial-gradient(ellipse 700px 600px at 55% 25%, rgba(232,121,249,0.20), transparent 60%)
            `,
            mixBlendMode: "screen",
          }}
        />
        {/* Magenta-to-purple color wash in cloud bank area — soft-light blend */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(232,121,249,0.12) 30%, transparent 60%)",
            mixBlendMode: "soft-light",
          }}
        />
        {/* Bottom fade over final ~25% of viewport for text legibility */}
        <div
          className="absolute bottom-0 inset-x-0 h-[25vh]"
          style={{ background: "linear-gradient(180deg, transparent 0%, var(--bg-base) 100%)" }}
        />
      </div>

      {/* Nav — glass-surface floating on photo. Logged-out: logo + Login + Get Started only. */}
      <nav
        className="relative z-50 border-b border-[rgba(255,255,255,0.12)] sticky top-0"
        style={{
          background: "rgba(10,14,23,0.55)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" }}>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-white">369Labs</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="hidden sm:block text-sm font-semibold px-5 py-2 rounded-full border border-[rgba(255,255,255,0.18)] text-white hover:border-[rgba(255,255,255,0.32)] hover:bg-white/5 transition-colors">Dashboard</button>
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Login</button>
            <button onClick={() => navigate("/login")} className="hidden sm:block text-sm font-semibold px-5 py-2 rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)] hover:bg-[var(--cta-fill-hover)] transition-colors">Get Started</button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[rgba(255,255,255,0.09)]" style={GLASS_PILL}>
            <div className="px-6 py-4 space-y-2">
              <div className="pt-3 border-t border-[var(--border)]/50 space-y-2">
                <button onClick={() => { navigate("/dashboard"); setMobileMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-[var(--text-secondary)]">Dashboard</button>
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-[var(--text-secondary)]">Login</button>
                <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="block w-full text-center py-2.5 text-sm font-semibold rounded-full bg-[var(--cta-fill)] text-[var(--cta-text)]">Get Started</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="relative z-10 h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="relative flex-1 min-h-0">
          <Carousel setApi={setApi} className="carousel-fill h-full" opts={{ duration: 15, startIndex: getInitialSlide() }}>
            <CarouselContent className="h-full">
              {/* ── Slide 1 · Home ─────────────────────────────────── */}
              <CarouselItem className="h-full">
                <SlideShell maxWidth="max-w-4xl">
                  <div className="text-center">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-[1.1]" style={TEXT_SHADOW}>
                      AI Intelligence,<br />
                      <span className="aurora-gradient-text">Automated Execution.</span>
                    </h1>
                    <p className="text-sm md:text-base mb-6 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed" style={TEXT_SHADOW}>
                      One platform for AI strategy intelligence, automated execution, and trading infrastructure — analyze, build, test, and run without building your own stack.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                      <button onClick={() => navigate("/login")} className="px-6 py-2 w-full sm:w-auto text-sm font-semibold rounded-full text-black transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" }}>Get Started Free</button>
                      <button onClick={() => navigate("/dashboard")} className="px-6 py-2 w-full sm:w-auto text-sm font-medium rounded-full border border-[rgba(255,255,255,0.15)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.25)] hover:text-white transition-all" style={TEXT_SHADOW}>Live Demo</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 mt-7">
                    {STATS.map((stat) => (
                      <div key={stat.label} className="rounded-lg p-2.5 text-center" style={GLASS_CARD}>
                        <div className="text-base font-bold text-white tabular-nums" style={TEXT_SHADOW}>{stat.value}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5" style={TEXT_SHADOW}>{stat.label}</div>
                        {stat.demo && <div className="text-[8px] text-[var(--accent)] mt-0.5">Demo data</div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 mt-6 text-[11px] text-[var(--text-muted)]" style={TEXT_SHADOW}>
                    <span className="flex items-center gap-1.5"><Server className="w-3 h-3" /> Powered by Deriv API</span>
                    <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> AES-256 encrypted</span>
                    <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Real-time WebSocket data</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> 99.9% uptime SLA</span>
                  </div>
                </SlideShell>
              </CarouselItem>

              {/* ── Slide 2 · How it Works ─────────────────────────── */}
              <CarouselItem className="h-full">
                <SlideShell maxWidth="max-w-6xl">
                  <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-[1.1]" style={TEXT_SHADOW}>
                      The Full Loop,<br />
                      <span className="aurora-gradient-text">On One Platform.</span>
                    </h1>
                    <p className="text-sm md:text-base mb-2 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed" style={TEXT_SHADOW}>
                      369Labs is a complete loop — from market discovery to automated execution to measurable learning. Every stage feeds the next.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {SYSTEM_FLOW.map((step, i) => (
                      <div key={step.label} className="relative group cursor-pointer rounded-xl p-4 transition-all duration-300 hover:border-[rgba(255,255,255,0.2)]" style={GLASS_CARD} onClick={() => navigate(step.path)}>
                        <div className="flex items-center justify-between mb-3">
                          <step.icon className="w-5 h-5 text-[var(--accent)]" />
                          <span className="text-[10px] font-mono text-[var(--text-disabled)]">0{i + 1}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white">{step.label}</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{step.desc}</p>
                      </div>
                    ))}
                  </div>
                </SlideShell>
              </CarouselItem>

              {/* ── Slide 3 · 369AI ────────────────────────────────── */}
              <CarouselItem className="h-full">
                <SlideShell maxWidth="max-w-6xl">
                  <div className="relative overflow-hidden rounded-2xl p-6 md:p-10" style={GLASS_CARD}>
                    <div className="absolute -top-16 right-0 w-[300px] h-[300px] blur-[160px] rounded-full opacity-[0.1] pointer-events-none" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" }} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center relative">
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" }}>
                            <Brain className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-sm font-bold text-[var(--accent)]">369AI</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4" style={TEXT_SHADOW}>
                          Your intelligence layer,<br />embedded where you trade.
                        </h2>
                        <p className="text-sm md:text-base text-[var(--text-secondary)] leading-relaxed mb-6" style={TEXT_SHADOW}>
                          369AI doesn't live in a corner of the app. It watches the market beside your chart, reviews your strategies before you deploy them, and scores every decision you make — turning raw market data into a calm, contextual edge.
                        </p>
                        <div className="grid grid-cols-2 gap-3 max-w-md">
                          {AI_FEATURES.map((item) => (
                            <div key={item.text} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                              <item.icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                              {item.text}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {AI_ROWS.map((row) => (
                          <div key={row.label} className="rounded-xl p-4" style={GLASS_CARD}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{row.label}</span>
                              <span className="text-sm font-bold font-mono tabular-nums text-[var(--accent)]">{row.value}</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">{row.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </SlideShell>
              </CarouselItem>

              {/* ── Slide 4 · Pricing ──────────────────────────────── */}
              <CarouselItem className="h-full">
                <SlideShell maxWidth="max-w-6xl">
                  <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-[1.1]" style={TEXT_SHADOW}>
                      Simple, Transparent<br />
                      <span className="aurora-gradient-text">Pricing</span>
                    </h1>
                    <p className="text-sm md:text-base mb-2 text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed" style={TEXT_SHADOW}>
                      Start free, upgrade as you grow. No hidden fees, no surprises.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {PLANS.map((plan) => (
                      <div key={plan.name} className={`relative p-5 rounded-xl ${plan.popular ? "border-[rgba(255,255,255,0.2)]" : ""}`} style={GLASS_CARD}>
                        {plan.popular && <div className="absolute -top-2.5 left-6 px-3 py-0.5 text-[var(--bg)] text-[10px] font-bold rounded-full" style={{ background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" }}>Most Popular</div>}
                        <h3 className="text-base font-semibold text-white mb-1">{plan.name}</h3>
                        <p className="text-2xl font-bold text-white mb-4">{plan.price}<span className="text-xs text-[var(--text-muted)] font-normal ml-1">{plan.price !== "$0" ? "/mo" : ""}</span></p>
                        <ul className="space-y-2 mb-5">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" /> {f}</li>
                          ))}
                        </ul>
                        <button onClick={() => navigate("/login")} className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${plan.popular ? "text-black hover:brightness-110" : "border border-[rgba(255,255,255,0.12)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.20)] hover:text-white"}`} style={plan.popular ? { background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))" } : undefined}>{plan.cta}</button>
                      </div>
                    ))}
                  </div>
                </SlideShell>
              </CarouselItem>
            </CarouselContent>
          </Carousel>

          {/* Arrow controls — glass circles at screen edges */}
          <button
            onClick={() => api?.scrollPrev()}
            disabled={!canPrev}
            aria-label="Previous slide"
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none hover:scale-105"
            style={{ left: 16, ...GLASS_PILL }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => api?.scrollNext()}
            disabled={!canNext}
            aria-label="Next slide"
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none hover:scale-105"
            style={{ right: 16, ...GLASS_PILL }}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Dot indicators — glass pill, active dot highlighted */}
        <div className="flex items-center justify-center pb-4">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full" style={GLASS_PILL}>
            {SLIDE_NAMES.map((name, i) => (
              <button
                key={name}
                onClick={() => goTo(i)}
                aria-label={`Go to ${name}`}
                className="rounded-full transition-all duration-300"
                style={
                  i === current
                    ? { width: 28, height: 8, background: "linear-gradient(135deg, var(--aurora-teal), var(--aurora-purple))", boxShadow: "0 0 12px rgba(167,139,250,0.5)" }
                    : { width: 8, height: 8, background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.18)" }
                }
              />
            ))}
          </div>
        </div>

        <footer className="pb-3">
          <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span>&copy; 2026 369Labs. All rights reserved.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

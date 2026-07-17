import { useState } from "react";
import { useLocation } from "wouter";
import { TrendingUp, Bot, Brain, ShieldCheck, Zap, Server } from "lucide-react";

type P = {
  key: string;
  name: string;
  tag: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  accent3: string;
  profit: string;
  loss: string;
  warning: string;
  headingFont: string;
  radius: string;
  shadow: string;
};

// Three direction-based palettes supplied by the owner, translated into
// concrete renderable samples.
const PALETTES: P[] = [
  {
    key: "transcend",
    name: "Transcend Studio",
    tag: "Creative / Modern / Premium",
    bg: "#070707",
    surface: "#0E0E0E",
    border: "#1C1C1C",
    text: "#FFFFFF",
    muted: "#C7C7C7",
    accent: "#FF5FA2",
    accent2: "#A855F7",
    accent3: "#22D3EE",
    profit: "#34D399",
    loss: "#FF6B6B",
    warning: "#FB923C",
    headingFont: "Georgia, 'Times New Roman', serif",
    radius: "14px",
    shadow: "none",
  },
  {
    key: "trademaster",
    name: "TradeMasterPro",
    tag: "Finance / SaaS / Trading",
    bg: "#0D0D0D",
    surface: "rgba(30,30,34,0.6)",
    border: "rgba(255,255,255,0.08)",
    text: "#FFFFFF",
    muted: "#9CA3AF",
    accent: "#FB923C",
    accent2: "#22C55E",
    accent3: "#FB923C",
    profit: "#22C55E",
    loss: "#EF4444",
    warning: "#F59E0B",
    headingFont: "Inter, system-ui, sans-serif",
    radius: "16px",
    shadow: "0 8px 30px rgba(0,0,0,0.4)",
  },
  {
    key: "cloud83",
    name: "Cloud83",
    tag: "Hosting / Infrastructure / Enterprise",
    bg: "#0A0F1A",
    surface: "#111827",
    border: "#1F2937",
    text: "#FFFFFF",
    muted: "#94A3B8",
    accent: "#14B8A6",
    accent2: "#3B82F6",
    accent3: "#22C55E",
    profit: "#22C55E",
    loss: "#EF4444",
    warning: "#F59E0B",
    headingFont: "Inter, system-ui, sans-serif",
    radius: "6px",
    shadow: "none",
  },
];

function TranscendSample({ p }: { p: P }) {
  return (
    <div className="rounded-2xl p-7" style={{ background: p.bg, border: `1px solid ${p.border}`, minHeight: 360 }}>
      <div className="flex gap-2 mb-8">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent2 }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent3 }} />
      </div>
      <h2 className="text-4xl leading-tight font-bold mb-3" style={{ color: p.text, fontFamily: p.headingFont }}>
        Hello folks,<br />we are 369Labs.
      </h2>
      <p className="text-lg mb-10" style={{ color: p.accent2, fontFamily: p.headingFont, fontStyle: "italic" }}>Elegant.</p>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: p.muted }}>
        We build beautiful, AI-powered trading systems. Plenty of room to breathe.
      </p>
      <div className="mt-10 flex gap-6 text-xs" style={{ color: p.muted }}>
        <span className="hover:text-white cursor-pointer">Dashboard</span>
        <span className="hover:text-white cursor-pointer">Strategies</span>
        <span className="hover:text-white cursor-pointer">AI</span>
      </div>
    </div>
  );
}

function TradeSample({ p }: { p: P }) {
  return (
    <div
      className="p-6 space-y-4 relative overflow-hidden"
      style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: p.radius, boxShadow: p.shadow, minHeight: 360 }}
    >
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ color: p.accent }}>
            <Bot className="w-4 h-4" /><span className="text-sm font-bold text-white">Bots</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(251,146,60,0.15)", color: p.accent }}>LIVE</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3 backdrop-blur" style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>Win rate</p>
            <p className="text-xl font-bold" style={{ color: p.profit }}>68.4%</p>
          </div>
          <div className="rounded-xl p-3 backdrop-blur" style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>P&L</p>
            <p className="text-xl font-bold flex items-center gap-1" style={{ color: p.profit }}><TrendingUp className="w-4 h-4" />+$42.10</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: p.accent, color: "#0D0D0D" }}>
            <Zap className="w-3.5 h-3.5 inline mr-1" /> Deploy Bot
          </button>
          <button className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: "transparent", color: p.muted, border: `1px solid ${p.border}` }}>Stop</button>
        </div>
        <div className="flex gap-1 pt-1">
          <span className="h-8 flex-1 rounded" style={{ background: p.profit, opacity: 0.85 }} />
          <span className="h-8 flex-1 rounded" style={{ background: p.accent, opacity: 0.85 }} />
          <span className="h-8 flex-1 rounded" style={{ background: p.warning, opacity: 0.85 }} />
          <span className="h-8 flex-1 rounded" style={{ background: p.loss, opacity: 0.85 }} />
        </div>
      </div>
    </div>
  );
}

function CloudSample({ p }: { p: P }) {
  return (
    <div className="p-6 space-y-4" style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: p.radius, minHeight: 360 }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: p.accent2 }}>
        <Server className="w-4 h-4" /><span className="text-sm font-bold text-white">369Labs Infrastructure</span>
      </div>
      <h2 className="text-2xl font-bold" style={{ color: p.text, fontFamily: p.headingFont }}>Reliable AI Trading</h2>
      <p className="text-sm" style={{ color: p.muted }}>Enterprise-grade execution and monitoring.</p>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="p-3" style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius }}>
          <p className="text-[10px] uppercase" style={{ color: p.muted }}>Uptime</p>
          <p className="text-lg font-bold" style={{ color: p.profit }}>99.9%</p>
        </div>
        <div className="p-3" style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius }}>
          <p className="text-[10px] uppercase" style={{ color: p.muted }}>Active bots</p>
          <p className="text-lg font-bold text-white">12</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-2 text-sm font-bold text-white" style={{ background: p.accent2, borderRadius: p.radius }}>Console</button>
        <button className="px-4 py-2 text-sm font-bold" style={{ background: p.accent, color: "#06121F", borderRadius: p.radius }}>Deploy</button>
        <button className="px-4 py-2 text-sm font-bold" style={{ background: "transparent", color: p.muted, border: `1px solid ${p.border}`, borderRadius: p.radius }}>Docs</button>
      </div>
      <div className="flex gap-1 pt-1">
        <span className="h-7 flex-1" style={{ background: p.accent, opacity: 0.85 }} />
        <span className="h-7 flex-1" style={{ background: p.accent2, opacity: 0.85 }} />
        <span className="h-7 flex-1" style={{ background: p.profit, opacity: 0.85 }} />
        <span className="h-7 flex-1" style={{ background: p.loss, opacity: 0.85 }} />
      </div>
    </div>
  );
}

export default function ThemePreview() {
  const [, navigate] = useLocation();
  const [chosen, setChosen] = useState<string | null>(null);

  const render = (p: P) => {
    if (p.key === "transcend") return <TranscendSample p={p} />;
    if (p.key === "trademaster") return <TradeSample p={p} />;
    return <CloudSample p={p} />;
  };

  return (
    <div className="min-h-screen p-8" style={{ background: "#050505", color: "#E6EAF2" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">369Labs — Palette Preview</h1>
            <p className="text-slate-400 text-sm mt-1">Pick the direction for the redesign. Chosen: <b className="text-white">{chosen ?? "none"}</b></p>
          </div>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white">← Back</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PALETTES.map((p) => (
            <div key={p.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.tag}</p>
                </div>
                <button
                  onClick={() => setChosen(p.name)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold border"
                  style={{ borderColor: chosen === p.name ? p.accent : "#232A36", color: chosen === p.name ? p.accent : "#8B95A7", background: chosen === p.name ? "rgba(255,255,255,0.06)" : "transparent" }}
                >
                  {chosen === p.name ? "✓ Selected" : "Select"}
                </button>
              </div>
              {render(p)}
            </div>
          ))}
        </div>

        {chosen && (
          <div className="mt-8 p-4 rounded-xl border border-[#232A36] bg-[#151B23] text-center">
            <p className="text-sm text-slate-300">Selected <b className="text-white">{chosen}</b>. Tell me and I'll roll this direction into <code className="text-slate-400">index.css</code> across the whole app.</p>
          </div>
        )}
      </div>
    </div>
  );
}

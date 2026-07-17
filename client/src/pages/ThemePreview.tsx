import { useState } from "react";
import { useLocation } from "wouter";
import { TrendingUp, Bot, Brain, ShieldCheck, Zap } from "lucide-react";

// Candidate palettes provided by the owner for the 369Labs redesign.
const PALETTES: Record<string, any> = {
  cyber: {
    name: "Cyber Professional",
    tag: "Modern, AI-powered, premium",
    bg: "#0B0F14",
    surface: "#151B23",
    secondary: "#1C2430",
    border: "#2A3442",
    text: "#F8FAFC",
    muted: "#94A3B8",
    accent: "#22D3EE",
    accent2: "#8B5CF6",
    profit: "#22C55E",
    loss: "#EF4444",
    warning: "#F59E0B",
  },
  emerald: {
    name: "Emerald Trading",
    tag: "Serious trading desk",
    bg: "#0A0F0D",
    surface: "#141B18",
    secondary: "#1A221E",
    border: "#22302A",
    text: "#F8FAFC",
    muted: "#8AA89A",
    accent: "#00C853",
    accent2: "#00E5FF",
    profit: "#22C55E",
    loss: "#FF5252",
    warning: "#F59E0B",
  },
  blue: {
    name: "Blue Intelligence",
    tag: "Enterprise AI platform",
    bg: "#0D1117",
    surface: "#161B22",
    border: "#30363D",
    secondary: "#1C2430",
    text: "#F8FAFC",
    muted: "#94A3B8",
    accent: "#3B82F6",
    accent2: "#06B6D4",
    profit: "#22C55E",
    loss: "#EF4444",
    warning: "#F59E0B",
  },
  purple: {
    name: "Purple AI",
    tag: "AI-first identity",
    bg: "#0A0912",
    surface: "#15132A",
    border: "#2A2650",
    secondary: "#1E1B3A",
    text: "#F8FAFC",
    muted: "#A39DCB",
    accent: "#8B5CF6",
    accent2: "#22D3EE",
    profit: "#10B981",
    loss: "#F43F5E",
    warning: "#F59E0B",
  },
};

function Sample({ p }: { p: any }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: p.surface, border: `1px solid ${p.border}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: p.accent }}>
          <Bot className="w-4 h-4" />
          <span className="text-sm font-bold" style={{ color: p.text }}>Bots</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: p.accent }}>
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: p.secondary }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>Win rate</p>
          <p className="text-xl font-bold" style={{ color: p.profit }}>68.4%</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: p.secondary }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>P&L</p>
          <p className="text-xl font-bold flex items-center gap-1" style={{ color: p.profit }}>
            <TrendingUp className="w-4 h-4" />+$42.10
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: p.text }}>
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: p.warning }} /> Risk review passed
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: p.muted }}>
          <Brain className="w-3.5 h-3.5" style={{ color: p.accent2 }} /> 369AI suggested this
        </div>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: p.accent, color: p.bg }}>
          <Zap className="w-3.5 h-3.5 inline mr-1" /> Deploy
        </button>
        <button className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: p.secondary, color: p.muted, border: `1px solid ${p.border}` }}>
          Stop
        </button>
      </div>

      <div className="flex gap-1">
        <span className="h-8 flex-1 rounded" style={{ background: p.profit, opacity: 0.8 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.accent, opacity: 0.8 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.accent2, opacity: 0.8 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.warning, opacity: 0.8 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.loss, opacity: 0.8 }} />
      </div>
    </div>
  );
}

export default function ThemePreview() {
  const [, navigate] = useLocation();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="min-h-screen p-8" style={{ background: "#06080B", color: "#E6EAF2" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">369Labs — Palette Preview</h1>
            <p className="text-slate-400 text-sm mt-1">Pick the palette for the redesign. Chosen: <b className="text-white">{chosen ?? "none"}</b></p>
          </div>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white">← Back</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(PALETTES).map(([key, p]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.tag}</p>
                </div>
                <button
                  onClick={() => setChosen(p.name)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold border"
                  style={{
                    borderColor: chosen === p.name ? p.accent : "#232A36",
                    color: chosen === p.name ? p.accent : "#8B95A7",
                    background: chosen === p.name ? "rgba(255,255,255,0.06)" : "transparent",
                  }}
                >
                  {chosen === p.name ? "✓ Selected" : "Select"}
                </button>
              </div>
              <Sample p={p} />
              <div className="flex gap-2 text-[10px] font-mono text-slate-500 flex-wrap">
                <span>bg {p.bg}</span><span>card {p.surface}</span><span>accent {p.accent}</span><span>2nd {p.accent2}</span>
              </div>
            </div>
          ))}
        </div>

        {chosen && (
          <div className="mt-8 p-4 rounded-xl border border-[#232A36] bg-[#151B23] text-center">
            <p className="text-sm text-slate-300">
              Selected <b className="text-white">{chosen}</b>. Tell me and I'll roll this exact palette into{" "}
              <code className="text-slate-400">index.css</code> across the whole app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

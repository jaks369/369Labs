import { useState } from "react";
import { useLocation } from "wouter";
import { TrendingUp, TrendingDown, Bot, Brain, ShieldCheck, Zap } from "lucide-react";

// Candidate palettes for the 369Labs redesign. Each is rendered as real UI
// samples below so the choice is visual, not hex.
const PALETTES: Record<string, any> = {
  electric: {
    name: "Electric Blue",
    tag: "Fintech / trustworthy",
    bg: "#0B0E14",
    surface: "#151A23",
    border: "#232A36",
    text: "#E6EAF2",
    muted: "#8B95A7",
    accent: "#5B8DEF",
    accentSoft: "rgba(91,141,239,0.12)",
    success: "#34D399",
    danger: "#F87171",
    warning: "#FBBF24",
  },
  mint: {
    name: "Mint",
    tag: "Profit / fresh",
    bg: "#0B0E14",
    surface: "#151A23",
    border: "#232A36",
    text: "#E6EAF2",
    muted: "#8B95A7",
    accent: "#6EE7B7",
    accentSoft: "rgba(110,231,183,0.12)",
    success: "#34D399",
    danger: "#F87171",
    warning: "#FBBF24",
  },
  violet: {
    name: "Violet",
    tag: "AI / modern",
    bg: "#0B0E14",
    surface: "#151A23",
    border: "#232A36",
    text: "#E6EAF2",
    muted: "#8B95A7",
    accent: "#A78BFA",
    accentSoft: "rgba(167,139,250,0.12)",
    success: "#34D399",
    danger: "#F87171",
    warning: "#FBBF24",
  },
  amber: {
    name: "Refined Amber",
    tag: "Keep gold, cleaned up",
    bg: "#0D1117",
    surface: "#161B22",
    border: "#30363D",
    text: "#F8FAFC",
    muted: "#8B949E",
    accent: "#F0B90B",
    accentSoft: "rgba(240,185,11,0.12)",
    success: "#10B981",
    danger: "#EF4444",
    warning: "#FBBF24",
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
        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: p.accentSoft, color: p.accent }}>
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: p.bg }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>Win rate</p>
          <p className="text-xl font-bold" style={{ color: p.success }}>68.4%</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: p.bg }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>P&L</p>
          <p className="text-xl font-bold flex items-center gap-1" style={{ color: p.success }}>
            <TrendingUp className="w-4 h-4" />+$42.10
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: p.text }}>
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: p.warning }} /> Risk review passed
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: p.muted }}>
          <Brain className="w-3.5 h-3.5" style={{ color: p.accent }} /> 369AI suggested this
        </div>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: p.accent, color: p.bg }}>
          <Zap className="w-3.5 h-3.5 inline mr-1" /> Deploy
        </button>
        <button className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: p.bg, color: p.muted, border: `1px solid ${p.border}` }}>
          Stop
        </button>
      </div>

      <div className="flex gap-1">
        <span className="h-8 flex-1 rounded" style={{ background: p.success, opacity: 0.7 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.accent, opacity: 0.7 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.warning, opacity: 0.7 }} />
        <span className="h-8 flex-1 rounded" style={{ background: p.danger, opacity: 0.7 }} />
      </div>
    </div>
  );
}

export default function ThemePreview() {
  const [, navigate] = useLocation();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="min-h-screen p-8" style={{ background: "#07090D", color: "#E6EAF2" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">369Labs — Palette Preview</h1>
            <p className="text-slate-400 text-sm mt-1">Pick the accent for the redesign. Chosen: <b className="text-white">{chosen ?? "none"}</b></p>
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
                    background: chosen === p.name ? p.accentSoft : "transparent",
                  }}
                >
                  {chosen === p.name ? "✓ Selected" : "Select"}
                </button>
              </div>
              <Sample p={p} />
              <div className="flex gap-2 text-[10px] font-mono text-slate-500">
                <span>bg {p.bg}</span><span>surface {p.surface}</span><span>accent {p.accent}</span>
              </div>
            </div>
          ))}
        </div>

        {chosen && (
          <div className="mt-8 p-4 rounded-xl border border-[#232A36] bg-[#151A23] text-center">
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

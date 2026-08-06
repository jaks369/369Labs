import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { TrendingUp, Bot, Brain, ShieldCheck, Zap, Server, Save, Download, Upload, X } from "lucide-react";

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

const CUSTOM_THEME_KEY = "369labs-custom-themes";

function getCustomThemes(): P[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CUSTOM_THEME_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomTheme(theme: P) {
  if (typeof window === "undefined") return;
  try {
    const themes = getCustomThemes();
    const existing = themes.findIndex(t => t.key === theme.key);
    if (existing >= 0) themes[existing] = theme;
    else themes.push(theme);
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(themes));
  } catch (e) {
    console.error("Failed to save custom theme", e);
  }
}

function deleteCustomTheme(key: string) {
  if (typeof window === "undefined") return;
  try {
    const themes = getCustomThemes().filter(t => t.key !== key);
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(themes));
  } catch (e) {
    console.error("Failed to delete custom theme", e);
  }
}

// Current Aurora theme from index.css
const AURORA_THEME: P = {
  key: "aurora",
  name: "369Labs Aurora (Current)",
  tag: "AI / Trading / Modern",
  bg: "#0a0e17",
  surface: "#0d1320",
  border: "rgba(255,255,255,0.09)",
  text: "#EDEFF3",
  muted: "#778196",
  accent: "#2dd4bf",      // aurora-teal
  accent2: "#34e0a1",     // aurora-green
  accent3: "#a78bfa",     // aurora-purple
  profit: "#34e0a1",      // green
  loss: "#f43f5e",        // red
  warning: "#fb923c",     // orange
  headingFont: "Inter, system-ui, sans-serif",
  radius: "12px",
  shadow: "0 8px 32px rgba(0,0,0,0.45)",
};

// Three direction-based palettes supplied by the owner, translated into
// concrete renderable samples.
const PALETTES: P[] = [
  AURORA_THEME,
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
    accent3: "#22BFC8",
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
    accent2: "#28A745",
    accent3: "#FB923C",
    profit: "#28A745",
    loss: "#DC3545",
    warning: "#2FD9C4",
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
    accent3: "#28A745",
    profit: "#28A745",
    loss: "#DC3545",
    warning: "#2FD9C4",
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
        Hello folks,
        <br />
        we are 369Labs.
      </h2>
      <p className="text-lg mb-10" style={{ color: p.accent2, fontFamily: p.headingFont, fontStyle: "italic" }}>
        Elegant.
      </p>
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
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ color: p.accent }}>
            <Bot className="w-4 h-4" />
            <span className="text-sm font-bold text-white">Bots</span>
          </div>
          <span className="text-caption font-bold px-2 py-0.5 rounded" style={{ background: "rgba(251,146,60,0.15)", color: p.accent }}>
            LIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3 backdrop-blur" style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            <p className="text-micro" style={{ color: p.muted }}>
              Win rate
            </p>
            <p className="text-xl font-bold" style={{ color: p.profit }}>
              68.4%
            </p>
          </div>
          <div className="rounded-xl p-3 backdrop-blur" style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            <p className="text-micro" style={{ color: p.muted }}>
              P&L
            </p>
            <p className="text-xl font-bold flex items-center gap-1" style={{ color: p.profit }}>
              <TrendingUp className="w-4 h-4" />
              +$42.10
            </p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: p.accent, color: "#0D0D0D" }}>
            <Zap className="w-3.5 h-3.5 inline mr-1" /> Deploy Bot
          </button>
          <button className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: "transparent", color: p.muted, border: `1px solid ${p.border}` }}>
            Stop
          </button>
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
        <Server className="w-4 h-4" />
        <span className="text-sm font-bold text-white">369Labs Infrastructure</span>
      </div>
      <h2 className="text-2xl font-bold" style={{ color: p.text, fontFamily: p.headingFont }}>
        Reliable AI Trading
      </h2>
      <p className="text-sm" style={{ color: p.muted }}>
        Enterprise-grade execution and monitoring.
      </p>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="p-3" style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius }}>
          <p className="text-micro" style={{ color: p.muted }}>
            Uptime
          </p>
          <p className="text-lg font-bold" style={{ color: p.profit }}>
            99.9%
          </p>
        </div>
        <div className="p-3" style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius }}>
          <p className="text-micro" style={{ color: p.muted }}>
            Active bots
          </p>
          <p className="text-lg font-bold text-white">12</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-2 text-sm font-bold text-white" style={{ background: p.accent2, borderRadius: p.radius }}>
          Console
        </button>
        <button className="px-4 py-2 text-sm font-bold" style={{ background: p.accent, color: "#06121F", borderRadius: p.radius }}>
          Deploy
        </button>
        <button
          className="px-4 py-2 text-sm font-bold"
          style={{ background: "transparent", color: p.muted, border: `1px solid ${p.border}`, borderRadius: p.radius }}
        >
          Docs
        </button>
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
  const [customThemes, setCustomThemes] = useState<P[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderForm, setBuilderForm] = useState<Partial<P>>({
    key: "",
    name: "",
    tag: "",
    bg: "#0a0e17",
    surface: "#0d1320",
    border: "rgba(255,255,255,0.09)",
    text: "#EDEFF3",
    muted: "#778196",
    accent: "#2dd4bf",
    accent2: "#34e0a1",
    accent3: "#a78bfa",
    profit: "#34e0a1",
    loss: "#f43f5e",
    warning: "#fb923c",
    headingFont: "Inter, system-ui, sans-serif",
    radius: "12px",
    shadow: "0 8px 32px rgba(0,0,0,0.45)",
  });

  useEffect(() => {
    setCustomThemes(getCustomThemes());
  }, []);

  const handleSaveCustom = () => {
    if (!builderForm.key || !builderForm.name) {
      alert("Key and name are required");
      return;
    }
    const theme = builderForm as P;
    saveCustomTheme(theme);
    setCustomThemes(getCustomThemes());
    setShowBuilder(false);
    setBuilderForm({
      key: "",
      name: "",
      tag: "",
      bg: "#0a0e17",
      surface: "#0d1320",
      border: "rgba(255,255,255,0.09)",
      text: "#EDEFF3",
      muted: "#778196",
      accent: "#2dd4bf",
      accent2: "#34e0a1",
      accent3: "#a78bfa",
      profit: "#34e0a1",
      loss: "#f43f5e",
      warning: "#fb923c",
      headingFont: "Inter, system-ui, sans-serif",
      radius: "12px",
      shadow: "0 8px 32px rgba(0,0,0,0.45)",
    });
  };

  const handleDeleteCustom = (key: string) => {
    if (confirm("Delete this custom theme?")) {
      deleteCustomTheme(key);
      setCustomThemes(getCustomThemes());
    }
  };

  const allThemes = [AURORA_THEME, ...PALETTES.filter(p => p.key !== "aurora"), ...customThemes];

  const render = (p: P) => {
    if (p.key === "transcend") return <TranscendSample p={p} />;
    if (p.key === "trademaster") return <TradeSample p={p} />;
    if (p.key === "cloud83") return <CloudSample p={p} />;
    if (p.key === "aurora") return <TranscendSample p={p} />;
    return <TranscendSample p={p} />;
  };

  return (
    <div className="min-h-screen p-8" style={{ background: "#050505", color: "#E6EAF2" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">369Labs — Palette Preview</h1>
            <p className="text-slate-400 text-sm mt-1">
              Pick the direction for the redesign. Chosen: <b className="text-white">{chosen ?? "none"}</b>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBuilder(!showBuilder)} className="text-sm px-3 py-1.5 rounded-lg font-bold border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors">
              <Save className="w-3.5 h-3.5 mr-1" /> New Custom Theme
            </button>
            <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white">
              ← Back
            </button>
          </div>
        </div>

        {showBuilder && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => setShowBuilder(false)}>
            <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[90vh] overflow-y-auto animate-modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">Create Custom Theme</h3>
                <button onClick={() => setShowBuilder(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
              </div>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Key (unique)</label>
                    <input value={builderForm.key} onChange={e => setBuilderForm({...builderForm, key: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="my-theme" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Name</label>
                    <input value={builderForm.name} onChange={e => setBuilderForm({...builderForm, name: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="My Custom Theme" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Tag</label>
                    <input value={builderForm.tag} onChange={e => setBuilderForm({...builderForm, tag: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="Custom Theme" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Heading Font</label>
                    <input value={builderForm.headingFont} onChange={e => setBuilderForm({...builderForm, headingFont: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="Inter, system-ui, sans-serif" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Radius</label>
                    <input value={builderForm.radius} onChange={e => setBuilderForm({...builderForm, radius: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="12px" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Shadow</label>
                    <input value={builderForm.shadow} onChange={e => setBuilderForm({...builderForm, shadow: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="0 8px 32px rgba(0,0,0,0.45)" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border)]">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Background</label>
                    <input value={builderForm.bg} onChange={e => setBuilderForm({...builderForm, bg: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Surface</label>
                    <input value={builderForm.surface} onChange={e => setBuilderForm({...builderForm, surface: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Border</label>
                    <input value={builderForm.border} onChange={e => setBuilderForm({...builderForm, border: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Text</label>
                    <input value={builderForm.text} onChange={e => setBuilderForm({...builderForm, text: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Muted</label>
                    <input value={builderForm.muted} onChange={e => setBuilderForm({...builderForm, muted: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Accent</label>
                    <input value={builderForm.accent} onChange={e => setBuilderForm({...builderForm, accent: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Accent 2</label>
                    <input value={builderForm.accent2} onChange={e => setBuilderForm({...builderForm, accent2: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Accent 3</label>
                    <input value={builderForm.accent3} onChange={e => setBuilderForm({...builderForm, accent3: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Profit</label>
                    <input value={builderForm.profit} onChange={e => setBuilderForm({...builderForm, profit: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Loss</label>
                    <input value={builderForm.loss} onChange={e => setBuilderForm({...builderForm, loss: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Warning</label>
                    <input value={builderForm.warning} onChange={e => setBuilderForm({...builderForm, warning: e.target.value})} type="color" className="w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Shadow</label>
                    <input value={builderForm.shadow} onChange={e => setBuilderForm({...builderForm, shadow: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="0 8px 32px rgba(0,0,0,0.45)" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">Radius</label>
                    <input value={builderForm.radius} onChange={e => setBuilderForm({...builderForm, radius: e.target.value})} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]" placeholder="12px" />
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
                  <button onClick={handleSaveCustom} className="flex-1 bg-[var(--accent)] text-black font-bold py-2 rounded-lg hover:brightness-110">
                    <Save className="w-4 h-4 inline mr-1" /> Save Theme
                  </button>
                  <button onClick={() => setShowBuilder(false)} className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {allThemes.map((p) => (
            <div key={p.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.tag}</p>
                  {p.key !== "aurora" && p.key !== "transcend" && p.key !== "trademaster" && p.key !== "cloud83" && (
                    <button onClick={() => handleDeleteCustom(p.key)} className="text-xs text-[var(--red)] hover:underline ml-2">Delete</button>
                  )}
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
              {render(p)}
            </div>
          ))}
        </div>

        {chosen && (
          <div className="mt-8 p-4 rounded-xl border border-[#232A36] bg-[#151B23] text-center">
            <p className="text-sm text-slate-300">
              Selected <b className="text-white">{chosen}</b>. Tell me and I'll roll this direction into <code className="text-slate-400">index.css</code>{" "}
              across the whole app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Sparkles, Activity, Bot, BarChart3, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { toast } from "@/components/Toast";

const STEPS = [
  { icon: Sparkles, title: "Welcome to 369Labs", description: "AI-powered trading automation platform. Let's get you set up in under 2 minutes." },
  { icon: Activity, title: "Connect to Markets", description: "Add your Deriv API token from Settings to connect to live markets. You can also start with paper trading." },
  { icon: Bot, title: "Build Your First Strategy", description: "Use the visual Strategy Builder or describe your idea to 369AI and let it create the rules." },
  { icon: BarChart3, title: "Test & Deploy", description: "Backtest against historical data, then deploy as a cloud bot that runs 24/7." },
];

export default function Onboarding() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const complete = () => {
    localStorage.setItem("369labs_onboarding", "done");
    toast("Setup complete!", "success");
    navigate("/dashboard");
  };

  const skip = () => {
    localStorage.setItem("369labs_onboarding", "done");
    navigate("/dashboard");
  };

  const s = STEPS[step];
  const Icon = s.icon;

  return (
    <div className="min-h-screen bg-[var(--card)] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex gap-1.5 mb-12 justify-center">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 w-12 rounded-full transition-all ${i <= step ? "bg-[var(--amber)]" : "bg-[var(--border)]"}`} />
          ))}
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 md:p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center">
            <Icon className="w-8 h-8 text-[var(--amber)]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">{s.title}</h1>
          <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">{s.description}</p>
          <div className="flex gap-3 justify-center">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-white text-sm font-bold hover:bg-white/5">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button onClick={step < STEPS.length - 1 ? () => setStep(step + 1) : complete} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--amber)] text-black text-sm font-bold hover:bg-[var(--amber)]/90">
              {step < STEPS.length - 1 ? (<>Next <ChevronRight className="w-4 h-4" /></>) : (<><Check className="w-4 h-4" /> Get Started</>)}
            </button>
          </div>
        </div>
        <button onClick={skip} className="mt-6 text-xs text-[var(--text-muted)] hover:text-white mx-auto block">Skip onboarding</button>
      </div>
    </div>
  );
}

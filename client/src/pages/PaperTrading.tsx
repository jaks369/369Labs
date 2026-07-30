import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, BarChart3, Shield, Zap } from "lucide-react";

export default function PaperTrading() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  if (!isAuthenticated) { navigate("/login"); return null; }
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto text-center space-y-8 pt-20">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="w-8 h-8 text-[var(--accent)]" />
          <h1 className="text-3xl font-bold text-white">Paper Trading</h1>
        </div>
        <p className="text-[var(--text-secondary)] text-sm max-w-lg mx-auto">Practice trading risk-free with virtual funds. Paper trading is integrated directly into the Dashboard — deploy bots in paper mode and track performance in real-time.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <BarChart3 className="w-6 h-6 text-[var(--accent)] mx-auto mb-2" />
            <p className="text-sm font-bold text-white">Dashboard</p>
            <p className="text-caption">Monitor paper trades live</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <Shield className="w-6 h-6 text-[var(--green)] mx-auto mb-2" />
            <p className="text-sm font-bold text-white">No Risk</p>
            <p className="text-caption">Virtual funds only</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <Zap className="w-6 h-6 text-[var(--accent)] mx-auto mb-2" />
            <p className="text-sm font-bold text-white">Real Market</p>
            <p className="text-caption">Live data from Deriv</p>
          </div>
        </div>
        <Button onClick={() => navigate("/dashboard")} className="bg-[var(--accent)] text-black font-bold px-8 py-3 rounded-xl text-sm">
          Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Zap, TrendingUp, Brain, Shield, Globe, BarChart3, ChevronRight, Activity } from "lucide-react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-[#F8FAFC] selection:bg-[#D98B1F]/30">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[#D98B1F]/10 blur-[120px] rounded-full opacity-50" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 border-b border-white/5 backdrop-blur-xl bg-black/20 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-8 h-8 bg-[#D98B1F] rounded-lg flex items-center justify-center shadow-lg shadow-[#D98B1F]/20 group-hover:scale-110 transition-transform">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">369Labs</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
              <a href="#" className="hover:text-white transition-colors">Features</a>
              <a href="#" className="hover:text-white transition-colors">Marketplace</a>
              <a href="#" className="hover:text-white transition-colors">Pricing</a>
              <a href="#" className="hover:text-white transition-colors">Documentation</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href={getLoginUrl()} className="text-sm font-medium hover:text-white transition-colors px-4">Login</a>
            <a href={getLoginUrl()} className="btn-primary flex items-center gap-2">
              Get Started <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-32 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D98B1F]/10 border border-[#E89A2A]/20 text-[#E89A2A] text-xs font-bold tracking-wider mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E89A2A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D98B1F]"></span>
            </span>
            V1.0 NOW LIVE
          </div>
          <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-8 tracking-tighter leading-[1.1]">
            Build. Backtest.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E89A2A] to-emerald-400">Automate.</span>
          </h1>
          <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Professional trading automation powered by AI. Design sophisticated strategies, 
            test against historical data, and deploy to the cloud in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href={getLoginUrl()} className="btn-primary text-lg px-10 py-4 w-full sm:w-auto">
              Get Started
            </a>
            <button className="btn-outline text-lg px-10 py-4 w-full sm:w-auto">
              Live Demo
            </button>
          </div>

          {/* Hero Visual */}
          <div className="mt-24 relative max-w-5xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#D98B1F] to-emerald-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="h-8 bg-slate-800/50 border-b border-white/5 flex items-center px-4 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              </div>
              <div className="aspect-video bg-[#0D0D0D] p-8 flex items-center justify-center">
                 <div className="w-full h-full border border-[#E89A2A]/20 rounded-lg relative overflow-hidden bg-slate-950">
                    {/* Mock Chart Effect */}
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(37, 99, 235, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(37, 99, 235, 0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#E89A2A]/10 to-transparent" />
                    <div className="absolute top-1/4 left-0 right-0 h-px bg-emerald-500/30" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-red-500/30" />
                    <div className="flex items-center justify-center h-full">
                       <Activity className="w-16 h-16 text-[#E89A2A] animate-pulse" />
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-7xl mx-auto px-6 py-32">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4">ENGINEERED FOR PERFORMANCE</h2>
            <p className="text-slate-400">Everything you need to scale your trading operations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card group hover:border-[#E89A2A]/50 transition-colors">
              <div className="w-12 h-12 bg-[#D98B1F]/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Brain className="w-6 h-6 text-[#E89A2A]" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">369AI Assistant</h3>
              <p className="text-slate-400 leading-relaxed">
                Describe your strategy in plain English and let our AI engine generate the logic, 
                risk parameters, and execution blocks automatically.
              </p>
            </div>
            <div className="glass-card group hover:border-emerald-500/50 transition-colors">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Advanced Analytics</h3>
              <p className="text-slate-400 leading-relaxed">
                Monitor ROI, Drawdown, and Profit Factor in real-time. Gain deep insights into 
                your bot's performance with professional-grade metrics.
              </p>
            </div>
            <div className="glass-card group hover:border-[#E89A2A]/50 transition-colors">
              <div className="w-12 h-12 bg-[#D98B1F]/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Globe className="w-6 h-6 text-[#E89A2A]" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Cloud Execution</h3>
              <p className="text-slate-400 leading-relaxed">
                Deploy your bots to our secure cloud infrastructure. Your strategies run 24/7 
                without needing your computer to stay online.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-7xl mx-auto px-6 py-32">
          <div className="bg-gradient-to-br from-[#D98B1F] to-[#A86A12] rounded-3xl p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 relative z-10">READY TO AUTOMATE YOUR SUCCESS?</h2>
            <p className="text-[#2A2012] text-lg mb-10 max-w-2xl mx-auto relative z-10">
              Join the next generation of algorithmic traders. Start building your first strategy today.
            </p>
            <a href={getLoginUrl()} className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#D98B1F] font-bold rounded-xl hover:bg-[#1A140A] transition-colors relative z-10">
              Launch Dashboard <ChevronRight className="w-5 h-5" />
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-[#D98B1F]" />
              <span className="text-lg font-bold text-white">369Labs</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
              <a href="#" className="hover:text-white">Contact</a>
            </div>
            <p className="text-sm text-slate-500">&copy; 2026 369Labs. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

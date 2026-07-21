import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

export default function TradingCopilot() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  if (!isAuthenticated) { navigate("/login"); return null; }
  return (
    <div className="min-h-screen bg-[#151B23] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white">Trading Copilot</h1>
        <p className="text-[#94A3B8] text-sm mt-1">AI trading copilot coming soon.</p>
      </div>
    </div>
  );
}

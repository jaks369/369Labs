import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

export default function AIExplainability() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  if (!isAuthenticated) { navigate("/login"); return null; }
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white">AI Explainability</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">AI explainability dashboard coming soon.</p>
      </div>
    </div>
  );
}

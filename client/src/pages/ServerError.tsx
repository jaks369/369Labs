import { useLocation } from "wouter";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function ServerError() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-[var(--card)] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--red-soft)] border border-[var(--red)]/30 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-[var(--red)]" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">500</h1>
        <p className="text-[var(--text-secondary)] mb-2">Something went wrong on our end.</p>
        <p className="text-sm text-[var(--text-muted)] mb-8">The server encountered an internal error. Try refreshing the page.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--amber)] text-black text-sm font-bold hover:bg-[var(--amber)]/90">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-white text-sm font-bold hover:bg-white/5">
            <Home className="w-4 h-4" /> Home
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Star, ArrowRight } from "lucide-react";
import WatchlistPanel from "@/components/WatchlistPanel";

export default function Watchlist() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>(undefined);

  if (!isAuthenticated) { navigate("/login"); return null; }

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-[var(--accent)]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Watchlist</h1>
              <p className="text-xs text-[var(--text-muted)]">Monitor your favorite symbols in real time</p>
            </div>
          </div>
          <button
            onClick={() => selectedSymbol && navigate("/dashboard")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 text-xs font-bold hover:bg-[var(--accent)]/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!selectedSymbol}
          >
            Open in Terminal <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <WatchlistPanel selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} header={false} />
      </div>
    </div>
  );
}

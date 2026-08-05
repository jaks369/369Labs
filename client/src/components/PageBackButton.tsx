import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PageBackButton({ fallback = "/dashboard", label = "Back" }: { fallback?: string; label?: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(fallback)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-[var(--border)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-white hover:border-[rgba(255,255,255,0.15)] transition-colors cursor-pointer shrink-0"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}

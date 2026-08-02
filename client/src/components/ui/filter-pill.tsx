import { cn } from "@/lib/utils";

interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
  title?: string;
}

export function FilterPill({ active, onClick, label, className, title }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-3 py-1.5 text-caption font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0",
        active
          ? "bg-[var(--accent)] text-black"
          : "bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white",
        className,
      )}
    >
      {label}
    </button>
  );
}

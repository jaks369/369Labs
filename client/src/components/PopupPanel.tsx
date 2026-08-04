import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface PopupPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}

export default function PopupPanel({ open, onClose, title, icon, children, width = "360px" }: PopupPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ top: "48px", right: "320px" }}>
      <div className="animate-modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative animate-slideInRight aurora-glass rounded-xl shadow-2xl overflow-hidden"
        style={{ width, maxHeight: "calc(100vh - 80px)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(139,92,246,0.12)]">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-bold text-white">{title}</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

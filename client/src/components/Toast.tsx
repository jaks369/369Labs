import { useEffect } from "react";

export type ToastKind = "success" | "error" | "info";

let listeners: ((t: { id: number; kind: ToastKind; text: string }) => void)[] = [];
let nextId = 1;

export function toast(text: string, kind: ToastKind = "info") {
  const t = { id: nextId++, kind, text };
  listeners.forEach((l) => l(t));
}

export function useToast(onToast: (t: { id: number; kind: ToastKind; text: string }) => void) {
  useEffect(() => {
    listeners.push(onToast);
    return () => { listeners = listeners.filter((l) => l !== onToast); };
  }, [onToast]);
}

export function ToastViewport({ items, onDismiss }: {
  items: { id: number; kind: ToastKind; text: string }[];
  onDismiss: (id: number) => void;
}) {
  const color: Record<ToastKind, string> = {
    success: "border-[#22C55E]/40 text-[#22C55E]",
    error: "border-[#EF4444]/40 text-[#EF4444]",
    info: "border-[#22D3EE]/40 text-[#22D3EE]",
  };
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`cursor-pointer bg-[#151B23] border ${color[t.kind]} rounded-lg px-4 py-3 text-sm font-medium shadow-lg shadow-black/40 animate-[fadeIn_0.2s_ease] ${t.kind === "success" ? "text-[#22C55E]" : t.kind === "error" ? "text-[#EF4444]" : "text-[#22D3EE]"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

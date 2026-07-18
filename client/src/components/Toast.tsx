import { useEffect, useState, useCallback } from "react";

export type ToastKind = "success" | "error" | "info" | "warning" | "loading";

let listeners: ((t: { id: number; kind: ToastKind; text: string }) => void)[] = [];
let nextId = 1;

export function toast(text: string, kind: ToastKind = "info", _options?: { duration?: number; onDismiss?: () => void }) {
  const id = nextId++;
  const t = { id, kind, text };
  listeners.forEach((l) => l(t));
  return id;
}

export function useToast(onToast: (t: { id: number; kind: ToastKind; text: string }) => void, deps?: any[]) {
  useEffect(() => {
    listeners.push(onToast);
    return () => { listeners = listeners.filter((l) => l !== onToast); };
  }, deps || []);
}

export function ToastViewport({ items, onDismiss }: {
  items: { id: number; kind: ToastKind; text: string }[];
  onDismiss: (id: number) => void;
}) {
  const color: Record<ToastKind, string> = {
    success: "border-[#22C55E]/40 text-[#22C55E]",
    error: "border-[#EF4444]/40 text-[#EF4444]",
    info: "border-[#22D3EE]/40 text-[#22D3EE]",
    warning: "border-[#F59E0B]/40 text-[#F59E0B]",
    loading: "border-[#64748B]/40 text-[#64748B]",
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={cursor-pointer bg-[#151B23] border  rounded-lg px-4 py-3 text-sm font-medium shadow-lg shadow-black/40 animate-[fadeIn_0.2s_ease] flex items-center gap-2}
        >
          <span className="text-lg font-bold">{t.kind === "success" ? "?" : t.kind === "error" ? "?" : t.kind === "info" ? "?" : t.kind === "warning" ? "?" : "?"}</span>
          <span className="flex-1">{t.text}</span>
          <button onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }} className="ml-2 text-[#64748B] hover:text-white">?</button>
        </div>
      ))}
    </div>
  );
}

export { toast };
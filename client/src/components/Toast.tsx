import { useEffect } from "react";

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
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`cursor-pointer bg-[var(--card)] border ${t.kind === "success" ? "border-green-500/50" : t.kind === "error" ? "border-red-500/50" : t.kind === "info" ? "border-blue-500/50" : t.kind === "warning" ? "border-yellow-500/50" : "border-[var(--border)]"} rounded-lg px-4 py-3 text-sm font-medium shadow-lg shadow-black/40 animate-[fadeIn_0.2s_ease] flex items-center gap-2`}
        >
          <span className="text-lg font-bold">{t.kind === "success" ? "\u2713" : t.kind === "error" ? "\u2717" : t.kind === "info" ? "\u2139" : t.kind === "warning" ? "\u26A0" : "\u2022"}</span>
          <span className="flex-1">{t.text}</span>
          <button onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }} className="ml-2 text-[var(--text-muted)] hover:text-white">{"\u2716"}</button>
        </div>
      ))}
    </div>
  );
}
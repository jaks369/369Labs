import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

/**
 * Global "server having trouble" surface.
 *
 * Previously a backend outage rendered as a mosaic of independently-failing
 * widgets with errors only in the console — no coordinated signal, no retry.
 * This watches the query cache: several distinct queries erroring inside a
 * short window means the problem is server-side, not one endpoint, and gets
 * one calm banner with a manual retry. Auto-hides once queries succeed again
 * (any success clears the window).
 */

const WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;

export default function ServerStatusBanner() {
  const queryClient = useQueryClient();
  const failureTimes = useRef<number[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const query = event.query;
      const state = query.state;
      const now = Date.now();
      if (state.status === "error" && event.type === "updated") {
        // Only count failures from network/server class queries (skip disabled/one-offs noise by requiring fetchFailureCount or data presence irrelevant).
        failureTimes.current.push(now);
        failureTimes.current = failureTimes.current.filter((t) => now - t < WINDOW_MS);
        if (failureTimes.current.length >= FAILURE_THRESHOLD) setVisible(true);
      } else if (state.status === "success" && event.type === "updated") {
        // Any success means connectivity is back.
        failureTimes.current = [];
        setVisible(false);
      }
    });
    return unsub;
  }, [queryClient]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-[var(--amber)]/15 border-b border-[var(--amber)]/50 px-4 py-2 flex items-center justify-center gap-3">
      <AlertTriangle className="w-4 h-4 text-[var(--amber)] shrink-0" />
      <p className="text-xs font-semibold text-white">Connection problems detected — some data may be stale.</p>
      <button
        onClick={() => {
          failureTimes.current = [];
          void queryClient.invalidateQueries();
        }}
        className="flex items-center gap-1 text-[11px] font-bold text-[var(--amber)] hover:underline"
      >
        <RefreshCw className="w-3 h-3" /> Retry all
      </button>
      <button onClick={() => setVisible(false)} aria-label="Dismiss" className="text-[var(--text-muted)] hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

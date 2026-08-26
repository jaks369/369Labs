/**
 * Cross-tab coherence via BroadcastChannel.
 *
 * Previously: trade intents and Deriv-token changes were invisible to other
 * tabs — a prefill landed only in the tab that created it, and logging out in
 * one tab left others trading on a dead token. This module gives every tab a
 * tiny pub/sub channel; senders fire-and-forget, listeners decide.
 *
 * Falls back to no-op on browsers without BroadcastChannel (feature is
 * progressive enhancement; the app already works single-tab).
 */

const CHANNEL_NAME = "369labs.sync";
export type TabMessageType = "trade-intent" | "deriv-token-changed" | "session-ended";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

/** Fire-and-forget. Never throws. */
export function broadcastTabMessage(type: TabMessageType, payload?: unknown): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type, payload, ts: Date.now() });
  } catch {
    /* payload not structured-cloneable — callers pass plain data */
  }
}

/** Subscribe. Returns unsubscribe. Handler errors are contained. */
export function onTabMessage(handler: (type: TabMessageType, payload: unknown) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (ev: MessageEvent) => {
    try {
      const data = ev.data as { type?: TabMessageType; payload?: unknown } | null;
      if (data?.type) handler(data.type, data.payload);
    } catch {
      /* malformed message from another tab — ignore */
    }
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

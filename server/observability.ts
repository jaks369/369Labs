// Structured, correlation-id aware event logging for the trading engine and
// background jobs. Replaces ad-hoc console.log so logs are greppable and
// machine-readable. Events flow to the console (JSON) and, on the client, to the
// AITimeline bus.

export type EngineEvent =
  | "BOT_STARTED"
  | "BOT_STOPPED"
  | "TICK_RECEIVED"
  | "SIGNAL_DETECTED"
  | "ORDER_CREATED"
  | "ORDER_FILLED"
  | "ORDER_FAILED"
  | "ORDER_SETTLED"
  | "RISK_LIMIT_TRIGGERED"
  | "SCAN_CYCLE"
  | "AI_REQUEST";

export function corrId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function logEvent(
  event: EngineEvent,
  meta: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info"
) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(`[engine] ${line}`);
  else if (level === "warn") console.warn(`[engine] ${line}`);
  else console.log(`[engine] ${line}`);
  return entry;
}

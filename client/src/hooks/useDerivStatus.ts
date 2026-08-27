import { useEffect, useState } from "react";
import { derivWS, TickStreamListener } from "@/services/derivWebSocket";

export type DerivStatus = "connected" | "disconnected" | "needs_token" | "reconnecting";

/**
 * Live Deriv connection status derived from the actual WebSocket:
 *  - "connected":    socket open AND authorized AND the price feed is flowing
 *  - "reconnecting": authorized but the price feed is down/stale (recovering)
 *  - "needs_token":  not authorized (no token, or token rejected)
 *  - "disconnected": socket not open
 * Updates in real time as the connection / authorization / feed state changes.
 */
export function useDerivStatus(): { status: DerivStatus; accountType: string } {
  const compute = (): DerivStatus => {
    if (!derivWS.isConnected()) return "disconnected";
    if (!derivWS.isAuthorized()) return "needs_token";
    const feed = derivWS.getFeedHealth();
    if (!feed.alive) return "reconnecting";
    return "connected";
  };
  const [status, setStatus] = useState<DerivStatus>(compute);
  const [accountType, setAccountType] = useState<string>(derivWS.getAccountType());

  useEffect(() => {
    const update = () => {
      setStatus(compute());
      setAccountType(derivWS.getAccountType());
    };
    const listener: TickStreamListener = {
      onTick: update,
      onConnect: update,
      onDisconnect: update,
    };
    derivWS.addListener(listener);
    const unsub = derivWS.onTokenError(update);
    update();
    // Poll feed-health periodically so a stall between ticks is detected even
    // without a connect/disconnect event.
    const interval = setInterval(update, 2000);
    return () => {
      derivWS.removeListener(listener);
      clearInterval(interval);
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return { status, accountType };
}
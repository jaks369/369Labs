import { useEffect, useState } from "react";
import { derivWS } from "@/services/derivWebSocket";

export type DerivStatus = "connected" | "disconnected" | "needs_token";

/**
 * Live Deriv connection status derived from the actual WebSocket:
 *  - "connected":    socket open AND authorized with a valid API token
 *  - "needs_token":  not authorized (no token, or token rejected)
 *  - "disconnected": socket not open
 * Updates in real time as the connection / authorization state changes.
 */
export function useDerivStatus(): { status: DerivStatus; accountType: string } {
  const compute = (): DerivStatus => {
    if (!derivWS.isConnected()) return "disconnected";
    if (!derivWS.isAuthorized()) return "needs_token";
    return "connected";
  };
  const [status, setStatus] = useState<DerivStatus>(compute);
  const [accountType, setAccountType] = useState<string>(derivWS.getAccountType());

  useEffect(() => {
    const update = () => {
      setStatus(compute());
      setAccountType(derivWS.getAccountType());
    };
    const listener = {
      onConnect: update,
      onDisconnect: update,
    };
    derivWS.addListener(listener);
    const unsub = derivWS.onTokenError(update);
    update();
    return () => {
      derivWS.removeListener(listener);
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return { status, accountType };
}
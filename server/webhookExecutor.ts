import * as db from "./db";
import dns from "dns";
import { URL } from "url";
import net from "net";

function isPrivateIP(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
    // IPv4-mapped IPv6
    if (normalized.startsWith("::ffff:")) return isPrivateIP(normalized.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  if (parts[0] === 127) return true;                              // loopback
  if (parts[0] === 10) return true;                               // 10.0.0.0/8
  if (parts[0] === 169 && parts[1] === 254) return true;          // 169.254.0.0/16 (link-local / metadata)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true;          // 192.168.0.0/16
  if (parts[0] === 0) return true;                                // 0.0.0.0/8
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (parts[0] === 198 && parts[1] === 18) return true;           // 198.18.0.0/15 (benchmarking)
  return false;
}

async function isSafeURL(urlStr: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const hostname = parsed.hostname.toLowerCase();
  // reject hostnames that look like internal names
  if (hostname === "localhost" || hostname === "localhost.localdomain" || hostname.endsWith(".local")) return false;
  // reject raw IPs that are private
  if (net.isIP(hostname)) return !isPrivateIP(hostname);
  // resolve DNS and check all addresses
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.some(addr => isPrivateIP(addr))) return false;
    const v6addrs = await dns.promises.resolve6(hostname).catch(() => []);
    if (v6addrs.some(addr => isPrivateIP(addr))) return false;
  } catch {
    return false; // DNS resolution failed — don't fire
  }
  return true;
}

export async function fireWebhookEvent(
  userId: number,
  event: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    const webhooks = await db.getActiveWebhooksForEvent(userId, event);
    if (webhooks.length === 0) return;

    const body = JSON.stringify({ event, data: payload, timestamp: Date.now() });

    for (const wh of webhooks) {
      if (!(await isSafeURL(wh.url))) continue;
      fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {
        /* webhook fire is best-effort */
      });
    }
  } catch {
    /* webhook fire is non-critical */
  }
}

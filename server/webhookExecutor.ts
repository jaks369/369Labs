import * as db from "./db";
import dns from "dns";
import { URL } from "url";
import net from "net";

function isPrivateIP(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) return isPrivateIP(normalized.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 198 && parts[1] === 18) return true;
  return false;
}

interface SafeURLResult {
  safe: boolean;
  hostname: string;
  resolvedIPs: string[];
  protocol: string;
  path: string;
}

async function checkSafeURL(urlStr: string): Promise<SafeURLResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "localhost.localdomain" || hostname.endsWith(".local")) return null;
  if (net.isIP(hostname)) {
    return isPrivateIP(hostname) ? null : { safe: true, hostname, resolvedIPs: [hostname], protocol: parsed.protocol, path: parsed.pathname + parsed.search };
  }
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.some(addr => isPrivateIP(addr))) return null;
    const v6addrs = await dns.promises.resolve6(hostname).catch(() => []);
    if (v6addrs.some(addr => isPrivateIP(addr))) return null;
    const allIPs = [...addresses, ...v6addrs];
    return { safe: true, hostname, resolvedIPs: allIPs, protocol: parsed.protocol, path: parsed.pathname + parsed.search };
  } catch {
    return null;
  }
}

// Retry with exponential backoff using resolved IP
async function fetchWithRetry(urlStr: string, options: RequestInit, maxRetries = 3, baseDelay = 1000): Promise<Response> {
  const check = await checkSafeURL(urlStr);
  if (!check) throw new Error("URL failed safety check");
  
  // Use first resolved IP, set Host header to original hostname for TLS SNI
  const targetIP = check.resolvedIPs[0];
  const isHttps = check.protocol === "https:";
  const targetURL = `${check.protocol}//${targetIP}${check.path}`;
  
  const headers = { ...options.headers, Host: check.hostname } as Record<string, string>;
  
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(targetURL, { 
        ...options, 
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
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
      try {
        await fetchWithRetry(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }, 3, 1000);
      } catch (e: any) {
        console.warn(`[webhookExecutor] Webhook delivery failed for user ${userId}, event ${event}, url ${wh.url}:`, e?.message || e);
      }
    }
  } catch (e: any) {
    console.warn(`[webhookExecutor] Unexpected error firing webhooks for user ${userId}, event ${event}:`, e?.message || e);
  }
}

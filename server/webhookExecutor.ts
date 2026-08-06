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

async function isSafeURL(urlStr: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "localhost.localdomain" || hostname.endsWith(".local")) return false;
  if (net.isIP(hostname)) return !isPrivateIP(hostname);
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.some(addr => isPrivateIP(addr))) return false;
    const v6addrs = await dns.promises.resolve6(hostname).catch(() => []);
    if (v6addrs.some(addr => isPrivateIP(addr))) return false;
  } catch {
    return false;
  }
  return true;
}

// Retry with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, baseDelay = 1000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      
      // Retry on 5xx errors
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
      if (!(await isSafeURL(wh.url))) continue;
      fetchWithRetry(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }, 3, 1000).catch(() => {
        /* webhook fire is best-effort even after retries */
      });
    }
  } catch {
    /* webhook fire is non-critical */
  }
}

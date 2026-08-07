import * as db from "./db";
import dns from "dns";
import { URL } from "url";
import net from "net";
import { createHmac } from "crypto";

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

// Fetch that refuses redirects to internal/private targets. undici's fetch
// follows redirects by default, so a malicious webhook endpoint could 302 the
// server to 169.254.169.254 (cloud metadata) or internal hosts. We follow up to
// MAX_REDIRECTS hops manually and re-run the private-IP check on every Location.
const MAX_REDIRECTS = 3;

async function safeFetch(urlStr: string, options: RequestInit): Promise<Response> {
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await checkSafeURL(current);
    if (!check) throw new Error("URL failed safety check");

    const targetIP = check.resolvedIPs[0];
    const targetURL = `${check.protocol}//${targetIP}${check.path}`;
    const headers = { ...options.headers, Host: check.hostname } as Record<string, string>;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(targetURL, { ...options, signal: controller.signal, headers, redirect: "manual" });
    } finally {
      clearTimeout(timeout);
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) throw new Error(`Redirect without Location (HTTP ${status})`);
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects");
}

// Retry with exponential backoff using resolved IP
async function fetchWithRetry(urlStr: string, options: RequestInit, maxRetries = 3, baseDelay = 1000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await safeFetch(urlStr, options);
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

const MAX_DELIVERY_ATTEMPTS = 5;

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
      // Create delivery record
      const delivery = await db.createWebhookDelivery({
        webhookId: wh.id,
        userId,
        event,
        payload,
        status: "pending",
        attempts: 0,
      });

      await attemptDelivery(delivery.id, wh.url, body, wh.secret);
    }
  } catch (e: any) {
    console.warn(`[webhookExecutor] Unexpected error firing webhooks for user ${userId}, event ${event}:`, e?.message || e);
  }
}

async function attemptDelivery(deliveryId: number, url: string, body: string, secret?: string | null): Promise<void> {
  const maxAttempts = 5;
  
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // Update attempt count
      await db.updateWebhookDelivery(deliveryId, { attempts: attempt });

      const headers = { "Content-Type": "application/json" } as Record<string, string>;

      // HMAC-SHA256 signature over the exact body bytes. Recipients verify with
      // the per-webhook secret shown once at creation; unsigned (legacy) hooks
      // without a secret are sent without a signature header.
      if (secret) {
        const signature = createHmac("sha256", secret).update(body).digest("hex");
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
      }

      const response = await safeFetch(url, {
        method: "POST",
        headers,
        body,
      });

      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Success!
      await db.updateWebhookDelivery(deliveryId, {
        status: "delivered",
        deliveredAt: new Date(),
      });
      return;

    } catch (e: any) {
      console.warn(`[webhookExecutor] Delivery attempt ${attempt} failed for ${url}:`, e?.message || e);

      if (attempt < 5) {
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Max attempts reached - mark as dead
      await db.updateWebhookDelivery(deliveryId, {
        status: "dead",
        lastError: e?.message || String(e),
      });
    }
  }
}

export async function retryDeadWebhooks(): Promise<number> {
  const dead = await db.getDeadWebhookDeliveries(100);
  let retried = 0;
  for (const d of dead) {
    await db.updateWebhookDelivery(d.id, { status: "pending", attempts: 0, lastError: null, nextRetryAt: null });
    retried++;
  }
  return retried;
}

export async function processPendingWebhooks(): Promise<number> {
  const pending = await db.getPendingWebhookDeliveries(100);
  let processed = 0;
  for (const d of pending) {
    const webhook = await db.getWebhookById(d.webhookId);
    if (!webhook) continue;
    await attemptDelivery(d.id, webhook.url, JSON.stringify(d.payload), webhook.secret);
    processed++;
  }
  return processed;
}
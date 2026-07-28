import * as db from "./db";

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

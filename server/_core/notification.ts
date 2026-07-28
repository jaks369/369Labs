import { sendEmail, buildNotificationEmail } from "./email";
import * as db from "../db";

export type NotificationEvent = "tradeExecuted" | "takeProfitHit" | "stopLossHit" | "botError" | "signalDetected";

export async function notifyUser(userId: number, event: NotificationEvent, title: string, body: string, details?: string): Promise<void> {
  try {
    const settings = await db.getNotificationSettingsByUserId(userId);
    if (!settings || !settings.emailEnabled || !settings[event]) return;
    const user = await db.getUserById(userId);
    if (!user || !user.email) return;
    await sendEmail({
      to: user.email,
      subject: `[369Labs] ${title}`,
      html: buildNotificationEmail(title, body, details),
    });
  } catch (e) {
    console.error("[notifyUser] email failed:", e);
  }
}

export async function notifyUserTelegram(userId: number, text: string): Promise<void> {
  try {
    const tg = await db.getTelegramSettingsByUserId(userId);
    if (!tg || !tg.botToken || !tg.chatId) return;
    await db.sendTelegramMessage(tg.botToken, tg.chatId, text);
  } catch (e) {
    console.error("[notifyUserTelegram] failed:", e);
  }
}

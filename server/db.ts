import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  User,
  users,
  derivTokens, 
  strategies, 
  trades, 
  botRuns, 
  telegramSettings, 
  notificationSettings,
  DerivToken,
  Strategy,
  Trade,
  BotRun,
  TelegramSettings,
  NotificationSettings,
  InsertDerivToken,
  InsertStrategy,
  InsertTrade,
  InsertBotRun,
  InsertTelegramSettings,
  InsertNotificationSettings,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { encrypt, decrypt } from './_core/encryption';

function parseDbUrl(url: string): Record<string, any> {
  const parsed = new URL(url);
  const config: Record<string, any> = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace("/", ""),
  };
  if (parsed.hostname.includes("tidbcloud.com")) {
    config.ssl = { minVersion: "TLSv1.2" };
  }
  return config;
}

let _db: ReturnType<typeof drizzle> | null = null;
let _dbError: string | null = null;

export async function getDb() {
  if (!_db && !_dbError) {
    if (!process.env.DATABASE_URL) {
      _dbError = "DATABASE_URL environment variable is not set";
      console.error("[Database] " + _dbError);
    } else {
      try {
        const cfg = parseDbUrl(process.env.DATABASE_URL);
        _db = drizzle(cfg);
        console.log("[Database] Connected successfully");
      } catch (error) {
        _dbError = String(error);
        console.error("[Database] Failed to connect:", error);
      }
    }
  }
  return _db;
}
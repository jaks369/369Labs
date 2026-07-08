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

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function createUser(user: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values: InsertUser = {
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name ?? null,
    lastSignedIn: new Date(),
  };

  if (user.email === ENV.ownerEmail) {
    values.role = "admin";
  }

  const result = await db.insert(users).values(values);
  const id = result[0].insertId;
  return (await db.select().from(users).where(eq(users.id, id as number)).limit(1))[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function touchUserLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Deriv Token queries
export async function saveDerivToken(token: InsertDerivToken): Promise<DerivToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const encryptedToken = encrypt(token.token);
  const result = await db.insert(derivTokens).values({ ...token, token: encryptedToken });
  const id = result[0].insertId;
  return (await db.select().from(derivTokens).where(eq(derivTokens.id, id as number)).limit(1))[0];
}

export async function getDerivTokenByUserId(userId: number): Promise<DerivToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(derivTokens).where(and(eq(derivTokens.userId, userId), eq(derivTokens.isActive, true))).limit(1);
  if (result.length > 0) {
    const decryptedToken = decrypt(result[0].token);
    return { ...result[0], token: decryptedToken };
  } else {
    return undefined;
  }
}

// Strategy queries
export async function saveStrategy(strategy: InsertStrategy): Promise<Strategy> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(strategies).values(strategy);
  const id = result[0].insertId;
  return (await db.select().from(strategies).where(eq(strategies.id, id as number)).limit(1))[0];
}

export async function getStrategiesByUserId(userId: number): Promise<Strategy[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(strategies).where(eq(strategies.userId, userId));
}

export async function getStrategyById(id: number, userId: number): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(strategies).where(and(eq(strategies.id, id), eq(strategies.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Trade queries
export async function saveTrade(trade: InsertTrade): Promise<Trade> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(trades).values(trade);
  const id = result[0].insertId;
  return (await db.select().from(trades).where(eq(trades.id, id as number)).limit(1))[0];
}

export async function getTradesByUserId(userId: number, limit: number = 50): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.createdAt)).limit(limit);
}

// Bot Run queries
export async function saveBotRun(botRun: InsertBotRun): Promise<BotRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(botRuns).values(botRun);
  const id = result[0].insertId;
  return (await db.select().from(botRuns).where(eq(botRuns.id, id as number)).limit(1))[0];
}

export async function getBotRunsByUserId(userId: number): Promise<BotRun[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(botRuns).where(eq(botRuns.userId, userId)).orderBy(desc(botRuns.createdAt));
}

export async function updateBotRun(
  id: number,
  userId: number,
  updates: Partial<Pick<InsertBotRun, "status" | "endTime" | "totalTrades" | "totalProfitLoss" | "errorMessage">>
): Promise<BotRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(botRuns).set(updates).where(and(eq(botRuns.id, id), eq(botRuns.userId, userId)));
  const result = await db.select().from(botRuns).where(and(eq(botRuns.id, id), eq(botRuns.userId, userId))).limit(1);
  return result[0];
}

// Telegram Settings queries
export async function saveTelegramSettings(settings: InsertTelegramSettings): Promise<TelegramSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(telegramSettings).values(settings);
  const id = result[0].insertId;
  return (await db.select().from(telegramSettings).where(eq(telegramSettings.id, id as number)).limit(1))[0];
}

export async function getTelegramSettingsByUserId(userId: number): Promise<TelegramSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(telegramSettings).where(eq(telegramSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Notification Settings queries
export async function saveNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(notificationSettings).values(settings);
  const id = result[0].insertId;
  return (await db.select().from(notificationSettings).where(eq(notificationSettings.id, id as number)).limit(1))[0];
}

export async function getNotificationSettingsByUserId(userId: number): Promise<NotificationSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

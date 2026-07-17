import { eq, and, desc, gt, sql } from "drizzle-orm";
import * as mysql from "mysql2/promise";
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
  tickHistory,
  DerivToken,
  Strategy,
  Trade,
  BotRun,
  TelegramSettings,
  NotificationSettings,
  InsertUser,
  InsertDerivToken,
  InsertStrategy,
  InsertTrade,
  InsertBotRun,
  InsertTelegramSettings,
  InsertNotificationSettings,
  trades,
  signals,
  strategies,
  botRuns,
  derivTokens,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { encrypt, decrypt } from './_core/encryption';

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  const config: Record<string, any> = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace("/", ""),
  };
  if (parsed.hostname.includes("tidbcloud.com")) {
    config.ssl = { rejectUnauthorized: false };
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
        const pool = mysql.createPool(cfg);
        _db = drizzle(pool);
        console.log("[Database] Connected successfully");
      } catch (error) {
        _dbError = String(error);
        console.error("[Database] Failed to connect:", error);
      }
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

export async function removeDerivToken(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(derivTokens).set({ isActive: false }).where(eq(derivTokens.userId, userId));
}

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

export async function getPublishedStrategies(): Promise<Strategy[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(strategies).where(eq(strategies.published, true));
}

export async function getStrategyById(id: number, userId: number): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(strategies).where(and(eq(strategies.id, id), eq(strategies.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

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
  
  return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.updatedAt)).limit(limit);
}

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


export async function saveTickHistory(row: InsertTickHistory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(tickHistory).values(row);
  } catch (error) {
    console.error("[tickHistory] insert error:", error);
  }
}

export async function getTickHistory(symbol: string, limit: number = 1000): Promise<TickHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tickHistory).where(eq(tickHistory.symbol, symbol)).orderBy(desc(tickHistory.epoch)).limit(limit);
}

export async function saveSignal(row: InsertSignal): Promise<Signal> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(signals).values(row);
  const id = (result as any)[0]?.insertId || (result as any).insertId;
  return (await db.select().from(signals).where(eq(signals.id, Number(id))).limit(1))[0];
}

export async function getSignalsByUserId(userId: number, limit: number = 100): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signals).where(and(eq(signals.userId, userId), gt(signals.expiresAt, Math.floor(Date.now()/1000)))).orderBy(desc(signals.discoveredAt)).limit(limit);
}

export async function getSignalsBySymbol(userId: number, symbol: string, limit: number = 100): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signals).where(and(eq(signals.userId, userId), eq(signals.symbol, symbol), gt(signals.expiresAt, Math.floor(Date.now()/1000)))).orderBy(desc(signals.discoveredAt)).limit(limit);
}
// Ensure the signals.expiresAt column exists (idempotent). TiDB errors if it
// already exists, which we swallow. Also backfill any 0 rows from old data.
export async function saveAuditLog(entry: { userId: number; action: string; target?: string; detail?: any }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values({ userId: entry.userId, action: entry.action, target: entry.target || null, detail: entry.detail ?? null });
  } catch (e: any) {
    console.error("[auditLog] insert failed", e?.message || e);
  }
}

export async function getAuditLogs(userId: number, limit: number = 100): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// Idempotent: create the userMemory table if it doesn't exist yet (TiDB ignores
// IF NOT EXISTS). Keeps the AI Memory feature working without a manual migration.
export async function ensureUserMemoryTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS userMemory (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        memory json NOT NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY userMemory_userId (userId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureUserMemoryTable] failed", e?.message || e);
  }
}

export async function ensureSignalExpiryColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`ALTER TABLE signals ADD COLUMN expiresAt bigint NOT NULL DEFAULT 0`);
    console.log("[ensureSignalExpiryColumn] added expiresAt column");
  } catch (e: any) {
    if (e?.errno !== 1060) console.error("[ensureSignalExpiryColumn] alter failed", e?.message || e);
  }
  try {
    await db.execute(sql`UPDATE signals SET expiresAt = discoveredAt + 3600 WHERE expiresAt = 0`);
  } catch (e) {
    console.error("[ensureSignalExpiryColumn] backfill failed", e);
  }
}


// Recompute lastDigit from price for every row (corrects old data that stored
// the units digit before the decimal instead of the true last decimal digit).
// Gated behind RECOMPUTE_DIGITS=1 so it does not run on every boot.
export async function recomputeLastDigits(): Promise<number> {
  // Runs every boot: idempotent - only updates rows whose stored lastDigit != recomputed. Self-heals after the pre-fix bug.
  const db = await getDb();
  if (!db) return 0;
  try {
    const res = await db.execute(sql`UPDATE tickHistory SET lastDigit = CAST(RIGHT(REPLACE(CAST(price AS CHAR), ".", ""), 1) AS UNSIGNED) WHERE lastDigit <> CAST(RIGHT(REPLACE(CAST(price AS CHAR), ".", ""), 1) AS UNSIGNED)`);
    console.log(`[recomputeLastDigits] updated ${(res as any)?.affectedRows ?? 0} rows`);
    return (res as any)?.affectedRows ?? 0;
  } catch (e) {
    console.error("[recomputeLastDigits] failed", e);
    return 0;
  }
}
// One-time data hygiene: during a past bug, ticks were stored with lastDigit=0.
// Remove those rows so digit stats / scanners aren't skewed by bad data.
export async function pruneBadTicks(): Promise<number> {
  if (process.env.PRUNE_BAD_TICKS !== "1") { console.log('[pruneBadTicks] skipped (set PRUNE_BAD_TICKS=1 to run once)'); return 0; }
  const db = await getDb();
  if (!db) return 0;
  try {
    const res = await db.delete(tickHistory).where(eq(tickHistory.lastDigit, 0));
    console.log(`[pruneBadTicks] removed ${(res as any)?.affectedRows ?? 0} bad tick rows`);
    return (res as any)?.affectedRows ?? 0;
  } catch (e) {
    console.error("[pruneBadTicks] failed", e);
    return 0;
  }
}

const SEED_PLUGINS = [
  { name: "MartingaleGuard", description: "Auto-cancels a bot if its stake doubles more than twice in a row (anti-martingale safety).", author: "369Labs", hook: "onTrade", enabledByDefault: false },
  { name: "DailyPnLCap", description: "Stops all bots when account daily loss exceeds a user-set %.", author: "369Labs", hook: "onTrade", enabledByDefault: false },
  { name: "SignalBooster", description: "Re-ranks AI signals by confidence Ã— winRate before showing them.", author: "community", hook: "onSignal", enabledByDefault: true },
  { name: "TelegramRecap", description: "Sends a nightly PnL + open-positions recap via Telegram.", author: "community", hook: "scheduled", enabledByDefault: false },
  { name: "VolatilityWatchdog", description: "Pauses bots when realized volatility spikes > 2x its 1h average.", author: "369Labs", hook: "onTick", enabledByDefault: false },
];

export async function ensurePluginsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS plugins (
        id int NOT NULL AUTO_INCREMENT,
        name varchar(128) NOT NULL,
        description text,
        author varchar(128),
        hook varchar(64),
        config json,
        enabled_by_default tinyint(1) NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY plugins_name (name)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS plugin_installs (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        pluginId int NOT NULL,
        enabled tinyint(1) NOT NULL DEFAULT 1,
        installed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY plugin_installs_uniq (userId, pluginId)
      )
    `);
    for (const p of SEED_PLUGINS) {
      await db.execute(sql`
        INSERT IGNORE INTO plugins (name, description, author, hook, enabled_by_default)
        VALUES (${p.name}, ${p.description}, ${p.author}, ${p.hook}, ${p.enabledByDefault ? 1 : 0})
      `);
    }
  } catch (e: any) {
    console.error("[ensurePluginsTable] failed", e?.message || e);
  }
}

export async function getPluginMarketplace(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(sql`SELECT * FROM plugins ORDER BY id`);
    return (rows as any)[0] ?? [];
  } catch (e: any) {
    console.error("[getPluginMarketplace] failed", e?.message || e);
    return [];
  }
}

export async function getInstalledPlugins(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(
      sql`SELECT p.*, pi.enabled AS installedEnabled FROM plugins p
          LEFT JOIN plugin_installs pi ON pi.pluginId = p.id AND pi.userId = ${userId}
          ORDER BY p.id`
    );
    return (rows as any)[0] ?? [];
  } catch (e: any) {
    console.error("[getInstalledPlugins] failed", e?.message || e);
    return [];
  }
}

export async function installPlugin(userId: number, pluginId: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(
      sql`INSERT INTO plugin_installs (userId, pluginId, enabled) VALUES (${userId}, ${pluginId}, ${enabled ? 1 : 0})
          ON DUPLICATE KEY UPDATE enabled = ${enabled ? 1 : 0}`
    );
  } catch (e: any) {
    console.error("[installPlugin] failed", e?.message || e);
  }
}

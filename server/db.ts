import { eq, and, asc, desc, gt, inArray, lte, sql } from "drizzle-orm";
import * as mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes } from "crypto";
import {
  users,
  User,
  InsertUser,
  derivTokens,
  InsertDerivToken,
  strategies,
  InsertStrategy,
  chatMessages,
  botRuns,
  BotRun,
  InsertBotRun,
  botLogs,
  BotLog,
  InsertBotLog,
  signals,
  Signal,
  InsertSignal,
  aiKnowledge,
  AiKnowledgeResult,
  InsertAiKnowledge,
  jobs,
  userMemory,
  pluginInstalls,
  passwordResetTokens,
  PasswordResetToken,
  InsertPasswordResetToken,
  verificationTokens,
  VerificationToken,
  InsertVerificationToken,
  auditLogs,
  telegramSettings,
  TelegramSettings,
  InsertTelegramSettings,
  notificationSettings,
  NotificationSettings,
  InsertNotificationSettings,
  oauthAccounts,
  OAuthAccount,
  InsertOAuthAccount,
  trades,
  Trade,
  InsertTrade,
  tickHistory,
  InsertTickHistory,
  TickHistoryRow,
  DerivToken,
  Strategy,
  sessions,
  Session,
  InsertSession,
  ipWhitelist,
  IpWhitelistEntry,
  InsertIpWhitelistEntry,
  priceAlerts,
  PriceAlert,
  InsertPriceAlert,
  subscriptions,
  Subscription,
  InsertSubscription,
  webhooks,
  Webhook,
  InsertWebhook,
  webhookDeliveries,
  WebhookDelivery,
  InsertWebhookDelivery,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { encrypt, decrypt } from "./_core/encryption";

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  const config: Record<string, any> = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace("/", ""),
    // Connection pool limits - prevent connection exhaustion
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
    maxIdle: Number(process.env.DB_POOL_MAX_IDLE) || 5,
    idleTimeout: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 60000, // 60 seconds
    queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT) || 20,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
  if (parsed.hostname.includes("tidbcloud.com")) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

let _db: ReturnType<typeof drizzle> | null = null;
let _dbError: string | null = null;
let _pool: mysql.Pool | null = null;

// Simple per-key async mutex. Used to serialize saveTrade dedup check+insert so
// two concurrent requests for the same (userId, contractId) cannot both see "no
// existing row" and insert duplicate trade rows (the saveTrade dedup race).
class AsyncMutex {
  private locks = new Map<string, Promise<void>>();
  private resolvers = new Map<string, () => void>();

  async lock(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, promise);
    this.resolvers.set(key, release!);
    return release!;
  }

  unlock(key: string): void {
    const release = this.resolvers.get(key);
    if (release) {
      release();
      this.locks.delete(key);
      this.resolvers.delete(key);
    }
  }
}

const tradeMutex = new AsyncMutex();

export async function getDb() {
  if (!_db && !_dbError) {
    if (!process.env.DATABASE_URL) {
      _dbError = "DATABASE_URL environment variable is not set";
      console.error("[Database] " + _dbError);
    } else {
      try {
        const cfg = parseDbUrl(process.env.DATABASE_URL);
        _pool = mysql.createPool(cfg);
        _db = drizzle(_pool) as any;
        console.log("[Database] Connected successfully");
      } catch (error) {
        _dbError = String(error);
        console.error("[Database] Failed to connect:", error);
      }
    }
  }
  return _db;
}

export function getRawPool() {
  return _pool;
}

export async function listAllUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users);
}

export async function updateUserRole(userId: number, role: "user" | "admin"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// Tables carrying a userId column, deleted in child→parent order. Kept in one
// place so deleteUser and the raw-pool transaction below stay in sync.
const USER_SCOPED_TABLES = [
  "chatMessages",
  "auditLogs",
  "aiKnowledge",
  "botRuns",
  "trades",
  "signals",
  "strategies",
  "jobs",
  "userMemory",
  "notificationSettings",
  "telegramSettings",
  "derivTokens",
  "oauthAccounts",
  "passwordResetTokens",
  "verificationTokens",
  "pluginInstalls",
  "priceAlerts",
  "sessions",
  "ipWhitelist",
  "botLogs",
  "subscriptions",
  "webhooks",
] as const;

export async function deleteUser(userId: number): Promise<void> {
  const pool = getRawPool();
  if (pool) {
    // Single transaction so a mid-way failure rolls back instead of leaving a
    // half-deleted user with orphaned rows (previously each delete ran alone).
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const table of USER_SCOPED_TABLES) {
        await conn.execute(`DELETE FROM ${table} WHERE userId = ?`, [userId]);
      }
      await conn.execute("DELETE FROM users WHERE id = ?", [userId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Fallback path (no raw pool): sequential deletes, best-effort.
  for (const table of USER_SCOPED_TABLES) {
    await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE userId = ${userId}`).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId));
}

// Sessions
export async function createSession(data: InsertSession): Promise<Session> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sessions).values(data);
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id as number))
      .limit(1)
  )[0];
}

export async function getSessionBySessionId(sessionId: string): Promise<Session | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);
  return result[0];
}

export async function revokeSession(sessionId: string, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.sessionId, sessionId), eq(sessions.userId, userId)));
}

export async function getUserSessions(userId: number): Promise<Session[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sessions).where(eq(sessions.userId, userId));
}

export async function touchSessionLastActive(sessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(sessions).set({ lastActiveAt: new Date() }).where(eq(sessions.sessionId, sessionId));
}

// IP Whitelist
export async function getIpWhitelist(userId: number): Promise<IpWhitelistEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ipWhitelist).where(eq(ipWhitelist.userId, userId));
}

export async function addIpWhitelistEntry(data: InsertIpWhitelistEntry): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ipWhitelist).values(data);
}

export async function removeIpWhitelistEntry(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ipWhitelist).where(and(eq(ipWhitelist.id, id), eq(ipWhitelist.userId, userId)));
}

export async function createUser(user: { email: string; passwordHash: string; name?: string | null }): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values: InsertUser = {
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name ?? null,
    lastSignedIn: new Date(),
  };

  // SECURITY: do NOT auto-promote signups whose email matches ENV.ownerEmail.
  // An attacker who registers the owner email first would instantly become admin.
  // Admin is granted only after the email address is verified (see updateUserEmailVerified).

  const result = await db.insert(users).values(values);
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(users)
      .where(eq(users.id, id as number))
      .limit(1)
  )[0];
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

export async function setUser2FASecret(userId: number, secret: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ twoFASecret: secret }).where(eq(users.id, userId));
}

export async function enable2FA(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
}

export async function disable2FA(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ twoFASecret: null, twoFactorEnabled: false }).where(eq(users.id, userId));
}

export async function touchUserLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Expire any previously issued tokens for this user
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}

export async function getValidPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), sql`${passwordResetTokens.usedAt} IS NULL`, gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markPasswordResetTokenUsed(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.token, token));
}

// Email verification tokens
export async function createVerificationToken(userId: number, token: string, expiresAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.userId, userId));
  await db.insert(verificationTokens).values({ userId, token, expiresAt });
}

export async function getValidVerificationToken(token: string): Promise<VerificationToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.token, token), sql`${verificationTokens.usedAt} IS NULL`, gt(verificationTokens.expiresAt, new Date())))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markVerificationTokenUsed(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.token, token));
}

export async function updateUserEmailVerified(userId: number, verified?: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ emailVerified: verified ?? true })
    .where(eq(users.id, userId));
  // Once the email is verified, promote the owner address to admin. This is safe
  // because it now requires owning the inbox (email verification), unlike the old
  // behavior which granted admin at signup before any verification.
  if (verified !== false && ENV.ownerEmail) {
    try {
      const user = (
        await db.select().from(users).where(eq(users.id, userId)).limit(1)
      )[0];
      if (user && user.email === ENV.ownerEmail && user.role !== "admin") {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
      }
    } catch (e) {
      console.error("[db] Failed to promote owner to admin on email verification:", e);
    }
  }
}

export async function updateUserEmail(userId: number, email: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

export async function updateUserProfile(userId: number, data: { name?: string; avatarUrl?: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const update: Record<string, any> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl || null;
  if (Object.keys(update).length > 0) {
    await db.update(users).set(update).where(eq(users.id, userId));
  }
}

// OAuth accounts
export async function getOAuthAccount(provider: string, providerId: string): Promise<OAuthAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerId, providerId)))
    .limit(1);
  return result[0];
}

export async function createOAuthAccount(data: InsertOAuthAccount): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(oauthAccounts).values(data);
}

export async function getUserByResetToken(token: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const record = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), sql`${passwordResetTokens.usedAt} IS NULL`, gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (record.length === 0) return undefined;
  return getUserById(record[0].userId);
}

export async function getChatHistory(userId: number, chatId: string, limit = 50): Promise<{ role: string; content: string; steps?: any }[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, userId), eq(chatMessages.chatId, chatId)))
    .orderBy(chatMessages.id)
    .limit(limit);
  return rows.map((r) => ({ role: r.role, content: r.content, steps: (r.steps as any) ?? undefined }));
}

export async function addChatMessage(userId: number, chatId: string, role: string, content: string, steps?: any): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatMessages).values({ userId, chatId, role, content, steps: steps ? steps : null });
}

export async function saveDerivToken(token: InsertDerivToken): Promise<DerivToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const encryptedToken = encrypt(token.token);
  const result = await db.insert(derivTokens).values({ ...token, token: encryptedToken });
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(derivTokens)
      .where(eq(derivTokens.id, id as number))
      .limit(1)
  )[0];
}

export async function getDerivTokenByUserId(userId: number): Promise<DerivToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Prefer the most recently updated active token. The previous query had no
  // ORDER BY, so with multiple isActive tokens the DB picked an arbitrary row —
  // which could be an old/revoked token while a fresh valid one exists, leaving
  // DerivManager "connected" to a dead token and every trade silently failing.
  const result = await db
    .select()
    .from(derivTokens)
    .where(and(eq(derivTokens.userId, userId), eq(derivTokens.isActive, true)))
    .orderBy(desc(derivTokens.updatedAt), desc(derivTokens.id))
    .limit(1);
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
  try {
    const result = await db.insert(strategies).values(strategy);
    const id = result[0].insertId;
    return (
      await db
        .select()
        .from(strategies)
        .where(eq(strategies.id, id as number))
        .limit(1)
    )[0];
  } catch (e1: any) {
    console.error("[saveStrategy] Drizzle insert failed, trying raw fallback. Error:", e1?.message || e1, "userId:", strategy.userId, "name:", strategy.name);
    const pool = getRawPool();
    if (!pool) throw new Error("Pool not available");
    try {
      const [r] = await pool.execute("INSERT INTO strategies (userId, name, description, config, isActive, published) VALUES (?, ?, ?, ?, ?, ?)", [
        strategy.userId,
        strategy.name,
        strategy.description ?? null,
        JSON.stringify(strategy.config),
        strategy.isActive ?? true,
        strategy.published ?? false,
      ]);
      const id = (r as any).insertId;
      const [rows] = await pool.execute("SELECT * FROM strategies WHERE id=?", [id]);
      return (rows as any[])[0];
    } catch (e2: any) {
      console.error("[saveStrategy] Raw fallback also failed", e2?.message || e2);
      throw new Error("Failed to save strategy: " + (e2?.message || e2));
    }
  }
}

export async function getStrategiesByUserId(userId: number): Promise<Strategy[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(strategies).where(eq(strategies.userId, userId));
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute("SELECT * FROM strategies WHERE userId=? ORDER BY createdAt DESC", [userId]);
      return rows as Strategy[];
    } catch {
      return [];
    }
  }
}

export async function getPublishedStrategies(): Promise<Strategy[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(strategies).where(eq(strategies.published, true));
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute("SELECT * FROM strategies WHERE published=TRUE ORDER BY createdAt DESC");
      return rows as Strategy[];
    } catch {
      return [];
    }
  }
}

export async function getStrategyById(id: number, userId: number): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getStrategyByName(name: string, userId: number): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.name, name), eq(strategies.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setStrategyPublished(id: number, userId: number, published: boolean): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  await db
    .update(strategies)
    .set({ published })
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
  return getStrategyById(id, userId);
}

export async function duplicateStrategy(id: number, userId: number): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const original = await getStrategyById(id, userId);
  if (!original) return undefined;
  const result = await db.insert(strategies).values({
    userId,
    name: `${original.name} (copy)`,
    description: original.description,
    config: original.config,
    isActive: false,
    published: false,
  });
  const newId = result[0].insertId;
  return (
    await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, newId as number))
      .limit(1)
  )[0];
}

export async function saveTrade(trade: InsertTrade): Promise<Trade> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Upsert by (userId, contractId): the client saves a "pending" row on buy,
  // then settles it later. The server SettlementTracker may also settle the same
  // contract. Without dedup, the client-side settle would insert a second row
  // next to the server-settled one, double-counting P&L. Updating the existing
  // row keeps a single source of truth.
  //
  // The check-then-insert below is serialized with an in-process mutex keyed on
  // (userId, contractId): without it, two concurrent saves for the same contract
  // could both see "no existing row" and insert duplicates.
  if (trade.contractId) {
    const release = await tradeMutex.lock(`${trade.userId}:${trade.contractId}`);
    try {
      try {
        const existing = await db
          .select()
          .from(trades)
          .where(and(eq(trades.userId, trade.userId), eq(trades.contractId, trade.contractId)))
          .limit(1);
        if (existing.length > 0) {
          const row = existing[0];
          await db
            .update(trades)
            .set({
              result: trade.result ?? row.result,
              profitLoss: trade.profitLoss ?? row.profitLoss,
              exitTime: trade.exitTime ?? row.exitTime,
              exitPrice: trade.exitPrice ?? row.exitPrice,
              entryPrice: trade.entryPrice ?? row.entryPrice,
              stake: trade.stake ?? row.stake,
              contractType: trade.contractType ?? row.contractType,
              symbol: trade.symbol ?? row.symbol,
              updatedAt: new Date(),
            })
            .where(eq(trades.id, row.id));
          return (await db.select().from(trades).where(eq(trades.id, row.id)).limit(1))[0];
        }
      } catch {
        // drizzle unavailable (production fallback) — fall through to insert below
      }
    } finally {
      release();
    }
  }

  let id: number;
  try {
    const result = await db.insert(trades).values(trade);
    id = result[0].insertId;
  } catch (e: any) {
    const pool = getRawPool();
    if (!pool) throw new Error("Pool not available");
    try {
      const [r] = await pool.execute(
        "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, symbol, contractType, result, contractId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          trade.userId,
          trade.botRunId ?? null,
          trade.strategyId ?? null,
          trade.entryTime,
          trade.exitTime ?? null,
          trade.entryPrice ?? null,
          trade.exitPrice ?? null,
          trade.stake,
          trade.profitLoss ?? null,
          trade.symbol ?? "R_100",
          trade.contractType ?? "CALL",
          trade.result ?? null,
          trade.contractId ?? null,
        ],
      );
      id = (r as any).insertId;
    } catch (e2: any) {
      if (e2?.errno !== 1054 && e2?.code !== "ER_BAD_FIELD_ERROR") throw e2;
      // try without symbol (schema may be missing it)
      try {
        const [r] = await pool.execute(
          "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            trade.userId,
            trade.botRunId ?? null,
            trade.strategyId ?? null,
            trade.entryTime,
            trade.exitTime ?? null,
            trade.entryPrice ?? null,
            trade.exitPrice ?? null,
            trade.stake,
            trade.profitLoss ?? null,
            trade.contractType ?? "CALL",
            trade.result ?? null,
            trade.contractId ?? null,
          ],
        );
        id = (r as any).insertId;
      } catch (e3: any) {
        if (e3?.errno !== 1054 && e3?.code !== "ER_BAD_FIELD_ERROR") throw e3;
        // try without both symbol and contractType
        const [r] = await pool.execute(
          "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, result, contractId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            trade.userId,
            trade.botRunId ?? null,
            trade.strategyId ?? null,
            trade.entryTime,
            trade.exitTime ?? null,
            trade.entryPrice ?? null,
            trade.exitPrice ?? null,
            trade.stake,
            trade.profitLoss ?? null,
            trade.result ?? null,
            trade.contractId ?? null,
          ],
        );
        id = (r as any).insertId;
      }
    }
  }
  try {
    return (
      await db
        .select()
        .from(trades)
        .where(eq(trades.id, id as number))
        .limit(1)
    )[0];
  } catch {
    return {
      id,
      userId: trade.userId,
      botRunId: trade.botRunId ?? null,
      strategyId: trade.strategyId ?? null,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime ?? null,
      entryPrice: trade.entryPrice ?? null,
      exitPrice: trade.exitPrice ?? null,
      stake: trade.stake,
      profitLoss: trade.profitLoss ?? null,
      symbol: trade.symbol ?? "R_100",
      contractType: trade.contractType ?? null,
      result: trade.result ?? null,
      contractId: trade.contractId ?? null,
      updatedAt: new Date(),
    } as Trade;
  }
}

export async function getPendingTrades(): Promise<Trade[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable: no connection pool");
  try {
    return await db
      .select()
      .from(trades)
      .where(and(eq(trades.result, "pending"), sql`${trades.contractId} IS NOT NULL`))
      .orderBy(asc(trades.entryTime))
      .limit(200);
  } catch (err) {
    const pool = getRawPool();
    if (!pool) throw new Error("getPendingTrades: drizzle failed and no raw pool");
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, updatedAt FROM trades WHERE result = 'pending' AND contractId IS NOT NULL ORDER BY entryTime ASC LIMIT 200",
      );
      return rows as Trade[];
    } catch (rawErr: any) {
      // Do NOT swallow into [] — a silent empty list fools the SettlementTracker
      // into thinking there are no pending trades while rows rot in "pending"
      // forever (observed: #390001/#390002 sat untouched for 5h but signals kept
      // flowing). Surface the failure so the tracker records it in the heartbeat
      // and keeps the loop honest.
      throw new Error(`getPendingTrades failed (drizzle + raw): ${rawErr?.message || String(rawErr)}`);
    }
  }
}

// Mark an unrecoverable trade as stuck (settlement timeout) using the same raw
// path as settleTrade. Uses a direct UPDATE (not the drizzle import dance) so a
// stuck write can never silently fail the way it did for #390001/390002, where
// the locked branch ran every 2s but the drizzle update threw and was swallowed.
export async function markTradeStuck(tradeId: number, reason: string): Promise<boolean> {
  const pool = getRawPool();
  if (!pool) {
    const db = await getDb();
    if (!db) return false;
    try {
      const { trades } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(trades).set({ result: "stuck", profitLoss: "0", exitTime: new Date() }).where(eq(trades.id, tradeId));
      return true;
    } catch { return false; }
  }
  try {
    await pool.execute("UPDATE trades SET result='stuck', profitLoss=IFNULL(profitLoss, '0'), exitTime=NOW() WHERE id=? AND result='pending'", [tradeId]);
    return true;
  } catch (e: any) {
    console.error(`[markTradeStuck] trade #${tradeId} failed:`, e?.message || e);
    return false;
  }
}

export async function settleTrade(
  tradeId: number,
  data: {
    result: "win" | "loss";
    profitLoss: string;
    exitPrice: string;
    exitTime: Date;
  },
): Promise<Trade | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db
      .update(trades)
      .set({
        result: data.result,
        profitLoss: data.profitLoss,
        exitPrice: data.exitPrice,
        exitTime: data.exitTime,
      })
      .where(eq(trades.id, tradeId));
    const updated = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    return updated[0] || null;
  } catch {
    const pool = getRawPool();
    if (!pool) return null;
    try {
      await pool.execute("UPDATE trades SET result=?, profitLoss=?, exitPrice=?, exitTime=? WHERE id=?", [
        data.result,
        data.profitLoss,
        data.exitPrice,
        data.exitTime,
        tradeId,
      ]);
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, updatedAt FROM trades WHERE id=?",
        [tradeId],
      );
      return (rows as any[])[0] || null;
    } catch {
      return null;
    }
  }
}

export async function getTradeById(tradeId: number): Promise<Trade | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    return (await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1))[0];
  } catch {
    const pool = getRawPool();
    if (!pool) return undefined;
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, updatedAt FROM trades WHERE id=?",
        [tradeId],
      );
      return (rows as any[])[0] || undefined;
    } catch {
      return undefined;
    }
  }
}

export async function getTradesByUserId(userId: number, limit: number = 50, offset: number = 0): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.updatedAt)).limit(limit).offset(offset);
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, updatedAt FROM trades WHERE userId=? ORDER BY updatedAt DESC LIMIT ? OFFSET ?",
        [userId, limit, offset],
      );
      return rows as Trade[];
    } catch {
      return [];
    }
  }
}

export async function getHotMarkets(hours: number = 24, limit: number = 10): Promise<{ symbol: string; tradeCount: number; winRate: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 3600 * 1000);
  try {
    const rows = await db
      .select({
        symbol: trades.symbol,
        count: sql<number>`COUNT(*)`,
        wins: sql<number>`SUM(CASE WHEN ${trades.result} = 'win' THEN 1 ELSE 0 END)`,
      })
      .from(trades)
      .where(sql`${trades.entryTime} >= ${since}`)
      .groupBy(trades.symbol)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);
    return rows.map((r: any) => ({
      symbol: r.symbol ?? "R_100",
      tradeCount: Number(r.count || 0),
      winRate: Number(r.count || 0) > 0 ? Math.round((Number(r.wins || 0) / Number(r.count)) * 100) : 0,
    }));
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute(
        "SELECT symbol, COUNT(*) AS tradeCount, SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins FROM trades WHERE entryTime >= ? GROUP BY symbol ORDER BY tradeCount DESC LIMIT ?",
        [since, limit],
      );
      return (rows as any[]).map((r) => ({
        symbol: r.symbol ?? "R_100",
        tradeCount: Number(r.tradeCount || 0),
        winRate: Number(r.tradeCount || 0) > 0 ? Math.round((Number(r.wins || 0) / Number(r.tradeCount)) * 100) : 0,
      }));
    } catch {
      return [];
    }
  }
}

export async function getAccountByUserId(userId: number): Promise<{ balance: string } | null> {
  return null;
}

export async function getAiKnowledge(userId: number, knowledgeType: string, limit: number = 50): Promise<AiKnowledgeResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiKnowledge)
    .where(and(eq(aiKnowledge.userId, userId), eq(aiKnowledge.knowledgeType, knowledgeType)))
    .orderBy(desc(aiKnowledge.createdAt))
    .limit(limit);
}

export async function saveAiKnowledge(data: InsertAiKnowledge): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(aiKnowledge).values(data);
  } catch (e: any) {
    console.error("[aiKnowledge] insert failed", e?.message || e);
  }
}

export async function pruneAiKnowledge(userId: number, knowledgeType: string, keep: number, symbol?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const cond = symbol
      ? and(eq(aiKnowledge.userId, userId), eq(aiKnowledge.knowledgeType, knowledgeType), eq(aiKnowledge.symbol, symbol))
      : and(eq(aiKnowledge.userId, userId), eq(aiKnowledge.knowledgeType, knowledgeType));
    const rows = await db.select({ id: aiKnowledge.id }).from(aiKnowledge).where(cond).orderBy(desc(aiKnowledge.createdAt));
    if (rows.length > keep) {
      const ids = rows.slice(keep).map((r) => r.id);
      await db.delete(aiKnowledge).where(inArray(aiKnowledge.id, ids));
    }
  } catch {}
}

export async function searchAllAiKnowledge(userId: number, query: string, limit: number = 50): Promise<AiKnowledgeResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiKnowledge)
    .where(and(eq(aiKnowledge.userId, userId), sql`${aiKnowledge.data} LIKE ${"%" + query + "%"}`))
    .orderBy(desc(aiKnowledge.createdAt))
    .limit(limit);
}

export async function searchAiKnowledge(userId: number, query: string, knowledgeType: string, limit: number = 50): Promise<AiKnowledgeResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiKnowledge)
    .where(and(eq(aiKnowledge.userId, userId), eq(aiKnowledge.knowledgeType, knowledgeType), sql`${aiKnowledge.data} LIKE ${"%" + query + "%"}`))
    .orderBy(desc(aiKnowledge.createdAt))
    .limit(limit);
}

export async function createPriceAlert(data: InsertPriceAlert): Promise<PriceAlert> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(priceAlerts).values(data);
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.id, id as number))
      .limit(1)
  )[0];
}

export async function getPriceAlertsByUserId(userId: number): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId)).orderBy(desc(priceAlerts.createdAt));
}

export async function disablePriceAlert(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(priceAlerts)
    .set({ status: "disabled" })
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

export async function getActivePriceAlerts(): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts).where(eq(priceAlerts.status, "active"));
}

export async function markPriceAlertTriggered(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set({ status: "triggered", triggeredAt: new Date() }).where(eq(priceAlerts.id, id));
}

export async function updateStrategy(
  id: number,
  userId: number,
  updates: Partial<Pick<InsertStrategy, "name" | "description" | "config" | "isActive">>,
): Promise<Strategy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  await db
    .update(strategies)
    .set(updates)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
  const result = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .limit(1);
  return result[0];
}

export async function deleteStrategy(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.delete(strategies).where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
  return (result as any)?.affectedRows > 0;
}

export async function getAiKnowledgeByRelatedTradeId(userId: number, tradeId: number): Promise<AiKnowledgeResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiKnowledge)
    .where(and(eq(aiKnowledge.userId, userId), eq(aiKnowledge.relatedTradeId, tradeId)))
    .orderBy(desc(aiKnowledge.createdAt))
    .limit(20);
}

export async function deleteAiKnowledgeEntry(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(aiKnowledge).where(and(eq(aiKnowledge.id, id), eq(aiKnowledge.userId, userId)));
}

export async function updateAiKnowledgeEntry(id: number, userId: number, data: Partial<InsertAiKnowledge>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(aiKnowledge)
    .set(data)
    .where(and(eq(aiKnowledge.id, id), eq(aiKnowledge.userId, userId)));
}

export async function updateKnowledgeRelatedTrade(knowledgeId: number, tradeId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(aiKnowledge)
    .set({ relatedTradeId: tradeId })
    .where(and(eq(aiKnowledge.id, knowledgeId), eq(aiKnowledge.userId, userId)));
}

export async function saveBotLog(data: InsertBotLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(botLogs).values(data);
  } catch {
    /* table may not exist in production */
  }
}

export async function getBotLogsByRunId(botRunId: number, userId: number, limit: number = 100): Promise<BotLog[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return db
      .select()
      .from(botLogs)
      .where(and(eq(botLogs.botRunId, botRunId), eq(botLogs.userId, userId)))
      .orderBy(desc(botLogs.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function saveBotRun(botRun: InsertBotRun): Promise<BotRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(botRuns).values(botRun);
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(botRuns)
      .where(eq(botRuns.id, id as number))
      .limit(1)
  )[0];
}

export async function getBotRunsByUserId(userId: number): Promise<BotRun[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(botRuns).where(eq(botRuns.userId, userId)).orderBy(desc(botRuns.createdAt));
}

export async function getBotRunById(id: number, userId: number): Promise<BotRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(botRuns)
    .where(and(eq(botRuns.id, id), eq(botRuns.userId, userId)))
    .limit(1);
  return result[0];
}

export async function updateBotRun(
  id: number,
  userId: number,
  updates: Partial<Pick<InsertBotRun, "status" | "endTime" | "totalTrades" | "totalProfitLoss" | "errorMessage" | "safety" | "lossStreak" | "hasOpenTrade" | "lastError" | "lastDailyReset">>,
): Promise<BotRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db
    .update(botRuns)
    .set(updates)
    .where(and(eq(botRuns.id, id), eq(botRuns.userId, userId)));
  const result = await db
    .select()
    .from(botRuns)
    .where(and(eq(botRuns.id, id), eq(botRuns.userId, userId)))
    .limit(1);
  return result[0];
}

export async function saveTelegramSettings(settings: InsertTelegramSettings): Promise<TelegramSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(telegramSettings)
    .where(eq(telegramSettings.userId, settings.userId))
    .catch(() => {});
  await db.insert(telegramSettings).values(settings);
  const result = await db.select().from(telegramSettings).where(eq(telegramSettings.userId, settings.userId)).limit(1);
  return result[0];
}

export async function getTelegramSettingsByUserId(userId: number): Promise<TelegramSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(telegramSettings).where(eq(telegramSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      console.error("[Telegram] send failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Telegram] send error:", e);
    return false;
  }
}

export async function saveNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notificationSettings).values(settings);
  const id = result[0].insertId;
  return (
    await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.id, id as number))
      .limit(1)
  )[0];
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

export async function getTickHistory(symbol: string, limit: number = 1000, beforeEpoch?: number): Promise<TickHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cond = beforeEpoch ? and(eq(tickHistory.symbol, symbol), lte(tickHistory.epoch, beforeEpoch)) : eq(tickHistory.symbol, symbol);
  return db.select().from(tickHistory).where(cond).orderBy(desc(tickHistory.epoch)).limit(limit);
}

export async function checkMAcross(
  symbol: string,
  fastPeriod = 9,
  slowPeriod = 21,
): Promise<{
  crossed: boolean;
  direction: "above" | "below" | null;
  fastMA: number | null;
  slowMA: number | null;
  currentPrice: number | null;
  reason: string;
}> {
  const rows = await getTickHistory(symbol, 500);
  if (rows.length < slowPeriod + 2) {
    return {
      crossed: false,
      direction: null,
      fastMA: null,
      slowMA: null,
      currentPrice: null,
      reason: `Not enough tick data for ${symbol} (have ${rows.length}, need ${slowPeriod + 2})`,
    };
  }
  const sorted = [...rows].reverse();
  const prices = sorted.map((r) => parseFloat(r.price));
  const currentPrice = prices[prices.length - 1];
  const sma = (arr: number[], period: number) => {
    const slice = arr.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };
  const prevFast = sma(prices.slice(0, -1), fastPeriod);
  const currFast = sma(prices, fastPeriod);
  const prevSlow = sma(prices.slice(0, -1), slowPeriod);
  const currSlow = sma(prices, slowPeriod);
  const fastMA = currFast;
  const slowMA = currSlow;
  if (prevFast <= prevSlow && currFast > currSlow) {
    return {
      crossed: true,
      direction: "above",
      fastMA,
      slowMA,
      currentPrice,
      reason: `Fast MA (${fastMA.toFixed(4)}) crossed ABOVE slow MA (${slowMA.toFixed(4)}) — bullish crossover`,
    };
  }
  if (prevFast >= prevSlow && currFast < currSlow) {
    return {
      crossed: true,
      direction: "below",
      fastMA,
      slowMA,
      currentPrice,
      reason: `Fast MA (${fastMA.toFixed(4)}) crossed BELOW slow MA (${slowMA.toFixed(4)}) — bearish crossover`,
    };
  }
  return {
    crossed: false,
    direction: null,
    fastMA,
    slowMA,
    currentPrice,
    reason: `No crossover. Fast MA (${fastMA.toFixed(4)}) / Slow MA (${slowMA.toFixed(4)})`,
  };
}

export async function saveSignal(row: InsertSignal): Promise<Signal> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(signals).values(row);
  const id = (result as any)[0]?.insertId || (result as any).insertId;
  return (
    await db
      .select()
      .from(signals)
      .where(eq(signals.id, Number(id)))
      .limit(1)
  )[0];
}

export async function getSignalsByUserId(userId: number, limit: number = 100): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), gt(signals.expiresAt, Math.floor(Date.now() / 1000))))
    .orderBy(desc(signals.discoveredAt))
    .limit(limit);
}

export async function getSignalsBySymbol(userId: number, symbol: string, limit: number = 100): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), eq(signals.symbol, symbol), gt(signals.expiresAt, Math.floor(Date.now() / 1000))))
    .orderBy(desc(signals.discoveredAt))
    .limit(limit);
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

export async function getAllAuditLogs(limit: number = 200): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
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

export async function getUserMemory(userId: number): Promise<Record<string, any> | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.execute(sql`SELECT memory FROM userMemory WHERE userId = ${userId}`);
    const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0];
    if (!row) return null;
    const raw = row.memory;
    if (raw == null) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw as Record<string, any>;
  } catch (e: any) {
    if (e?.errno !== 1146) console.error("[getUserMemory] failed", e?.message || e);
    return null;
  }
}

export async function setUserMemory(userId: number, memory: Record<string, any>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const payload = JSON.stringify(memory ?? {});
  try {
    await db.execute(sql`
      INSERT INTO userMemory (userId, memory, updatedAt)
      VALUES (${userId}, ${payload}, NOW())
      ON DUPLICATE KEY UPDATE memory = ${payload}, updatedAt = NOW()
    `);
  } catch (e: any) {
    console.error("[setUserMemory] failed", e?.message || e);
  }
}

export async function ensureSessionsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        sessionId varchar(64) NOT NULL,
        userAgent text,
        ip varchar(45),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lastActiveAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revokedAt timestamp NULL,
        PRIMARY KEY (id),
        UNIQUE KEY sessions_sessionId (sessionId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureSessionsTable] failed", e?.message || e);
  }
}

export async function ensureSubscriptionsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        plan varchar(32) NOT NULL DEFAULT 'starter',
        status varchar(32) NOT NULL DEFAULT 'active',
        stripeCustomerId varchar(128),
        stripeSubscriptionId varchar(128),
        priceId varchar(128),
        currentPeriodEnd bigint,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY subscriptions_userId (userId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureSubscriptionsTable] failed", e?.message || e);
  }
}

export async function getSubscription(userId: number): Promise<Subscription | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    return rows[0] || null;
  } catch (e: any) {
    if (e?.errno !== 1146) console.error("[getSubscription] failed", e?.message || e);
    return null;
  }
}

export async function getSubscriptionByCustomer(customerId: string): Promise<Subscription | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
    return rows[0] || null;
  } catch (e: any) {
    if (e?.errno !== 1146) console.error("[getSubscriptionByCustomer] failed", e?.message || e);
    return null;
  }
}

export async function upsertSubscription(
  userId: number,
  data: {
    plan: string;
    status?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    priceId?: string;
    currentPeriodEnd?: number | null;
  },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .insert(subscriptions)
      .values({
        userId,
        plan: data.plan,
        status: data.status || "active",
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        priceId: data.priceId,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          plan: data.plan,
          status: data.status || "active",
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          priceId: data.priceId,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          updatedAt: new Date(),
        },
      });
  } catch (e: any) {
    console.error("[upsertSubscription] failed", e?.message || e);
  }
}

export async function ensureUsersColumns(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  const cols: [string, string][] = [
    ["passwordHash", "varchar(255) NOT NULL DEFAULT ''"],
    ["emailVerified", "tinyint(1) NOT NULL DEFAULT 0"],
    ["twoFASecret", "text"],
    ["twoFactorEnabled", "tinyint(1) NOT NULL DEFAULT 0"],
    ["avatarUrl", "text"],
  ];
  for (const [name, def] of cols) {
    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN \`${name}\` ${def}`);
      console.log(`[ensureUsersColumns] added column ${name}`);
    } catch (e: any) {
      if (e?.errno !== 1060) console.error(`[ensureUsersColumns] add ${name} failed`, e?.message || e);
    }
  }
}

export async function ensureSignalsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS signals (
        id int AUTO_INCREMENT NOT NULL,
        userId int NOT NULL,
        symbol varchar(32) NOT NULL,
        title varchar(255) NOT NULL,
        description text NOT NULL,
        rule json NOT NULL,
        evidence json NOT NULL,
        patternType varchar(32) NOT NULL,
        sampleSize int NOT NULL,
        winRate decimal(5,2) NOT NULL,
        confidence decimal(5,2) NOT NULL,
        oosWinRate decimal(5,2) NULL,
        oosSampleSize int NULL,
        oosValidated varchar(8) NULL DEFAULT 'true',
        discoveredAt bigint NOT NULL,
        startEpoch bigint NOT NULL,
        endEpoch bigint NOT NULL,
        source varchar(16) NOT NULL DEFAULT 'watch',
        createdAt timestamp DEFAULT now() NOT NULL,
        CONSTRAINT signals_id PRIMARY KEY(id)
      )
    `);
    console.log("[ensureSignalsTable] created signals table");
  } catch (e: any) {
    console.error("[ensureSignalsTable] create failed", e?.message || e);
  }
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS signals_userId_idx ON signals (userId)`);
  } catch {}
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS signals_symbol_idx ON signals (symbol)`);
  } catch {}
}

export async function ensureNotificationSettingsColumns(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  const cols: [string, string][] = [
    ["emailEnabled", "tinyint(1) NOT NULL DEFAULT 1"],
    ["signalDetected", "tinyint(1) NOT NULL DEFAULT 1"],
  ];
  for (const [name, def] of cols) {
    try {
      await pool.execute(`ALTER TABLE notificationSettings ADD COLUMN \`${name}\` ${def}`);
      console.log(`[ensureNotificationSettingsColumns] added column ${name}`);
    } catch (e: any) {
      if (e?.errno !== 1060) console.error(`[ensureNotificationSettingsColumns] add ${name} failed`, e?.message || e);
    }
  }
}

export async function ensureAuditLogsTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS auditLogs (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      action varchar(48) NOT NULL,
      target varchar(64),
      detail json,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT auditLogs_id PRIMARY KEY(id)
    )`);
    console.log("[ensureAuditLogsTable] created auditLogs table");
  } catch (e: any) {
    console.error("[ensureAuditLogsTable] create failed", e?.message || e);
  }
}

export async function ensureIpWhitelistTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS ipWhitelist (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      ip varchar(45) NOT NULL,
      label text,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ipWhitelist_id PRIMARY KEY(id)
    )`);
    console.log("[ensureIpWhitelistTable] created ipWhitelist table");
  } catch (e: any) {
    console.error("[ensureIpWhitelistTable] create failed", e?.message || e);
  }
}

export async function ensureTradesTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS trades (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      botRunId int,
      strategyId int,
      entryTime timestamp NOT NULL,
      exitTime timestamp,
      entryPrice decimal(18,8) NOT NULL,
      exitPrice decimal(18,8),
      stake decimal(18,8) NOT NULL,
      profitLoss decimal(18,8),
      symbol varchar(32) NOT NULL DEFAULT 'R_100',
      contractType varchar(32) DEFAULT 'CALL',
      result varchar(16),
      contractId varchar(64),
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT trades_id PRIMARY KEY(id)
    )`);
    console.log("[ensureTradesTable] created trades table");
    // migrate existing table if missing columns from earlier schema
    for (const col of ["ADD COLUMN symbol varchar(32) NOT NULL DEFAULT 'R_100'", "ADD COLUMN contractType varchar(32) DEFAULT 'CALL'"]) {
      try {
        await pool.execute(`ALTER TABLE trades ${col}`);
      } catch (e2: any) {
        if (e2?.errno !== 1060 && !e2?.message?.includes("Duplicate column")) {
          console.warn("[ensureTradesTable] column migration note", e2?.message || e2);
        }
      }
    }
  } catch (e: any) {
    console.error("[ensureTradesTable] create failed", e?.message || e);
  }
}

export async function ensureStrategiesTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS strategies (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      name varchar(255) NOT NULL,
      description text,
      config json NOT NULL,
      isActive boolean NOT NULL DEFAULT true,
      published boolean NOT NULL DEFAULT false,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT strategies_id PRIMARY KEY(id)
    )`);
    console.log("[ensureStrategiesTable] created strategies table");
    for (const col of [
      "ADD COLUMN config json NOT NULL",
      "ADD COLUMN description text",
      "ADD COLUMN isActive boolean NOT NULL DEFAULT true",
      "ADD COLUMN published boolean NOT NULL DEFAULT false",
    ]) {
      try {
        await pool.execute(`ALTER TABLE strategies ${col}`);
      } catch (e2: any) {
        if (e2?.errno !== 1060 && !e2?.message?.includes("Duplicate column")) {
          console.warn("[ensureStrategiesTable] column migration note", e2?.message || e2);
        }
      }
    }
  } catch (e: any) {
    console.error("[ensureStrategiesTable] create failed", e?.message || e);
  }
}

export async function ensurePriceAlertsTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS priceAlerts (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      symbol varchar(32) NOT NULL,
      direction varchar(10) NOT NULL,
      targetPrice decimal(18,8) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'active',
      triggeredAt timestamp NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT priceAlerts_id PRIMARY KEY(id)
    )`);
    console.log("[ensurePriceAlertsTable] created priceAlerts table");
  } catch (e: any) {
    console.error("[ensurePriceAlertsTable] create failed", e?.message || e);
  }
}

export async function ensureTickHistoryTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS tickHistory (
      id int AUTO_INCREMENT NOT NULL,
      symbol varchar(32) NOT NULL,
      price decimal(18,8) NOT NULL,
      lastDigit int NOT NULL,
      epoch bigint NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT tickHistory_id PRIMARY KEY(id)
    )`);
    console.log("[ensureTickHistoryTable] created tickHistory table");
  } catch (e: any) {
    console.error("[ensureTickHistoryTable] create failed", e?.message || e);
  }
}

export async function ensureSignalExpiryColumn(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`ALTER TABLE signals ADD COLUMN expiresAt bigint NOT NULL DEFAULT 0`);
    console.log("[ensureSignalExpiryColumn] added expiresAt column");
  } catch (e: any) {
    if (e?.errno !== 1060) console.error("[ensureSignalExpiryColumn] alter failed", e?.message || e);
  }
  try {
    await pool.execute(`UPDATE signals SET expiresAt = discoveredAt + 3600 WHERE expiresAt = 0`);
  } catch (e) {
    console.error("[ensureSignalExpiryColumn] backfill failed", e);
  }
}

// Idempotently add out-of-sample validation columns to existing signals tables
// (older databases were created before OOS validation existed).
export async function ensureSignalOosColumns(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  const cols: [string, string][] = [
    ["oosWinRate", "decimal(5,2) NULL"],
    ["oosSampleSize", "int NULL"],
    ["oosValidated", "varchar(8) NULL DEFAULT 'true'"],
  ];
  for (const [name, def] of cols) {
    try {
      await pool.execute(`ALTER TABLE signals ADD COLUMN ${name} ${def}`);
      console.log(`[ensureSignalOosColumns] added ${name} column`);
    } catch (e: any) {
      if (e?.errno !== 1060) console.error(`[ensureSignalOosColumns] add ${name} failed`, e?.message || e);
    }
  }
}

// Idempotently add the baselineWinRate column (random-chance win rate for the
// rule's contract type) so UI cards can show observed-vs-null edge.
export async function ensureSignalBaselineColumn(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`ALTER TABLE signals ADD COLUMN baselineWinRate decimal(5,2) NULL`);
    console.log("[ensureSignalBaselineColumn] added baselineWinRate column");
  } catch (e: any) {
    if (e?.errno !== 1060) console.error("[ensureSignalBaselineColumn] add failed", e?.message || e);
  }
}

export interface SettlementHeartbeat {
  pendingCount: number;
  settledCount: number;
  errorCount: number;
  derivOk: boolean;
  lastError: string | null;
}

export async function ensureSettlementHeartbeatTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS settlementHeartbeat (
      id int NOT NULL,
      lastTickAt bigint NOT NULL,
      pendingCount int NOT NULL DEFAULT 0,
      settledCount int NOT NULL DEFAULT 0,
      errorCount int NOT NULL DEFAULT 0,
      derivOk varchar(5) NOT NULL DEFAULT 'null',
      lastError varchar(255) NULL,
      PRIMARY KEY(id)
    )`);
    console.log("[ensureSettlementHeartbeatTable] created settlementHeartbeat table");
  } catch (e: any) {
    console.error("[ensureSettlementHeartbeatTable] create failed", e?.message || e);
  }
}

// Persist a single-row heartbeat so tracker liveness is observable from the DB
// (the row's id is fixed at 1 and upserted every tick). If the tick loop stops
// running, lastTickAt stops advancing — no more guessing from the signals table.
export async function saveSettlementHeartbeat(data: SettlementHeartbeat): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(
      `INSERT INTO settlementHeartbeat (id, lastTickAt, pendingCount, settledCount, errorCount, derivOk, lastError)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lastTickAt=VALUES(lastTickAt), pendingCount=VALUES(pendingCount),
         settledCount=VALUES(settledCount), errorCount=VALUES(errorCount), derivOk=VALUES(derivOk), lastError=VALUES(lastError)`,
      [
        Math.floor(Date.now() / 1000),
        data.pendingCount,
        data.settledCount,
        data.errorCount,
        data.derivOk ? "true" : "false",
        data.lastError ? String(data.lastError).slice(0, 255) : null,
      ],
    );
  } catch (e: any) {
    console.error("[saveSettlementHeartbeat] failed", e?.message || e);
  }
}

export async function getSettlementHeartbeat(): Promise<{ lastTickAt: number; pendingCount: number; settledCount: number; errorCount: number; derivOk: boolean; lastError: string | null } | null> {
  const pool = getRawPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT lastTickAt, pendingCount, settledCount, errorCount, derivOk, lastError FROM settlementHeartbeat WHERE id=1`,
    );
    const r = (rows as any[])[0];
    if (!r) return null;
    return {
      lastTickAt: Number(r.lastTickAt),
      pendingCount: Number(r.pendingCount),
      settledCount: Number(r.settledCount),
      errorCount: Number(r.errorCount),
      derivOk: String(r.derivOk) === "true",
      lastError: r.lastError,
    };
  } catch (e: any) {
    console.error("[getSettlementHeartbeat] failed", e?.message || e);
    return null;
  }
}

// Recompute lastDigit from price for every row (corrects old data that stored
// the units digit before the decimal instead of the true last decimal digit).
// Gated behind RECOMPUTE_DIGITS=1 so it does not run on every boot.
export async function recomputeLastDigits(): Promise<number> {
  // Uses FORMAT to preserve trailing zeros before reading the last digit.
  // Decimals per symbol come from Deriv's pip_size (see shared/lastDigit.ts):
  //   4 decimals: R_50, R_75
  //   2 decimals: R_100, 1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V
  //   3 decimals: everything else (R_10, R_25, 1HZ15V, 1HZ30V, 1HZ90V, BOOM*, CRASH*)
  const db = await getDb();
  if (!db) return 0;
  try {
    const res = await db.execute(
      sql`UPDATE tickHistory SET lastDigit = CAST(RIGHT(REPLACE(FORMAT(price, CASE
            WHEN symbol IN ('R_50', 'R_75') THEN 4
            WHEN symbol IN ('R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V') THEN 2
            ELSE 3 END), ',', ''), 1) AS UNSIGNED)
            WHERE lastDigit <> CAST(RIGHT(REPLACE(FORMAT(price, CASE
            WHEN symbol IN ('R_50', 'R_75') THEN 4
            WHEN symbol IN ('R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V') THEN 2
            ELSE 3 END), ',', ''), 1) AS UNSIGNED)`,
    );
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
  if (process.env.PRUNE_BAD_TICKS !== "1") {
    console.log("[pruneBadTicks] skipped (set PRUNE_BAD_TICKS=1 to run once)");
    return 0;
  }
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
  {
    name: "MartingaleGuard",
    description: "Auto-cancels a bot if its stake doubles more than twice in a row (anti-martingale safety).",
    author: "369Labs",
    hook: "onTrade",
    enabledByDefault: false,
  },
  {
    name: "DailyPnLCap",
    description: "Stops all bots when account daily loss exceeds a user-set %.",
    author: "369Labs",
    hook: "onTrade",
    enabledByDefault: false,
  },
  {
    name: "SignalBooster",
    description: "Re-ranks AI signals by confidence × winRate before showing them.",
    author: "community",
    hook: "onSignal",
    enabledByDefault: true,
  },
  {
    name: "TelegramRecap",
    description: "Sends a nightly PnL + open-positions recap via Telegram.",
    author: "community",
    hook: "scheduled",
    enabledByDefault: false,
  },
  {
    name: "VolatilityWatchdog",
    description: "Pauses bots when realized volatility spikes > 2x its 1h average.",
    author: "369Labs",
    hook: "onTick",
    enabledByDefault: false,
  },
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
          ORDER BY p.id`,
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
          ON DUPLICATE KEY UPDATE enabled = ${enabled ? 1 : 0}`,
    );
  } catch (e: any) {
    console.error("[installPlugin] failed", e?.message || e);
  }
}

// --- Webhooks ---
export async function ensureVerificationTokensTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS verificationTokens (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        token varchar(96) NOT NULL,
        expiresAt timestamp NOT NULL,
        usedAt timestamp NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
  } catch (e: any) {
    console.error("[ensureVerificationTokensTable] failed", e?.message || e);
  }
}

export async function ensurePasswordResetTokensTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS passwordResetTokens (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        token varchar(96) NOT NULL,
        expiresAt timestamp NOT NULL,
        usedAt timestamp NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
  } catch (e: any) {
    console.error("[ensurePasswordResetTokensTable] failed", e?.message || e);
  }
}

export async function ensureWebhooksTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS webhooks (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        url varchar(512) NOT NULL,
        events json NOT NULL,
        label varchar(64),
        secret varchar(64),
        active tinyint(1) NOT NULL DEFAULT 1,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    // Add the signing-secret column to databases created before it existed.
    // MySQL < 8.0 has no ADD COLUMN IF NOT EXISTS, so ignore duplicate-column.
    try {
      await db.execute(sql`ALTER TABLE webhooks ADD COLUMN secret varchar(64) NULL`);
    } catch (e: any) {
      if (e?.errno !== 1060 && e?.code !== "ER_DUP_FIELDNAME") console.warn("[ensureWebhooksTable] add secret column failed", e?.message || e);
    }
  } catch (e: any) {
    console.error("[ensureWebhooksTable] failed", e?.message || e);
  }
}

export async function ensureAiKnowledgeTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS aiKnowledge (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      knowledgeType varchar(32) NOT NULL,
      symbol varchar(32),
      data json,
      source varchar(32),
      confidence varchar(8),
      relatedTradeId int,
      relatedStrategyId int,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT aiKnowledge_id PRIMARY KEY(id)
    )`);
    console.log("[ensureAiKnowledgeTable] created aiKnowledge table");
  } catch (e: any) {
    console.error("[ensureAiKnowledgeTable] create failed", e?.message || e);
  }
}

export async function ensureBotLogsTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS botLogs (
      id int AUTO_INCREMENT NOT NULL,
      botRunId int NOT NULL,
      userId int NOT NULL,
      message text NOT NULL,
      level enum('info','warn','error') NOT NULL DEFAULT 'info',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT botLogs_id PRIMARY KEY(id)
    )`);
    console.log("[ensureBotLogsTable] created botLogs table");
  } catch (e: any) {
    console.error("[ensureBotLogsTable] create failed", e?.message || e);
  }
}

// bot.bot.getRuns / saveBotRun / getBotRunById relied on a botRuns table that was
// only ever created via Drizzle migrations — fresh/preview databases never got it,
// so /api/trpc/bot.getRuns 500'd with "table botRuns does not exist". This mirrors
// the other ensure*Table helpers (idempotent CREATE IF NOT EXISTS + column
// migration for the fields added later).
export async function ensureBotRunsTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS botRuns (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      strategyId int NOT NULL,
      startTime timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      endTime timestamp,
      status enum('running','stopped','error','paused','restarting') NOT NULL DEFAULT 'running',
      totalTrades int NOT NULL DEFAULT 0,
      totalProfitLoss decimal(18,8) NOT NULL DEFAULT 0,
      errorMessage text,
      safety json,
      lossStreak int NOT NULL DEFAULT 0,
      hasOpenTrade boolean NOT NULL DEFAULT false,
      lastError text,
      lastDailyReset timestamp,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT botRuns_id PRIMARY KEY(id)
    )`);
    console.log("[ensureBotRunsTable] created/migrated botRuns table");
    // Migrate columns that were added after the initial table for pre-existing DBs.
    for (const col of [
      "ADD COLUMN safety json",
      "ADD COLUMN lossStreak int NOT NULL DEFAULT 0",
      "ADD COLUMN hasOpenTrade boolean NOT NULL DEFAULT false",
      "ADD COLUMN lastError text",
      "ADD COLUMN lastDailyReset timestamp",
      "ADD COLUMN status enum('running','stopped','error','paused','restarting') NOT NULL DEFAULT 'running'",
    ]) {
      try {
        await pool.execute(`ALTER TABLE botRuns ${col}`);
      } catch (e2: any) {
        if (e2?.errno !== 1060 && !e2?.message?.includes("Duplicate column")) {
          console.warn("[ensureBotRunsTable] column migration note", e2?.message || e2);
        }
      }
    }
  } catch (e: any) {
    console.error("[ensureBotRunsTable] create failed", e?.message || e);
  }
}

export async function getWebhooksByUserId(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(sql`SELECT * FROM webhooks WHERE userId = ${userId} ORDER BY createdAt DESC`);
    const all = (rows as any)[0] ?? [];
    // Never leak the signing secret back to the client list view — it is shown
    // once at creation time only.
    return all.map((w: any) => {
      const { secret, ...rest } = w;
      return rest;
    });
  } catch (e: any) {
    console.error("[getWebhooksByUserId] failed", e?.message || e);
    return [];
  }
}

export async function getWebhookById(id: number): Promise<any> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.execute(sql`SELECT * FROM webhooks WHERE id = ${id} LIMIT 1`);
    const rowsArr = (rows as any)[0] ?? [];
    return rowsArr[0] || null;
  } catch (e: any) {
    console.error("[getWebhookById] failed", e?.message || e);
    return null;
  }
}

export async function createWebhook(data: { userId: number; url: string; events: string[]; label?: string }): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventsStr = JSON.stringify(data.events);
  // Per-webhook signing secret: returned to the caller exactly once so the
  // recipient can verify X-Webhook-Signature on deliveries. Never returned again.
  const secret = randomBytes(24).toString("hex");
  try {
    const result = await db.execute(sql`
      INSERT INTO webhooks (userId, url, events, label, secret) VALUES (${data.userId}, ${data.url}, ${eventsStr}, ${data.label || null}, ${secret})
    `);
    const insertId = (result as any)[0]?.insertId;
    if (insertId) return { id: insertId, ...data, secret };
    return { ok: true };
  } catch (e: any) {
    console.error("[createWebhook] failed", e?.message || e);
    throw e;
  }
}

export async function deleteWebhook(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`DELETE FROM webhooks WHERE id = ${id} AND userId = ${userId}`);
  } catch (e: any) {
    console.error("[deleteWebhook] failed", e?.message || e);
  }
}

export async function getActiveWebhooksForEvent(userId: number, event: string): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(sql`SELECT * FROM webhooks WHERE userId = ${userId} AND active = 1`);
    const all = (rows as any)[0] ?? [];
    return all.filter((w: any) => {
      try {
        const evts = typeof w.events === "string" ? JSON.parse(w.events) : w.events;
        return Array.isArray(evts) && evts.includes(event);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export async function createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(webhookDeliveries).values(data);
  const id = result[0].insertId;
  return (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id as number)).limit(1))[0];
}

export async function updateWebhookDelivery(id: number, updates: Partial<Pick<InsertWebhookDelivery, "status" | "attempts" | "lastError" | "nextRetryAt" | "deliveredAt">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(webhookDeliveries).set(updates).where(eq(webhookDeliveries.id, id));
}

export async function getPendingWebhookDeliveries(limit: number = 100): Promise<WebhookDelivery[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.status, "pending"), sql`${webhookDeliveries.nextRetryAt} IS NULL OR ${webhookDeliveries.nextRetryAt} <= NOW()`)).limit(limit);
}

export async function getDeadWebhookDeliveries(limit: number = 100): Promise<WebhookDelivery[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, "dead")).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
}

export async function retryWebhookDelivery(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(webhookDeliveries).set({ status: "pending", attempts: 0, lastError: null, nextRetryAt: null }).where(eq(webhookDeliveries.id, id));
}

const SAFE_COL_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function exportUserData(userId: number): Promise<Record<string, any>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [strategies, trades, journals, workflows, bots] = await Promise.all([
    db.execute(sql`SELECT * FROM strategies WHERE userId = ${userId}`).then((r) => (r as any)[0] ?? []),
    db.execute(sql`SELECT * FROM trades WHERE userId = ${userId}`).then((r) => (r as any)[0] ?? []),
    db.execute(sql`SELECT * FROM journals WHERE userId = ${userId}`).then((r) => (r as any)[0] ?? []),
    db.execute(sql`SELECT * FROM workflows WHERE userId = ${userId}`).then((r) => (r as any)[0] ?? []),
    db.execute(sql`SELECT * FROM bots WHERE userId = ${userId}`).then((r) => (r as any)[0] ?? []),
  ]);
  return { strategies, trades, journals, workflows, bots, exportedAt: new Date().toISOString() };
}

export async function importUserData(userId: number, data: Record<string, any>): Promise<{ imported: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let imported = 0;
  // Bound the import: a hostile/oversized payload must not let a single request
  // write unbounded rows (memory + DB DoS). 10k rows cap across all tables.
  const MAX_RESTORE_ROWS = 10_000;
  for (const table of ["strategies", "trades", "journals", "workflows", "bots"] as const) {
    const rows = data[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (imported >= MAX_RESTORE_ROWS) return { imported };
      const { id, createdAt, updatedAt, ...rest } = row;
      try {
        const cols = Object.keys(rest).filter((c) => SAFE_COL_RE.test(c));
        if (cols.length === 0) continue;
        const vals = cols.map((c) => (rest as any)[c]);
        const placeholders = vals.map(() => "?").join(", ");
        const pool = getRawPool();
        if (pool) {
          await pool.execute(`INSERT INTO ${table} (${cols.join(", ")}, userId) VALUES (${placeholders}, ?)`, [...vals, userId]);
        }
        imported++;
      } catch {
        /* skip dupes */
      }
    }
  }
  return { imported };
}

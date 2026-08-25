import { eq, and, asc, desc, gt, gte, inArray, lte, sql } from "drizzle-orm";
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
  guidingSignals,
  GuidingSignal,
  InsertGuidingSignal,
  digitReads,
  DigitRead,
  InsertDigitRead,
  strategyStats,
  CopyRelation,
  InsertCopyRelation,
  copyRelations,
  copyMirrors,
  CopyMirror,
  InsertCopyMirror,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { encrypt, decrypt } from "./_core/encryption";
import { logger } from "./_core/logger";
import { calibrateConfidence, type CalibrationBucket } from "./signalStats";

export type { CalibrationBucket };

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
    // Fail fast instead of hanging requests (Render cold start + TiDB sleep):
    // without these, an idle/restarting DB holds every HTTP request hostage.
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
    acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT) || 15000,
  };
  if (parsed.hostname.includes("tidbcloud.com")) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

let _db: ReturnType<typeof drizzle> | null = null;
let _dbError: string | null = null;
let _pool: mysql.Pool | null = null;
let _dbKeepAlive: ReturnType<typeof setInterval> | null = null;

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
    let resolvePromise!: () => void;
    const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
    this.locks.set(key, promise);
    let released = false;
    // The returned release MUST remove the map entries before resolving.
    // Resolving alone leaves `locks.has(key)` true forever, so every later
    // lock(key) spins on an already-resolved promise and starves the event
    // loop (a second saveTrade for the same userId+contractId would freeze
    // the whole server).
    const release = () => {
      if (released) return;
      released = true;
      if (this.locks.get(key) === promise) this.locks.delete(key);
      if (this.resolvers.get(key) === release) this.resolvers.delete(key);
      resolvePromise();
    };
    this.resolvers.set(key, release);
    return release;
  }

  unlock(key: string): void {
    this.resolvers.get(key)?.();
  }
}

const tradeMutex = new AsyncMutex();

// Minimal contract view the reconciler can rebuild a missing ledger row from.
export interface PortfolioContractInput {
  contractId: number | string;
  contractType: string;
  symbol: string;
  stake: number;
  entryPrice: number;
  purchasedAt: number | null;
  isSold: boolean;
  profit: number;
  soldAt: number | null;
  source?: string;
}

let _dbRetryCount = 0;
const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 5000;

export async function getDb() {
  if (!_db && !_dbError) {
    if (!process.env.DATABASE_URL) {
      _dbError = "DATABASE_URL environment variable is not set";
      logger.error(_dbError);
    } else {
      try {
        const cfg = parseDbUrl(process.env.DATABASE_URL);
        _pool = mysql.createPool(cfg);
        // Handle pool-level errors (connection drops, fatal errors). Without
        // this, a stale DB connection silently poisons all subsequent queries.
        (_pool as any).on("error", (err: any) => {
          logger.error("[DB] Pool error — resetting connection", { error: err?.message || err });
          if (_dbKeepAlive) { clearInterval(_dbKeepAlive); _dbKeepAlive = null; }
          _db = null;
          _pool = null;
          _dbError = null;
        });
        _db = drizzle(_pool) as any;
        _dbRetryCount = 0;
        logger.info("Database connected successfully");
        // Keep TiDB Cloud free tier awake — it pauses after ~5 min of no queries.
        // A simple SELECT 1 every 3 minutes prevents the pause without load.
        if (!_dbKeepAlive) {
          _dbKeepAlive = setInterval(() => {
            const pool = _pool;
            if (!pool) return;
            pool.query("SELECT 1").catch((e: any) => {
              logger.warn("[DB] Keep-alive ping failed — TiDB may be waking up", { error: e?.message || e });
            });
          }, 3 * 60 * 1000);
          _dbKeepAlive.unref?.();
        }
      } catch (error) {
        _dbError = String(error);
        logger.error("Database connection failed", { error: _dbError });
      }
    }
  }
  // Retry transient failures periodically so a blip on startup doesn't brick the server
  if (!_db && _dbError && _dbRetryCount < MAX_DB_RETRIES) {
    _dbRetryCount++;
    logger.info("Retrying database connection", { attempt: _dbRetryCount, maxRetries: MAX_DB_RETRIES });
    _dbError = null as any;
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
      logger.error("Failed to promote owner to admin on email verification", { error: e instanceof Error ? e.message : String(e) });
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

export async function getTradeStatusCounts(): Promise<{ pending: number; stuck: number; settledToday: number }> {
  const pool = getRawPool();
  if (!pool) return { pending: 0, stuck: 0, settledToday: 0 };
  try {
    const [rows] = await pool.execute(
      `SELECT
         SUM(result = 'pending') AS pending,
         SUM(result = 'stuck') AS stuck,
         SUM(result IN ('win','loss') AND exitTime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS settledToday
       FROM trades`,
    );
    const r = (rows as any[])[0] || {};
    return { pending: Number(r.pending || 0), stuck: Number(r.stuck || 0), settledToday: Number(r.settledToday || 0) };
  } catch (e: any) {
    logger.error("getTradeStatusCounts failed", { error: e?.message || e });
    return { pending: 0, stuck: 0, settledToday: 0 };
  }
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

// Users who have at least one active Deriv token — the reconciler sweep bound.
export async function getUsersWithActiveTokens(): Promise<number[]> {
  const pool = getRawPool();
  if (pool) {
    try {
      const [rows] = await pool.execute("SELECT DISTINCT userId FROM derivTokens WHERE isActive = TRUE");
      return (rows as any[]).map((r) => Number(r.userId));
    } catch (e: any) {
      logger.error("getUsersWithActiveTokens raw failed", { error: e?.message || e });
    }
  }
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.selectDistinct({ userId: derivTokens.userId }).from(derivTokens).where(eq(derivTokens.isActive, true));
    return rows.map((r) => r.userId);
  } catch (e: any) {
    logger.error("getUsersWithActiveTokens drizzle failed", { error: e?.message || e });
    return [];
  }
}

// Reconstruct a missing ledger row from a Deriv portfolio contract. Idempotent:
// saveTrade dedups on (userId, contractId) via the in-process mutex + (with M0's
// unique index) the DB itself, so a concurrent fill path can't double-insert.
export async function reconstructTradeFromContract(userId: number, contract: PortfolioContractInput): Promise<{ trade: Trade | null; existed: boolean }> {
  const now = new Date();
  const entryTime = contract.purchasedAt != null ? new Date(contract.purchasedAt * 1000) : now;
  try {
    const trade = await saveTrade({
      userId,
      symbol: contract.symbol || "R_100",
      contractType: contract.contractType || "CALL",
      stake: String(contract.stake || "0"),
      entryPrice: String(contract.entryPrice || "0"),
      contractId: String(contract.contractId),
      result: contract.isSold ? (contract.profit >= 0 ? "win" : "loss") : "pending",
      profitLoss: contract.isSold ? contract.profit.toFixed(8) : undefined,
      entryTime,
      exitTime: contract.isSold && contract.soldAt != null ? new Date(contract.soldAt * 1000) : undefined,
      source: contract.source || "reconcile",
      discoveredAt: now,
      reconciled: true,
    } as InsertTrade & { source?: string; discoveredAt?: Date; reconciled?: boolean });
    return { trade, existed: false };
  } catch (e: any) {
    // Duplicate key (contract already recorded) → report as existed.
    if (e?.errno === 1062 || /Duplicate/i.test(e?.message || "")) {
      const existing = await getTradeByContractId(userId, String(contract.contractId));
      return { trade: existing || null, existed: true };
    }
    throw e;
  }
}

export async function getTradeByContractId(userId: number, contractId: string): Promise<Trade | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    return (await db.select().from(trades).where(and(eq(trades.userId, userId), eq(trades.contractId, contractId))).limit(1))[0];
  } catch {
    const pool = getRawPool();
    if (!pool) return undefined;
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, source, discoveredAt, reconciled, updatedAt FROM trades WHERE userId=? AND contractId=? LIMIT 1",
        [userId, contractId],
      );
      return (rows as any[])[0] || undefined;
    } catch {
      return undefined;
    }
  }
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
    logger.warn("saveStrategy Drizzle insert failed, trying raw fallback", { userId: strategy.userId, name: strategy.name, error: e1?.message || e1 });
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
      logger.error("saveStrategy raw fallback also failed", { userId: strategy.userId, error: e2?.message || e2 });
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

/** Published strategies enriched with audited ledger stats (usage, win-rate, PnL). */
export async function getPublishedStrategiesWithStats(): Promise<Array<Strategy & { stats: { usageCount: number; wins: number; losses: number; totalPnl: number; winRatePct: number } }>> {
  const base = await getPublishedStrategies();
  if (base.length === 0) return [];
  const ids = base.map((s) => s.id);
  const pool = getRawPool();
  const empty = { usageCount: 0, wins: 0, losses: 0, totalPnl: 0, winRatePct: 0 };
  if (pool) {
    try {
      const [rows] = await pool.execute(
        `SELECT strategyId, COUNT(*) AS usageCount,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,
           COALESCE(SUM(profitLoss), 0) AS totalPnl
         FROM trades WHERE strategyId IS NOT NULL AND strategyId IN (${ids.map(() => "?").join(",")})
         GROUP BY strategyId`,
        ids,
      );
      const byId = new Map<number, any>((rows as any[]).map((r) => [Number(r.strategyId), r]));
      return base.map((s) => {
        const r = byId.get(s.id);
        if (!r) return { ...s, stats: empty };
        const wins = Number(r.wins || 0);
        const losses = Number(r.losses || 0);
        return {
          ...s,
          stats: {
            usageCount: Number(r.usageCount || 0),
            wins,
            losses,
            totalPnl: Number(r.totalPnl || 0),
            winRatePct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
          },
        };
      });
    } catch {
      return base.map((s) => ({ ...s, stats: empty }));
    }
  }
  const db = await getDb();
  if (!db) return base.map((s) => ({ ...s, stats: empty }));
  try {
    const rows = await db
      .select({
        strategyId: trades.strategyId,
        usageCount: sql<number>`COUNT(*)`,
        wins: sql<number>`SUM(CASE WHEN ${trades.result} = 'win' THEN 1 ELSE 0 END)`,
        losses: sql<number>`SUM(CASE WHEN ${trades.result} = 'loss' THEN 1 ELSE 0 END)`,
        totalPnl: sql<number>`COALESCE(SUM(${trades.profitLoss}), 0)`,
      })
      .from(trades)
      .where(and(sql`${trades.strategyId} IS NOT NULL`, inArray(trades.strategyId, ids)))
      .groupBy(trades.strategyId);
    const byId = new Map(rows.map((r) => [Number(r.strategyId), r]));
    return base.map((s) => {
      const r = byId.get(s.id);
      if (!r) return { ...s, stats: empty };
      const wins = Number(r.wins || 0);
      const losses = Number(r.losses || 0);
      return {
        ...s,
        stats: {
          usageCount: Number(r.usageCount || 0),
          wins,
          losses,
          totalPnl: Number(r.totalPnl || 0),
          winRatePct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
        },
      };
    });
  } catch {
    return base.map((s) => ({ ...s, stats: empty }));
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
        "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, symbol, contractType, result, contractId, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
          (trade as any).source ?? null,
        ],
      );
      id = (r as any).insertId;
    } catch (e2: any) {
      if (e2?.errno !== 1054 && e2?.code !== "ER_BAD_FIELD_ERROR") throw e2;
      // try without symbol (schema may be missing it)
      try {
        const [r] = await pool.execute(
          "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            (trade as any).source ?? null,
          ],
        );
        id = (r as any).insertId;
      } catch (e3: any) {
        if (e3?.errno !== 1054 && e3?.code !== "ER_BAD_FIELD_ERROR") throw e3;
        // try without both symbol and contractType
        const [r] = await pool.execute(
          "INSERT INTO trades (userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, result, contractId, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            (trade as any).source ?? null,
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

// Pending trades for a single user (the global getPendingTrades is what the
// SettlementTracker uses; the reconciler needs the per-user subset).
export async function getPendingTradesForUser(userId: number): Promise<Trade[]> {
  const pool = getRawPool();
  if (pool) {
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, source, discoveredAt, reconciled, updatedAt FROM trades WHERE result = 'pending' AND contractId IS NOT NULL AND userId = ? ORDER BY entryTime ASC LIMIT 200",
        [userId],
      );
      return rows as Trade[];
    } catch (e: any) {
      logger.error("getPendingTradesForUser raw failed", { userId, error: e?.message || e });
    }
  }
  const db = await getDb();
  if (!db) throw new Error("DB unavailable: no connection pool");
  try {
    return await db
      .select()
      .from(trades)
      .where(and(eq(trades.result, "pending"), sql`${trades.contractId} IS NOT NULL`, eq(trades.userId, userId)))
      .orderBy(asc(trades.entryTime))
      .limit(200);
  } catch (e: any) {
    logger.error("getPendingTradesForUser drizzle failed", { userId, error: e?.message || e });
    return [];
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
    logger.error("markTradeStuck failed", { tradeId, error: e?.message || e });
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
      .where(and(eq(trades.id, tradeId), eq(trades.result, "pending")));
    const updated = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    return updated[0] || null;
  } catch {
    const pool = getRawPool();
    if (!pool) return null;
    try {
      await pool.execute("UPDATE trades SET result=?, profitLoss=?, exitPrice=?, exitTime=? WHERE id=? AND result='pending'", [
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

export interface TradeFilters {
  symbol?: string;
  result?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function getTradesByUserId(userId: number, limit: number = 50, offset: number = 0, filters?: TradeFilters): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(trades.userId, userId)];
  if (filters) {
    if (filters.symbol) conds.push(eq(trades.symbol, filters.symbol));
    if (filters.result) conds.push(eq(trades.result, filters.result));
    if (filters.dateFrom) conds.push(gt(trades.entryTime, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(trades.entryTime, filters.dateTo));
  }
  try {
    return await db.select().from(trades).where(and(...conds)).orderBy(desc(trades.updatedAt)).limit(limit).offset(offset);
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      let whereSql = "userId=?";
      const params: unknown[] = [userId];
      if (filters) {
        if (filters.symbol) { whereSql += " AND symbol=?"; params.push(filters.symbol); }
        if (filters.result) { whereSql += " AND result=?"; params.push(filters.result); }
        if (filters.dateFrom) { whereSql += " AND entryTime>?"; params.push(filters.dateFrom); }
        if (filters.dateTo) { whereSql += " AND entryTime<=?"; params.push(filters.dateTo); }
      }
      params.push(limit, offset);
      const [rows] = await pool.execute(
        `SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, source, discoveredAt, reconciled, updatedAt FROM trades WHERE ${whereSql} ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
        params,
      );
      return rows as Trade[];
    } catch {
      return [];
    }
  }
}

/** Real trades placed by Digit Trader auto-execute (tagged source=digitTrader). */
export async function getDigitTraderTradesByUserId(userId: number, limit: number = 50): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.source, "digitTrader")))
      .orderBy(desc(trades.entryTime))
      .limit(limit);
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute(
        "SELECT id, userId, botRunId, strategyId, entryTime, exitTime, entryPrice, exitPrice, stake, profitLoss, contractType, result, contractId, source, discoveredAt, reconciled, updatedAt FROM trades WHERE userId=? AND source='digitTrader' ORDER BY entryTime DESC LIMIT ?",
        [userId, limit],
      );
      return rows as Trade[];
    } catch {
      return [];
    }
  }
}

/**
 * Daily placed-trade count and realized P&L for a user's Digit Trader
 * auto-execute (source=digitTrader) since startOfDay. Derived from the trade
 * ledger rather than process-level counters so the maxDailyLoss /
 * maxDailyTrades safety caps can't drift from what the DB actually recorded.
 * Pending rows count toward the trade count (they were placed today) but their
 * outcome isn't known, so P&L only includes settled win/loss/stuck rows.
 */
export async function getDigitTraderDailyUsage(userId: number, startOfDay: Date): Promise<{ trades: number; pnl: number }> {
  const db = await getDb();
  if (!db) return { trades: 0, pnl: 0 };
  try {
    const rows = await db
      .select({
        trades: sql<number>`COUNT(*)`,
        pnl: sql<number>`COALESCE(SUM(CASE WHEN result IN ('win','loss','stuck') AND profitLoss IS NOT NULL THEN profitLoss ELSE 0 END), 0)`,
      })
      .from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.source, "digitTrader"), gte(trades.entryTime, startOfDay)));
    return { trades: Number(rows[0]?.trades || 0), pnl: Number(rows[0]?.pnl || 0) };
  } catch {
    const pool = getRawPool();
    if (!pool) return { trades: 0, pnl: 0 };
    try {
      const [resultRows] = await pool.execute(
        `SELECT COUNT(*) AS trades, COALESCE(SUM(CASE WHEN result IN ('win','loss','stuck') AND profitLoss IS NOT NULL THEN profitLoss ELSE 0 END), 0) AS pnl FROM trades WHERE userId=? AND source='digitTrader' AND entryTime>=?`,
        [userId, startOfDay],
      );
      const row = (resultRows as any[])[0] || {};
      return { trades: Number(row.trades || 0), pnl: Number(row.pnl || 0) };
    } catch {
      return { trades: 0, pnl: 0 };
    }
  }
}

/** Count of still-open (pending) Digit Trader contracts for a user — the per-user concurrency cap reads this each cycle. */
export async function countOpenDigitTraderTrades(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.source, "digitTrader"), eq(trades.result, "pending")));
    return Number(rows[0]?.n || 0);
  } catch {
    const pool = getRawPool();
    if (!pool) return 0;
    try {
      const [resultRows] = await pool.execute(
        "SELECT COUNT(*) AS n FROM trades WHERE userId=? AND source='digitTrader' AND result='pending'",
        [userId],
      );
      return Number((resultRows as any[])[0]?.n || 0);
    } catch {
      return 0;
    }
  }
}

export async function getTradeSymbolsByUserId(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .selectDistinct({ symbol: trades.symbol })
      .from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(asc(trades.symbol));
    return rows.map((r) => r.symbol ?? "R_100");
  } catch {
    const pool = getRawPool();
    if (!pool) return [];
    try {
      const [rows] = await pool.execute(
        "SELECT DISTINCT symbol FROM trades WHERE userId=? AND symbol IS NOT NULL ORDER BY symbol ASC",
        [userId],
      );
      return (rows as { symbol: string }[]).map((r) => r.symbol || "R_100");
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
    logger.error("aiKnowledge insert failed", { error: e?.message || e });
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
  updates: Partial<Pick<InsertBotRun, "status" | "endTime" | "totalTrades" | "totalProfitLoss" | "dailyTrades" | "dailyPnl" | "errorMessage" | "safety" | "lossStreak" | "hasOpenTrade" | "lastError" | "lastDailyReset">>,
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

export async function saveTickHistoryBatch(rows: InsertTickHistory[]): Promise<void> {
  const db = await getDb();
  if (!db || !rows.length) return;
  try {
    await db.insert(tickHistory).values(rows);
  } catch (error) {
    console.error("[tickHistory] batch insert error:", error);
  }
}

export async function getTickHistory(symbol: string, limit: number = 1000, beforeEpoch?: number): Promise<TickHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cond = beforeEpoch ? and(eq(tickHistory.symbol, symbol), lte(tickHistory.epoch, beforeEpoch)) : eq(tickHistory.symbol, symbol);
  return db.select().from(tickHistory).where(cond).orderBy(desc(tickHistory.epoch)).limit(limit);
}

/** Batch tick history: fetch the latest N ticks for multiple symbols in a single query. */
export async function getTickHistoryBatch(symbols: string[], limit: number = 50): Promise<Map<string, TickHistoryRow[]>> {
  const result = new Map<string, TickHistoryRow[]>();
  if (symbols.length === 0) return result;
  const db = await getDb();
  if (!db) return result;
  try {
    const rows = await db.select().from(tickHistory)
      .where(inArray(tickHistory.symbol, symbols))
      .orderBy(desc(tickHistory.epoch));
    // Group by symbol, take only `limit` per symbol
    for (const row of rows) {
      const arr = result.get(row.symbol) || [];
      if (arr.length < limit) arr.push(row);
      result.set(row.symbol, arr);
    }
  } catch {
    // Fallback to individual queries if batch fails
    for (const symbol of symbols) {
      try {
        const ticks = await getTickHistory(symbol, limit);
        result.set(symbol, ticks);
      } catch { /* skip */ }
    }
  }
  return result;
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

export async function ensureTradesStuckResult(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    // The result column is a strict enum without 'stuck', so the SettlementTracker's
    // stuck UPDATE throws "Data truncated ..." and pending trades rot forever
    // (#390001/#390002 were stuck-eligible for 8h and never flipped). Re-create the
    // enum including 'stuck' idempotently; MySQL accepts the existing values in the
    // new definition so this is safe to run on every boot.
    await pool.execute(
      "ALTER TABLE trades MODIFY COLUMN result ENUM('win','loss','pending','stuck') NOT NULL DEFAULT 'pending'",
    );
    console.log("[ensureTradesStuckResult] result column now accepts 'stuck'");
  } catch (e: any) {
    if (e?.code === "ER_DUP_FIELDNAME" || /Duplicate/i.test(e?.message || "")) {
      return;
    }
    console.error("[ensureTradesStuckResult] migration note (non-fatal):", e?.message || e);
  }
}

// Ledger-correctness columns: where a trade came from, when reconciliation saw
// it, and whether the reconciler (or the fill path) has validated it against the
// Deriv portfolio. Added idempotently on boot (MySQL ignores duplicate column).
export async function ensureTradesLedgerColumns(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  const cols = [
    "ADD COLUMN source varchar(32) NULL",
    "ADD COLUMN discoveredAt timestamp NULL",
    "ADD COLUMN reconciled boolean NOT NULL DEFAULT false",
  ];
  for (const col of cols) {
    try {
      await pool.execute(`ALTER TABLE trades ${col}`);
    } catch (e2: any) {
      if (e2?.errno !== 1060 && !e2?.message?.includes("Duplicate column")) {
        console.warn("[ensureTradesLedgerColumns] note", e2?.message || e2);
      }
    }
  }
  console.log("[ensureTradesLedgerColumns] source/discoveredAt/reconciled present");
}

// Unique (userId, contractId) at the DB level. The in-process mutex in saveTrade
// only serializes within one server instance; the unique index makes concurrent
// inserts (client fill + reconciler) safe across instances and restarts.
export async function ensureTradesContractIndex(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    // Preflight: if user rows already contain duplicates we can't add the index
    // without deduping first. Dedup (backup-guarded) then retry the index.
    const [dupes]: any = await pool.execute(
      "SELECT userId, contractId, COUNT(*) c FROM trades WHERE contractId IS NOT NULL AND contractId <> '' GROUP BY userId, contractId HAVING c > 1 ORDER BY c DESC LIMIT 500",
    );
    if (dupes.length > 0) {
      const { archived, deleted, repointed } = await dedupeTradesForUniqueIndex();
      console.log(`[ensureTradesContractIndex] ${dupes.length} duplicate (userId, contractId) groups — deduped (archived=${archived}, deleted=${deleted}, aiKnowledge repointed=${repointed})`);
    }
    await pool.execute(
      "ALTER TABLE trades ADD UNIQUE INDEX uq_trades_user_contract (userId, contractId)",
    );
    console.log("[ensureTradesContractIndex] unique (userId, contractId) index present");
  } catch (e: any) {
    if (e?.errno === 1061 || /Duplicate key name/i.test(e?.message || "")) return;
    console.error("[ensureTradesContractIndex] migration note (non-fatal):", e?.message || e);
  }
}

/**
 * Indexes that keep the hot ledger queries (per-user history, daily caps,
 * settlement sweep) on small row scans instead of full table scans. Runs after
 * the baseline tables exist and ignores duplicate-index errors on re-runs.
 */
export async function ensureTradesQueryIndexes(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  for (const stmt of [
    "ALTER TABLE trades ADD INDEX idx_trades_user_source_entry (userId, source, entryTime)",
    "ALTER TABLE trades ADD INDEX idx_trades_result_entry (result, entryTime)",
  ]) {
    try {
      await pool.execute(stmt);
    } catch (e: any) {
      if (e?.errno === 1061 || /Duplicate key name/i.test(e?.message || "")) continue;
      console.warn("[ensureTradesQueryIndexes] index note (non-fatal):", e?.message || e);
    }
  }
}

// Backup-guarded dedup of duplicate (userId, contractId) rows. These rows are
// literal double-recordings of ONE real Deriv contract (dual-path settlement
// both wrote a row), so removing the surplus and keeping the earliest row only
// corrects the ledger — it does not delete history. Every removed row is
// snapshotted into `tradesDupArchive` for instant rollback, and journal entries
// in aiKnowledge that pointed at a removed row are re-pointed to the survivor.
export async function dedupeTradesForUniqueIndex(): Promise<{ archived: number; deleted: number; repointed: number }> {
  const pool = getRawPool();
  if (!pool) return { archived: 0, deleted: 0, repointed: 0 };
  const conn = await pool.getConnection();
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS tradesDupArchive (
      id bigint AUTO_INCREMENT PRIMARY KEY,
      originalTradeId int NOT NULL,
      userId int NOT NULL,
      contractId varchar(64) NOT NULL,
      keptTradeId int NOT NULL,
      snapshot json NOT NULL,
      archivedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const [dupes]: any = await conn.execute(
      "SELECT userId, contractId, MIN(id) AS keepId, GROUP_CONCAT(id) AS allIds FROM trades WHERE contractId IS NOT NULL AND contractId <> '' GROUP BY userId, contractId HAVING COUNT(*) > 1 LIMIT 500",
    );

    let archived = 0;
    let deleted = 0;
    let repointed = 0;

    for (const g of dupes) {
      const ids = String(g.allIds).split(",").map((s: string) => Number(s));
      const keepId = Number(g.keepId);
      const removeIds = ids.filter((id: number) => id !== keepId);
      if (removeIds.length === 0) continue;
      const inList = removeIds.join(",");

      await conn.beginTransaction();
      try {
        // Snapshot every removed row before it disappears.
        const [rows]: any = await conn.execute(`SELECT * FROM trades WHERE id IN (${inList})`);
        for (const row of rows) {
          await conn.execute(
            "INSERT INTO tradesDupArchive (originalTradeId, userId, contractId, keptTradeId, snapshot) VALUES (?, ?, ?, ?, ?)",
            [row.id, row.userId, row.contractId, keepId, JSON.stringify(row)],
          );
          archived++;
        }
        // Re-point any journal/fill entries that referenced a removed row.
        const sqlAI = await conn.execute(`UPDATE aiKnowledge SET relatedTradeId = ? WHERE relatedTradeId IN (${inList})`, [keepId]);
        repointed += Number((sqlAI as any)[0]?.affectedRows || 0);
        // Remove the surplus rows for this contract.
        const del = await conn.execute(`DELETE FROM trades WHERE id IN (${inList})`);
        deleted += Number((del as any)[0]?.affectedRows || 0);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      }
    }
    return { archived, deleted, repointed };
  } catch (e: any) {
    console.error("[dedupeTradesForUniqueIndex] failed:", e?.message || e);
    return { archived: 0, deleted: 0, repointed: 0 };
  } finally {
    conn.release();
  }
}

export async function ensureReconcilerRunsTable(): Promise<void> {
  const pool = getRawPool();
  if (!pool) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS reconcilerRuns (
      id int AUTO_INCREMENT NOT NULL,
      runStart timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      runEnd timestamp NULL,
      userId int NULL,
      actions json NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT reconcilerRuns_id PRIMARY KEY(id)
    )`);
    console.log("[ensureReconcilerRunsTable] created reconcilerRuns table");
  } catch (e: any) {
    console.error("[ensureReconcilerRunsTable] create failed", e?.message || e);
  }
}

export async function logReconcilerRun(data: {
  runStart: Date;
  runEnd: Date;
  userId?: number;
  actions: Record<string, number>;
}): Promise<void> {
  const pool = getRawPool();
  if (!pool) {
    const db = await getDb();
    if (!db) return;
    try {
      const { reconcilerRuns } = await import("../drizzle/schema");
      await db.insert(reconcilerRuns).values({
        runStart: data.runStart,
        runEnd: data.runEnd,
        userId: data.userId ?? null,
        actions: data.actions,
      } as any);
      return;
    } catch (e: any) { console.error("[logReconcilerRun] drizzle insert failed", e?.message || e); return; }
  }
  try {
    await pool.execute(
      "INSERT INTO reconcilerRuns (runStart, runEnd, userId, actions) VALUES (?, ?, ?, ?)",
      [data.runStart, data.runEnd, data.userId ?? null, JSON.stringify(data.actions)],
    );
  } catch (e: any) {
    console.error("[logReconcilerRun] failed", e?.message || e);
  }
}

export async function getReconcilerRuns(limit: number = 20): Promise<any[]> {
  const pool = getRawPool();
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit || 20)));
  try {
    const [rows] = await pool.execute(
      `SELECT id, runStart, runEnd, userId, actions FROM reconcilerRuns ORDER BY id DESC LIMIT ${safeLimit}`,
    );
    return (rows as any[]).map((r) => ({
      ...r,
      actions: typeof r.actions === "string" ? JSON.parse(r.actions) : r.actions,
    }));
  } catch (e: any) {
    console.error("[getReconcilerRuns] failed", e?.message || e);
    return [];
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
      dailyTrades int NOT NULL DEFAULT 0,
      dailyPnl decimal(18,8) NOT NULL DEFAULT 0,
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
      "ADD COLUMN dailyTrades int NOT NULL DEFAULT 0",
      "ADD COLUMN dailyPnl decimal(18,8) NOT NULL DEFAULT 0",
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

// ---------------------------------------------------------------------------
// AI Concierge — guiding signals, copy trading, strategy gallery stats
// (idempotent ensure* migrations run at boot like the other ensure* helpers)
// ---------------------------------------------------------------------------

export async function ensureGuidingSignalsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS guidingSignals (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        symbol varchar(32) NOT NULL,
        family varchar(32) NOT NULL,
        direction varchar(8) NOT NULL,
        contractType varchar(16),
        barrier varchar(8),
        confidence int NOT NULL,
        strength varchar(8) NOT NULL,
        reasons json NOT NULL,
        entryPrice decimal(18,8),
        entryEpoch bigint NOT NULL,
        windowTicks int NOT NULL,
        stake decimal(18,8),
        status varchar(12) NOT NULL DEFAULT 'open',
        outcomeEpoch bigint,
        generatedAt bigint NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY guidingSignals_userId_status (userId, status),
        KEY guidingSignals_userId_symbol (userId, symbol)
      )
    `);
  } catch (e: any) {
    console.error("[ensureGuidingSignalsTable] failed", e?.message || e);
  }
}

export async function saveGuidingSignal(row: InsertGuidingSignal): Promise<GuidingSignal | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(guidingSignals).values(row);
    const id = (result as any)[0]?.insertId || (result as any).insertId;
    if (!id) return null;
    return (await db.select().from(guidingSignals).where(eq(guidingSignals.id, Number(id))).limit(1))[0] ?? null;
  } catch (e: any) {
    console.error("[saveGuidingSignal] failed", e?.message || e);
    return null;
  }
}

export async function listOpenGuidingSignals(userId: number): Promise<GuidingSignal[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(guidingSignals).where(
      and(eq(guidingSignals.userId, userId), eq(guidingSignals.status, "open")),
    ).orderBy(asc(guidingSignals.entryEpoch)).limit(200);
  } catch {
    return [];
  }
}

export async function listGuidingSignals(userId: number, limit: number = 100): Promise<GuidingSignal[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(guidingSignals).where(eq(guidingSignals.userId, userId))
      .orderBy(desc(guidingSignals.generatedAt)).limit(limit);
  } catch {
    return [];
  }
}

export async function setGuidingSignalOutcome(id: number, status: "win" | "loss" | "expired", outcomeEpoch: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(guidingSignals).set({ status, outcomeEpoch }).where(and(eq(guidingSignals.id, id), eq(guidingSignals.status, "open")));
  } catch (e: any) {
    console.error("[setGuidingSignalOutcome] failed", e?.message || e);
  }
}

export async function guidingSignalAccuracy(userId: number, limit = 250): Promise<{ total: number; wins: number; losses: number; winRatePct: number; byStrength: Record<string, { total: number; wins: number; winRatePct: number }> }> {
  const db = await getDb();
  if (!db) return { total: 0, wins: 0, losses: 0, winRatePct: 0, byStrength: {} };
  try {
    const rows = await db.select().from(guidingSignals)
      .where(and(eq(guidingSignals.userId, userId), eq(guidingSignals.status, "open")))
      .orderBy(desc(guidingSignals.generatedAt)).limit(0);
    void rows;
    const pooled = await listGuidingSignals(userId, limit);
    const settled = pooled.filter((s) => s.status === "win" || s.status === "loss");
    const wins = settled.filter((s) => s.status === "win").length;
    const losses = settled.length - wins;
    const byStrength: Record<string, { total: number; wins: number; winRatePct: number }> = {};
    for (const s of pooled.filter((x) => x.status === "win" || x.status === "loss")) {
      const key = s.strength;
      byStrength[key] = byStrength[key] || { total: 0, wins: 0, winRatePct: 0 };
      byStrength[key].total++;
      if (s.status === "win") byStrength[key].wins++;
    }
    for (const k of Object.keys(byStrength)) {
      byStrength[k].winRatePct = byStrength[k].total > 0 ? Math.round((byStrength[k].wins / byStrength[k].total) * 100) : 0;
    }
    return {
      total: settled.length,
      wins,
      losses,
      winRatePct: settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0,
      byStrength,
    };
  } catch {
    return { total: 0, wins: 0, losses: 0, winRatePct: 0, byStrength: {} };
  }
}

// ---- digit trader reads ----------------------------------------------------

export async function ensureDigitReadsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS digitReads (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        symbol varchar(32) NOT NULL,
        readType varchar(8) NOT NULL,
        barrier int,
        label varchar(24) NOT NULL,
        confidence int NOT NULL,
        strength varchar(8) NOT NULL,
        sample int NOT NULL,
        freq decimal(6,2) NOT NULL,
        baseline decimal(6,2) NOT NULL,
        deltaPp decimal(6,2) NOT NULL,
        reasons json NOT NULL,
        decisionEpoch bigint NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'open',
        outcomeEpoch bigint,
        generatedAt bigint NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY digitReads_userId_status (userId, status),
        KEY digitReads_userId_symbol (userId, symbol)
      )
    `);
  } catch (e: any) {
    console.error("[ensureDigitReadsTable] failed", e?.message || e);
  }
}

export async function saveDigitRead(row: InsertDigitRead): Promise<DigitRead | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(digitReads).values(row);
    const id = (result as any)[0]?.insertId || (result as any).insertId;
    if (!id) return null;
    return (await db.select().from(digitReads).where(eq(digitReads.id, Number(id))).limit(1))[0] ?? null;
  } catch (e: any) {
    console.error("[saveDigitRead] failed", e?.message || e);
    return null;
  }
}

/** Open reads within the dedup window, optionally filtered by symbol. */
export async function listOpenDigitReads(userId: number, symbol?: string, sinceEpoch = 0): Promise<DigitRead[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const conds = [eq(digitReads.userId, userId), eq(digitReads.status, "open")];
    if (symbol) conds.push(eq(digitReads.symbol, symbol));
    if (sinceEpoch > 0) conds.push(gt(digitReads.generatedAt, sinceEpoch));
    return await db.select().from(digitReads).where(and(...conds))
      .orderBy(asc(digitReads.decisionEpoch)).limit(200);
  } catch {
    return [];
  }
}

export async function listDigitReads(userId: number, limit: number = 100): Promise<DigitRead[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(digitReads).where(eq(digitReads.userId, userId))
      .orderBy(desc(digitReads.generatedAt)).limit(limit);
  } catch {
    return [];
  }
}

export async function setDigitReadOutcome(id: number, status: "win" | "loss" | "expired", outcomeEpoch: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(digitReads).set({ status, outcomeEpoch }).where(and(eq(digitReads.id, id), eq(digitReads.status, "open")));
  } catch (e: any) {
    console.error("[setDigitReadOutcome] failed", e?.message || e);
  }
}

export async function digitReadAccuracy(userId: number, limit = 250): Promise<{ total: number; wins: number; losses: number; expired: number; winRatePct: number; byStrength: Record<string, { total: number; wins: number; winRatePct: number }>; bySymbol: Record<string, { symbol: string; total: number; wins: number; winRatePct: number }> }> {
  const db = await getDb();
  if (!db) return { total: 0, wins: 0, losses: 0, expired: 0, winRatePct: 0, byStrength: {}, bySymbol: {} };
  try {
    const pooled = await listDigitReads(userId, limit);
    const settled = pooled.filter((s) => s.status === "win" || s.status === "loss");
    const wins = settled.filter((s) => s.status === "win").length;
    const losses = settled.length - wins;
    const expired = pooled.filter((s) => s.status === "expired").length;
    const byStrength: Record<string, { total: number; wins: number; winRatePct: number }> = {};
    const bySymbol: Record<string, { symbol: string; total: number; wins: number; winRatePct: number }> = {};
    for (const s of settled) {
      const key = s.strength;
      byStrength[key] = byStrength[key] || { total: 0, wins: 0, winRatePct: 0 };
      byStrength[key].total++;
      if (s.status === "win") byStrength[key].wins++;
      const sym = s.symbol || "?";
      bySymbol[sym] = bySymbol[sym] || { symbol: sym, total: 0, wins: 0, winRatePct: 0 };
      bySymbol[sym].total++;
      if (s.status === "win") bySymbol[sym].wins++;
    }
    for (const k of Object.keys(byStrength)) {
      byStrength[k].winRatePct = byStrength[k].total > 0 ? Math.round((byStrength[k].wins / byStrength[k].total) * 100) : 0;
    }
    for (const k of Object.keys(bySymbol)) {
      bySymbol[k].winRatePct = bySymbol[k].total > 0 ? Math.round((bySymbol[k].wins / bySymbol[k].total) * 100) : 0;
    }
    return {
      total: settled.length,
      wins,
      losses,
      expired,
      winRatePct: settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0,
      byStrength,
      bySymbol,
    };
  } catch {
    return { total: 0, wins: 0, losses: 0, expired: 0, winRatePct: 0, byStrength: {}, bySymbol: {} };
  }
}

export interface DigitReadCalibration {
  total: number; // settled reads scored
  brierScore: number | null; // null when nothing settled yet
  buckets: CalibrationBucket[];
}

/**
 * Reliability calibration for the Digit Trader prediction ledger: do stated
 * confidence percentages match observed win rates? Buckets settled reads by
 * their stated confidence and compares each against the observed rate with a
 * Wilson 95% CI, plus an overall Brier score (lower is better, 0.25 = chance
 * for a 50/50 contract).
 */
export async function digitReadCalibration(userId: number, limit = 500): Promise<DigitReadCalibration> {
  const empty: DigitReadCalibration = { total: 0, brierScore: null, buckets: [] };
  const db = await getDb();
  if (!db) return empty;
  try {
    const pooled = await listDigitReads(userId, limit);
    const settled = pooled.filter((s) => (s.status === "win" || s.status === "loss") && typeof s.confidence === "number");
    if (settled.length === 0) return empty;
    return calibrateConfidence(settled.map((s) => ({ confidence: s.confidence, win: s.status === "win" })));
  } catch {
    return empty;
  }
}

// ---- strategy gallery stats ----------------------------------------------

export async function ensureStrategyStatsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS strategyStats (
        id int NOT NULL AUTO_INCREMENT,
        strategyId int NOT NULL,
        usageCount int NOT NULL DEFAULT 0,
        wins int NOT NULL DEFAULT 0,
        losses int NOT NULL DEFAULT 0,
        totalPnl decimal(18,8) NOT NULL DEFAULT 0,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY strategyStats_strategyId (strategyId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureStrategyStatsTable] failed", e?.message || e);
  }
}

export async function recordStrategyStat(strategyId: number, result: string | null | undefined, pnl: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const winsDelta = result === "win" ? 1 : 0;
  const lossesDelta = result === "loss" ? 1 : 0;
  try {
    await db.execute(sql`
      INSERT INTO strategyStats (strategyId, usageCount, wins, losses, totalPnl)
      VALUES (${strategyId}, 1, ${winsDelta}, ${lossesDelta}, ${pnl})
      ON DUPLICATE KEY UPDATE
        usageCount = usageCount + 1,
        wins = wins + ${winsDelta},
        losses = losses + ${lossesDelta},
        totalPnl = totalPnl + ${pnl},
        updatedAt = CURRENT_TIMESTAMP
    `);
  } catch (e: any) {
    console.error("[recordStrategyStat] failed", e?.message || e);
  }
}

export async function getStrategyStats(strategyId: number): Promise<{ usageCount: number; wins: number; losses: number; totalPnl: number; winRatePct: number } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.execute(sql`SELECT * FROM strategyStats WHERE strategyId = ${strategyId}`);
    const row = Array.isArray(rows) ? (rows as any[])[0] : (rows as any)?.rows?.[0];
    if (!row) return null;
    const wins = Number(row.wins || 0);
    const losses = Number(row.losses || 0);
    return {
      usageCount: Number(row.usageCount || 0),
      wins,
      losses,
      totalPnl: Number(row.totalPnl || 0),
      winRatePct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
    };
  } catch {
    return null;
  }
}

// ---- copy trading ---------------------------------------------------------

export async function ensureCopyRelationsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS copyRelations (
        id int NOT NULL AUTO_INCREMENT,
        followerUserId int NOT NULL,
        leaderUserId int NOT NULL,
        stakeMultiplier decimal(10,4) NOT NULL DEFAULT 1,
        maxStake decimal(18,8),
        active boolean NOT NULL DEFAULT TRUE,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY copyRelations_pair (followerUserId, leaderUserId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureCopyRelationsTable] failed", e?.message || e);
  }
}

export async function ensureCopyMirrorsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS copyMirrors (
        id int NOT NULL AUTO_INCREMENT,
        leaderUserId int NOT NULL,
        followerUserId int NOT NULL,
        sourceTradeId int NOT NULL,
        mirroredTradeId int,
        symbol varchar(32) NOT NULL,
        contractType varchar(16) NOT NULL,
        stake decimal(18,8) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'mirrored',
        reason varchar(64),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY copyMirrors_source_follower (sourceTradeId, followerUserId),
        KEY copyMirrors_follower (followerUserId)
      )
    `);
  } catch (e: any) {
    console.error("[ensureCopyMirrorsTable] failed", e?.message || e);
  }
}

export async function saveCopyRelation(rel: InsertCopyRelation): Promise<CopyRelation | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(copyRelations).values(rel);
    const id = (result as any)[0]?.insertId || (result as any).insertId;
    return id ? (await db.select().from(copyRelations).where(eq(copyRelations.id, Number(id))).limit(1))[0] ?? null : null;
  } catch (e: any) {
    console.error("[saveCopyRelation] failed", e?.message || e);
    return null;
  }
}

export async function listCopyRelationsForFollower(followerUserId: number): Promise<CopyRelation[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(copyRelations).where(eq(copyRelations.followerUserId, followerUserId));
  } catch {
    return [];
  }
}

export async function listRelationsForLeader(leaderUserId: number): Promise<CopyRelation[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(copyRelations).where(
      and(eq(copyRelations.leaderUserId, leaderUserId), eq(copyRelations.active, true)),
    );
  } catch {
    return [];
  }
}

export async function setCopyRelationActive(id: number, followerUserId: number, active: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(copyRelations).set({ active }).where(
      and(eq(copyRelations.id, id), eq(copyRelations.followerUserId, followerUserId)),
    );
  } catch (e: any) {
    console.error("[setCopyRelationActive] failed", e?.message || e);
  }
}

export async function deleteCopyRelation(id: number, followerUserId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete(copyRelations).where(
      and(eq(copyRelations.id, id), eq(copyRelations.followerUserId, followerUserId)),
    );
  } catch (e: any) {
    console.error("[deleteCopyRelation] failed", e?.message || e);
  }
}

export async function didMirror(sourceTradeId: number, followerUserId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const rows = await db.select({ id: copyMirrors.id }).from(copyMirrors)
      .where(and(eq(copyMirrors.sourceTradeId, sourceTradeId), eq(copyMirrors.followerUserId, followerUserId))).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function saveCopyMirror(mirror: InsertCopyMirror): Promise<CopyMirror | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(copyMirrors).values(mirror);
    const id = (result as any)[0]?.insertId || (result as any).insertId;
    return id ? (await db.select().from(copyMirrors).where(eq(copyMirrors.id, Number(id))).limit(1))[0] ?? null : null;
  } catch (e: any) {
    console.error("[saveCopyMirror] failed", e?.message || e);
    return null;
  }
}

export async function listCopyMirrors(followerUserId: number, limit: number = 100): Promise<CopyMirror[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(copyMirrors).where(eq(copyMirrors.followerUserId, followerUserId))
      .orderBy(desc(copyMirrors.createdAt)).limit(limit);
  } catch {
    return [];
  }
}

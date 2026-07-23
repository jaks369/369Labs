import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: text("name"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  twoFASecret: text("twoFASecret"),
  twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
  avatarUrl: text("avatarUrl"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Sessions (for session management & revocation)
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(),
  userAgent: text("userAgent"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

// IP Whitelist (admin-managed)
export const ipWhitelist = mysqlTable("ipWhitelist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ip: varchar("ip", { length: 45 }).notNull(),
  label: text("label"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IpWhitelistEntry = typeof ipWhitelist.$inferSelect;
export type InsertIpWhitelistEntry = typeof ipWhitelist.$inferInsert;

// Deriv API Tokens
export const derivTokens = mysqlTable("derivTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: text("token").notNull(), // Encrypted token
  accountId: varchar("accountId", { length: 64 }),
  accountType: varchar("accountType", { length: 32 }), // e.g., "demo", "real"
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DerivToken = typeof derivTokens.$inferSelect;
export type InsertDerivToken = typeof derivTokens.$inferInsert;

// Trading Strategies
export const strategies = mysqlTable("strategies", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: json("config").notNull(), // JSON config of the strategy blocks
  isActive: boolean("isActive").default(true).notNull(),
  published: boolean("published").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = typeof strategies.$inferInsert;

// Trade History
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botRunId: int("botRunId"),
  strategyId: int("strategyId"),
  entryTime: timestamp("entryTime").notNull(),
  exitTime: timestamp("exitTime"),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 8 }).notNull(),
  exitPrice: decimal("exitPrice", { precision: 18, scale: 8 }),
  stake: decimal("stake", { precision: 18, scale: 8 }).notNull(),
  profitLoss: decimal("profitLoss", { precision: 18, scale: 8 }),
  symbol: varchar("symbol", { length: 32 }).notNull().default("R_100"),
  contractType: varchar("contractType", { length: 32 }).default("CALL"),
  result: varchar("result", { length: 16 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

// Bot execution logs: timestamped messages for each bot run
export const botLogs = mysqlTable("botLogs", {
  id: int("id").autoincrement().primaryKey(),
  botRunId: int("botRunId").notNull(),
  userId: int("userId").notNull(),
  message: text("message").notNull(),
  level: mysqlEnum("level", ["info", "warn", "error"]).default("info").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BotLog = typeof botLogs.$inferSelect;
export type InsertBotLog = typeof botLogs.$inferInsert;

// Bot Runs (for tracking bot execution history)
export const botRuns = mysqlTable("botRuns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  strategyId: int("strategyId").notNull(),
  startTime: timestamp("startTime").defaultNow().notNull(),
  endTime: timestamp("endTime"),
  status: mysqlEnum("status", ["running", "stopped", "error"]).default("running").notNull(),
  totalTrades: int("totalTrades").default(0).notNull(),
  totalProfitLoss: decimal("totalProfitLoss", { precision: 18, scale: 8 }).default("0").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BotRun = typeof botRuns.$inferSelect;
export type InsertBotRun = typeof botRuns.$inferInsert;

// Telegram Settings
export const telegramSettings = mysqlTable("telegramSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  botToken: text("botToken"), // Encrypted Telegram bot token
  chatId: varchar("chatId", { length: 64 }),
  isVerified: boolean("isVerified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramSettings = typeof telegramSettings.$inferSelect;
export type InsertTelegramSettings = typeof telegramSettings.$inferInsert;

// Notification Settings
export const notificationSettings = mysqlTable("notificationSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  emailEnabled: boolean("emailEnabled").default(true).notNull(),
  tradeExecuted: boolean("tradeExecuted").default(true).notNull(),
  takeProfitHit: boolean("takeProfitHit").default(true).notNull(),
  stopLossHit: boolean("stopLossHit").default(true).notNull(),
  botError: boolean("botError").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

// Tick history (persistent last-digit + price history per symbol)
export const tickHistory = mysqlTable("tickHistory", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  lastDigit: int("lastDigit").notNull(),
  epoch: bigint("epoch", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TickHistoryRow = typeof tickHistory.$inferSelect;
export type InsertTickHistory = typeof tickHistory.$inferInsert;

// AI-discovered trading signals (the "Marketplace" / AI Insights feed)
export const signals = mysqlTable("signals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  // StrategyRule-compatible rule so the signal is directly backtestable / deployable
  rule: json("rule").notNull(),
  // Evidence: the tick window the pattern was found in (epochs + prices + lastDigits)
  evidence: json("evidence").notNull(),
  patternType: varchar("patternType", { length: 32 }).notNull(),
  sampleSize: int("sampleSize").notNull(),
  winRate: decimal("winRate", { precision: 5, scale: 2 }).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  discoveredAt: bigint("discoveredAt", { mode: "number" }).notNull(),
  startEpoch: bigint("startEpoch", { mode: "number" }).notNull(),
  endEpoch: bigint("endEpoch", { mode: "number" }).notNull(),
  source: varchar("source", { length: 16 }).notNull().default("watch"), // "watch" | "always-on"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

// Audit log: who changed what and when (token add, strategy edit, bot start/stop, SL change).
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 48 }).notNull(), // e.g. "token.add", "strategy.create", "bot.start", "bot.stop", "strategy.edit", "sl.change"
  target: varchar("target", { length: 64 }), // strategy id, bot id, etc.
  detail: json("detail"), // before/after snapshot where relevant
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// AI Memory: persistent user preferences/context so agents remember trader profile
// (favorite symbols, risk %, no-martingale rule, trading style, notes). Keyed per user.
export const userMemory = mysqlTable("userMemory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // JSON blob of remembered preferences, e.g.
  // { symbols: ["R_75"], riskPct: 2, noMartingale: true, style: "volatility 1m", notes: "" }
  memory: json("memory").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserMemory = typeof userMemory.$inferSelect;
export type InsertUserMemory = typeof userMemory.$inferInsert;

// Plugin registry: community-contributed extensions that hook into the OS.
export const plugins = mysqlTable("plugins", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  description: text("description"),
  author: varchar("author", { length: 128 }),
  hook: varchar("hook", { length: 64 }), // e.g. "onTrade", "onSignal", "onBotStart"
  config: json("config"), // default configuration for the plugin
  enabledByDefault: boolean("enabled_by_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = typeof plugins.$inferInsert;

// Which plugins a given user has installed/enabled.
export const pluginInstalls = mysqlTable("plugin_installs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pluginId: int("pluginId").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  installedAt: timestamp("installed_at").defaultNow().notNull(),
});

export type PluginInstall = typeof pluginInstalls.$inferSelect;
export type InsertPluginInstall = typeof pluginInstalls.$inferInsert;

// One-shot scheduled task queue (used by plugins / workflows).
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  payload: json("payload"),
  status: mysqlEnum("status", ["pending", "done", "failed"]).default("pending").notNull(),
  runAt: bigint("runAt", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// Password reset tokens (store hashed token + expiry; verified on reset)
export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 96 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Price alerts: user-defined triggers when a symbol reaches a target price
export const priceAlerts = mysqlTable("priceAlerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["above", "below"]).notNull(),
  targetPrice: decimal("targetPrice", { precision: 18, scale: 8 }).notNull(),
  status: mysqlEnum("status", ["active", "triggered", "disabled"]).default("active").notNull(),
  triggeredAt: timestamp("triggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

// Email verification tokens (used to verify email after signup)
export const verificationTokens = mysqlTable("verificationTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 96 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type InsertVerificationToken = typeof verificationTokens.$inferInsert;

// OAuth accounts (Google, GitHub, etc.)
export const oauthAccounts = mysqlTable("oauthAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerId: varchar("providerId", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  name: text("name"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type InsertOAuthAccount = typeof oauthAccounts.$inferInsert;

// Persisted 369AI chat history per user+chat
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  chatId: varchar("chatId", { length: 64 }).notNull().default("main"),
  role: varchar("role", { length: 16 }).notNull(), // "user" | "ai"
  content: text("content").notNull(),
  steps: json("steps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// AI Knowledge: persistent storage for AI-generated insights (trade reviews, strategy reviews, accuracy logs, market patterns)
export const aiKnowledge = mysqlTable("aiKnowledge", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  knowledgeType: varchar("knowledgeType", { length: 32 }).notNull(),
  symbol: varchar("symbol", { length: 32 }),
  data: json("data"),
  source: varchar("source", { length: 32 }),
  confidence: varchar("confidence", { length: 8 }),
  relatedTradeId: int("relatedTradeId"),
  relatedStrategyId: int("relatedStrategyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiKnowledge = typeof aiKnowledge.$inferSelect;
export type InsertAiKnowledge = typeof aiKnowledge.$inferInsert;

export type AiKnowledgeResult = AiKnowledge;

// Webhooks: external URL callbacks for notification events
export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  events: json("events").notNull(),
  label: varchar("label", { length: 64 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

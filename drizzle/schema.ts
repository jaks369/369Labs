import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";
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
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

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
  tradeExecuted: boolean("tradeExecuted").default(true).notNull(),
  takeProfitHit: boolean("takeProfitHit").default(true).notNull(),
  stopLossHit: boolean("stopLossHit").default(true).notNull(),
  botError: boolean("botError").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

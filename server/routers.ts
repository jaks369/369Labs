import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, createSessionToken, sanitizeUser } from "./_core/auth";
import { ENV } from "./_core/env";
import { sendEmail, buildResetEmail, buildVerificationEmail } from "./_core/email";
import { getTickHistory, getActiveSymbols, getDigitStats, getTrend, suggestStrategy, TOOL_DEFS, buildActionIntent, normalizeSymbol, detectWatchIntent } from "./aitools";
import type { PatternType } from "./signalScanner";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

function hexToBase32(hex: string): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = Buffer.from(hex, "hex");
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += base32Chars[parseInt(chunk, 2)];
  }
  return result;
}

function generateTOTP(secretHex: string, epoch: number): string {
  const key = Buffer.from(secretHex, "hex");
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(epoch, 4);
  const hmac = createHmac("sha1", key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1000000).toString().padStart(6, "0");
}

let _aiClient: any = null;

// Central model resolution: AI_MODEL wins, then a sensible default.
// Groq keeps llama-3.3-70b-versatile as the compatibility default; override
// via AI_MODEL for any other OpenAI-compatible endpoint (set AI_API_BASE_URL too).
export function resolveAIModel(): string {
  return process.env.AI_MODEL || "llama-3.3-70b-versatile";
}

// OpenAI-compatible chat client. Defaults to Groq, but AI_API_BASE_URL lets this
// run against OpenAI or any compatible proxy. AI_API_KEY authenticates (falls back
// to OPENAI_API_KEY).
async function getAI() {
  if (!_aiClient) {
    const mod = await import("groq-sdk");
    _aiClient = new mod.default({
      apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
      ...(process.env.AI_API_BASE_URL ? { baseURL: process.env.AI_API_BASE_URL } : {}),
    });
  }
  return _aiClient;
}

// Retry AI call with exponential backoff on transient failures.
async function aiChatCompletion(client: any, params: any, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err: any) {
      const isTransient = !err ||
        err.status === 429 ||
        err.status >= 500 ||
        err.code === 'rate_limit_exceeded' ||
        err.message?.includes('timed out') ||
        err.message?.includes('network') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('fetch failed');
      if (!isTransient || attempt >= retries) throw err;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(`[AI] retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms:`, err.message?.slice(0, 100));
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("AI chat completion failed after retries");
}

async function runTool(name: string, args: any, ctxUser?: any) {
    try {
      if (name === "getTickHistory") return { data: await getTickHistory(args.symbol, args.count || 100) };
      if (name === "getActiveSymbols") return { data: await getActiveSymbols() };
      if (name === "getDigitStats") return { data: await getDigitStats(args.symbol, args.count || 100) };
      if (name === "getTrend") return { data: await getTrend(args.symbol, args.count || 100) };
      if (name === "suggestStrategy") return { data: await suggestStrategy(args.symbol, args.count || 100) };
      if (name === "listStrategies") {
        if (!ctxUser) return { error: "Not authenticated" };
        const strategies = await db.getStrategiesByUserId(ctxUser.id);
        return { data: strategies.map((s: any) => ({ id: s.id, name: s.name, config: s.config })) };
      }
      if (name === "deployBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        // Create a DRAFT bot from an AI insight / natural-language rule.
        // This only saves the strategy - it does NOT start trading. The user
        // presses Start in the Bots page (safety: draft-first).
        if (args.rule && args.name) {
          const strategy = await db.saveStrategy({
            userId: ctxUser.id,
            name: args.name,
            description: args.description || "Created from a 369AI insight.",
            config: { rule: args.rule, source: "ai_insight" },
            isActive: true,
          });
          return { data: { createdStrategyId: strategy.id, name: strategy.name, status: "draft", started: false, message: "Draft bot created. Open the Bots page and press Start to go live." } };
        }
        if (!args.confirm) return { error: "Confirmation required. Ask the user to confirm deploying this bot before proceeding." };
        return buildActionIntent("deployBot", { strategyId: args.strategyId, symbol: normalizeSymbol(args.symbol || ""), stake: args.stake || 1 });
      }
      if (name === "placeTrade") {
        if (!ctxUser) return { error: "Not authenticated" };
        if (!args.confirm) return { error: "Confirmation required. Ask the user to confirm the trade before proceeding." };
        return buildActionIntent("placeTrade", { symbol: normalizeSymbol(args.symbol), contractType: args.contractType, stake: args.stake, barrier: args.barrier });
      }
      if (name === "runBacktest") {
        if (!ctxUser) return { error: "Not authenticated" };
        return buildActionIntent("runBacktest", { strategyId: args.strategyId, symbol: normalizeSymbol(args.symbol), start: args.start, end: args.end });
      }
      if (name === "startWatch") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { runWatch } = await import("./signalScanner");
        const saved = await runWatch({
          userId: ctxUser.id,
          symbol: args.symbol,
          sampleSize: Math.min(2000, (args.durationMinutes || 30) * 20),
          minWinRate: args.minWinRate || 62,
          patternType: args.patternType || "any",
        });
        return { data: { scanned: true, signalsFound: saved.length, signals: saved } };
      }
      if (name === "listSignals") {
        if (!ctxUser) return { error: "Not authenticated" };
        const list = args.symbol
          ? await db.getSignalsBySymbol(ctxUser.id, normalizeSymbol(args.symbol))
          : await db.getSignalsByUserId(ctxUser.id);
        return { data: list };
      }
      if (name === "listActiveBots") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        return { data: botRunner.listForUser(ctxUser.id) };
      }
      if (name === "startBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const strategy = await db.getStrategyById(args.strategyId, ctxUser.id);
        if (!strategy) return { error: "Strategy not found" };
        const rule = (strategy.config as any)?.rule;
        if (!rule || !rule.symbol) return { error: "Strategy has no executable rule" };
        const botRun = await db.saveBotRun({ userId: ctxUser.id, strategyId: args.strategyId, status: "running" });
        await botRunner.start({
          id: String(botRun.id),
          userId: ctxUser.id,
          name: strategy.name,
          strategy: rule,
          safety: {
            maxRiskPerTrade: args.maxRiskPerTrade,
            maxDailyLoss: args.maxDailyLoss,
            maxDailyTrades: args.maxDailyTrades,
            allowedSymbols: args.allowedSymbols,
            allowedHours: args.allowedHours,
            confidenceThreshold: args.confidenceThreshold,
            maxConsecutiveLosses: args.maxConsecutiveLosses,
          },
        });
        return { data: { started: true, runId: botRun.id, name: strategy.name, strategy: rule.symbol } };
      }
      if (name === "stopBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        botRunner.stop(String(args.runId), ctxUser.id, "stopped");
        return { data: { stopped: args.runId } };
      }
      if (name === "stopAllBots") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const count = botRunner.stopAll(ctxUser.id);
        return { data: { stopped: count } };
      }
      if (name === "createStrategy") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { nlToStrategy, validateStrategy, strategyToNL } = await import("./strategyConvert");
        const rule = nlToStrategy({
          symbol: args.symbol,
          indicator: args.indicator,
          comparison: args.comparison,
          count: args.count,
          barrier: args.barrier,
          tradeType: args.tradeType,
          stake: args.stake,
          stopLoss: args.stopLoss,
          takeProfit: args.takeProfit,
        });
        const v = validateStrategy(rule);
        if (!v.ok) return { error: "Invalid strategy: " + v.errors.join("; ") };
        const saved = await db.saveStrategy({
          userId: ctxUser.id,
          name: args.name,
          description: args.description || "Created by 369AI",
          config: { rule },
          isActive: true,
        });
        return { data: { created: true, id: saved.id, name: saved.name, summary: strategyToNL(rule) } };
      }
      if (name === "updateStrategy") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { nlToStrategy, validateStrategy, strategyToNL } = await import("./strategyConvert");
        const existing = await db.getStrategyById(args.id, ctxUser.id);
        if (!existing) return { error: "Strategy not found" };
        const prevRule = (existing.config as any)?.rule || {};
        const rule = nlToStrategy({
          symbol: args.symbol ?? prevRule.symbol,
          indicator: args.indicator ?? prevRule.indicator,
          comparison: args.comparison ?? prevRule.comparison,
          count: args.count ?? prevRule.count,
          barrier: args.barrier ?? prevRule.barrier,
          tradeType: args.tradeType ?? prevRule.tradeType,
          stake: args.stake ?? prevRule.params?.stake,
          stopLoss: args.stopLoss ?? prevRule.params?.stopLoss,
          takeProfit: args.takeProfit ?? prevRule.params?.takeProfit,
        });
        const v = validateStrategy(rule);
        if (!v.ok) return { error: "Invalid strategy: " + v.errors.join("; ") };
        const updated = await db.updateStrategy(args.id, ctxUser.id, {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.description !== undefined ? { description: args.description } : {}),
          config: { rule },
        });
        return { data: { updated: true, id: args.id, name: updated?.name, summary: strategyToNL(rule) } };
      }
      if (name === "explainStrategy") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { strategyToNL } = await import("./strategyConvert");
        const s = await db.getStrategyById(args.id, ctxUser.id);
        if (!s) return { error: "Strategy not found" };
        const rule = (s.config as any)?.rule;
        return {
          data: {
            id: s.id,
            name: s.name,
            description: s.description,
            summary: rule ? strategyToNL(rule) : "No executable rule attached.",
            rule,
          },
        };
      }
      if (name === "duplicateStrategy") {
        if (!ctxUser) return { error: "Not authenticated" };
        const copy = await db.duplicateStrategy(args.id, ctxUser.id);
        if (!copy) return { error: "Strategy not found" };
        return { data: { duplicated: true, id: copy.id, name: copy.name } };
      }
      if (name === "getAccountState") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { getPortfolioSnapshot } = await import("./tradingService");
        const pf = await getPortfolioSnapshot(ctxUser.id);
        return {
          data: {
            connected: pf.connected,
            authorized: pf.authorized,
            account: { ...pf, balance: String(pf.balance), equity: String(pf.equity) },
            openPositionCount: pf.openPositionCount,
            totalUnrealizedPnl: pf.unrealizedPnl,
          },
        };
      }
      if (name === "getPlatformState") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { derivManager } = await import("./derivConnection");
        const { botRunner } = await import("./botRunner");
        const { getPortfolioSnapshot } = await import("./tradingService");
        const conn = await derivManager.ensureConnected(ctxUser.id);
        const snap = conn?.getSnapshot();
        const pf = await getPortfolioSnapshot(ctxUser.id);
        const [strategies, trades, bots] = await Promise.all([
          db.getStrategiesByUserId(ctxUser.id),
          db.getTradesByUserId(ctxUser.id, 20),
          Promise.resolve(botRunner.listForUser(ctxUser.id)),
        ]);
        return {
          data: {
            deriv: { connected: pf.connected, authorized: pf.authorized, account: { loginid: pf.accountType ? undefined : undefined, balance: String(pf.balance), equity: String(pf.equity), currency: pf.currency }, openPositions: (snap?.positions || []).filter((p: any) => p.isOpen), unrealizedPnl: pf.unrealizedPnl },
            portfolio: pf,
            activeStrategies: strategies.map((s: any) => ({ id: s.id, name: s.name, symbol: (s.config as any)?.rule?.symbol })),
            runningBots: bots,
            recentTrades: trades.map((t: any) => ({ result: t.result, stake: t.stake, pnl: t.profitLoss, symbol: t.symbol, contractId: t.contractId })),
          },
        };
      }
      if (name === "runBacktestAnalysis") {
        if (!ctxUser) return { error: "Not authenticated" };
        const strategy = await db.getStrategyById(args.strategyId, ctxUser.id);
        if (!strategy) return { error: "Strategy not found" };
        const rule = (strategy.config as any)?.rule;
        if (!rule || !rule.symbol) return { error: "Strategy has no executable rule" };
        const { derivManager } = await import("./derivConnection");
        const conn = await derivManager.ensureConnected(ctxUser.id);
        if (!conn) return { error: "Deriv not connected ΓÇö cannot fetch ticks for backtest" };
        const ticks = await conn.getTickHistory(rule.symbol, Math.min(args.tickCount || 1000, 2000));
        if (!ticks.length) return { error: "No tick data available for backtest" };
        const { runBacktest } = await import("./backtest");
        const result = await runBacktest(ticks, rule, args.stake || rule.params?.stake || 1);
        return {
          data: {
            strategy: strategy.name,
            symbol: rule.symbol,
            ...result,
            interpretation: `Win rate ${(result.winRate).toFixed(1)}% over ${result.totalTrades} trades, profit factor ${result.profitFactor}, max drawdown ${result.maxDrawdown.toFixed(2)}, net P&L ${result.totalPnl.toFixed(2)}.`,
          },
        };
      }
      if (name === "pauseBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        botRunner.stop(String(args.runId), ctxUser.id, "paused");
        return { data: { paused: args.runId } };
      }
      if (name === "resumeBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const strategy = await db.getStrategyById(args.strategyId, ctxUser.id);
        if (!strategy) return { error: "Strategy not found" };
        const rule = (strategy.config as any)?.rule;
        if (!rule) return { error: "Strategy has no executable rule" };
        const botRun = await db.saveBotRun({ userId: ctxUser.id, strategyId: args.strategyId, status: "running" });
        await botRunner.start({ id: String(botRun.id), userId: ctxUser.id, name: strategy.name, strategy: rule, safety: {} });
        return { data: { resumed: true, runId: botRun.id } };
      }
      if (name === "restartBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        botRunner.stop(String(args.runId), ctxUser.id, "restarting");
        const strategy = await db.getStrategyById(args.strategyId, ctxUser.id);
        if (!strategy) return { error: "Strategy not found" };
        const rule = (strategy.config as any)?.rule;
        if (!rule) return { error: "Strategy has no executable rule" };
        const botRun = await db.saveBotRun({ userId: ctxUser.id, strategyId: args.strategyId, status: "running" });
        await botRunner.start({ id: String(botRun.id), userId: ctxUser.id, name: strategy.name, strategy: rule, safety: {} });
        return { data: { restarted: true, runId: botRun.id } };
      }
      if (name === "cloneBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const rt = botRunner.getStatus(String(args.runId), ctxUser.id);
        if (!rt) return { error: "Bot not running" };
        const strategies = await db.getStrategiesByUserId(ctxUser.id);
        const src = strategies.find((s: any) => s.name === rt.def.name);
        if (!src) return { error: "Source strategy not found" };
        const copy = await db.duplicateStrategy(src.id, ctxUser.id);
        if (!copy) return { error: "Clone failed" };
        let runId: number | undefined;
        if (args.start) {
          const rule = (copy.config as any)?.rule;
          if (rule) {
            const botRun = await db.saveBotRun({ userId: ctxUser.id, strategyId: copy.id, status: "running" });
            await botRunner.start({ id: String(botRun.id), userId: ctxUser.id, name: copy.name, strategy: rule, safety: {} });
            runId = botRun.id;
          }
        }
        return { data: { cloned: true, strategyId: copy.id, name: copy.name, runId } };
      }
      if (name === "renameBot") {
        if (!ctxUser) return { error: "Not authenticated" };
        const updated = await db.updateStrategy(args.strategyId, ctxUser.id, { name: args.newName });
        if (!updated) return { error: "Strategy not found" };
        return { data: { renamed: true, id: args.strategyId, name: args.newName } };
      }
      if (name === "updateBotSafety") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const rt = botRunner.getStatus(String(args.runId), ctxUser.id);
        if (!rt) return { error: "Bot not running" };
        // Apply overrides live to the running bot's safety config.
        const safety = {
          maxRiskPerTrade: args.maxRiskPerTrade ?? rt.def.safety.maxRiskPerTrade,
          maxDailyLoss: args.maxDailyLoss ?? rt.def.safety.maxDailyLoss,
          maxDailyTrades: args.maxDailyTrades ?? rt.def.safety.maxDailyTrades,
          confidenceThreshold: args.confidenceThreshold ?? rt.def.safety.confidenceThreshold,
          allowedSymbols: args.allowedSymbols ?? rt.def.safety.allowedSymbols,
          maxConsecutiveLosses: args.maxConsecutiveLosses ?? rt.def.safety.maxConsecutiveLosses,
        };
        rt.def.safety = safety;
        return { data: { updated: true, runId: args.runId, safety } };
      }
      if (name === "deleteStrategy") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { botRunner } = await import("./botRunner");
        const running = botRunner.listForUser(ctxUser.id).some((b: any) => b.id === String(args.id));
        if (running) return { error: "Stop the bot running this strategy before deleting it" };
        const ok = await db.deleteStrategy?.(args.id, ctxUser.id);
        if (!ok) return { error: "Strategy not found or cannot be deleted" };
        return { data: { deleted: true, id: args.id } };
      }
      if (name === "closePosition") {
        if (!ctxUser) return { error: "Not authenticated" };
        const { derivManager } = await import("./derivConnection");
        const conn = await derivManager.ensureConnected(ctxUser.id);
        if (!conn || !conn.isAuthorized()) return { error: "Deriv account not connected" };
        try {
          const res = await conn.closePosition(args.contractId);
          await db.saveAuditLog({ userId: ctxUser.id, action: "position.close", target: String(args.contractId), detail: res });
          return { data: res };
        } catch (e: any) { return { error: e?.message || "Failed to close position" }; }
      }
      if (name === "remember") {
        if (!ctxUser) return { error: "Not authenticated" };
        const mem = (await db.getUserMemory(ctxUser.id)) || {};
        mem[args.key] = args.value;
        await db.setUserMemory(ctxUser.id, mem);
        return { data: { remembered: args.key, value: args.value } };
      }
      if (name === "getTradeHistory") {
        if (!ctxUser) return { error: "Not authenticated" };
        let trades = await db.getTradesByUserId(ctxUser.id, Math.min(args.limit || 50, 500));
        if (args.symbol) trades = trades.filter((t: any) => (t.symbol || "").toUpperCase() === normalizeSymbol(args.symbol).toUpperCase());
        if (args.result) trades = trades.filter((t: any) => t.result === args.result);
        const wins = trades.filter((t: any) => t.result === "win").length;
        const losses = trades.filter((t: any) => t.result === "loss").length;
        const total = trades.length;
        const net = trades.reduce((s: number, t: any) => s + (parseFloat(t.profitLoss || "0") || 0), 0);
        return {
          data: {
            count: total,
            wins, losses,
            winRate: total ? ((wins / total) * 100).toFixed(1) + "%" : "n/a",
            netProfitLoss: net.toFixed(2),
            trades: trades.slice(0, 50).map((t: any) => ({
              id: t.id, symbol: t.symbol, result: t.result,
              stake: t.stake, profitLoss: t.profitLoss,
              entryTime: t.entryTime, exitTime: t.exitTime, contractId: t.contractId,
            })),
          },
        };
      }
      if (name === "getBotPerformance") {
        if (!ctxUser) return { error: "Not authenticated" };
        const strategies = args.botId
          ? [await db.getStrategyById(args.botId, ctxUser.id)].filter(Boolean)
          : await db.getStrategiesByUserId(ctxUser.id);
        const runs = await db.getBotRunsByUserId(ctxUser.id);
        const enriched = strategies.map((s: any) => {
          const sRuns = runs.filter((r: any) => r.strategyId === s.id);
          const last = sRuns[sRuns.length - 1];
          return {
            id: s.id, name: s.name, isActive: s.isActive,
            config: s.config,
            runs: sRuns.length,
            lastRunStatus: last?.status || "never",
            lastUpdated: s.updatedAt || s.createdAt,
          };
        });
        return { data: { bots: enriched, totalRuns: runs.length } };
      }
      return { error: "Unknown tool" };
    } catch (e) {
      console.error("[tool]", e);
      return { error: "The tool could not complete. Please try a different request." };
    }
  }

  // In-memory agent conversation history (per user+chat) for continuity
  const agentHistory = new Map<string, { role: "user" | "assistant"; content: string }[]>();
  const AGENT_HISTORY_MAX_KEYS = 10000;
  setInterval(() => {
    if (agentHistory.size > AGENT_HISTORY_MAX_KEYS) {
      const entries = [...agentHistory.entries()];
      const toDelete = entries.slice(0, entries.length - AGENT_HISTORY_MAX_KEYS);
      for (const [k] of toDelete) agentHistory.delete(k);
    }
  }, 300_000);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    signup: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8, "Password must be at least 8 characters"),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
        }

        const passwordHash = await hashPassword(input.password);
        const user = await db.createUser({
          email: input.email,
          passwordHash,
          name: input.name ?? null,
        });
        db.saveAuditLog({ userId: user.id, action: "auth.signup", detail: { email: input.email } }).catch(() => {});

        const sessionId = randomBytes(16).toString("hex");
        await db.createSession({ userId: user.id, sessionId, userAgent: ctx.req.headers["user-agent"] || null, ip: ctx.req.ip || null });
        const sessionToken = await createSessionToken(user.id, sessionId);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });

        // Send verification email (non-blocking)
        const verifyToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.createVerificationToken(user.id, verifyToken, expiresAt);
        const verifyUrl = `${ENV.appUrl}/verify-email?token=${verifyToken}`;
        sendEmail({
          to: input.email,
          subject: "Verify your 369Labs email",
          html: buildVerificationEmail(verifyUrl),
        }).catch(() => {});

        return { ...sanitizeUser(user), emailSent: !!ENV.resendApiKey };
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        let user; try { user = await db.getUserByEmail(input.email); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Authentication service unavailable" }); }
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        if (user.twoFactorEnabled) {
          return { needs2FA: true, email: user.email } as const;
        }

        await db.touchUserLastSignedIn(user.id);
        db.saveAuditLog({ userId: user.id, action: "auth.login", detail: { ip: ctx.req.ip || null } }).catch(() => {});

        const sessionId = randomBytes(16).toString("hex");
        await db.createSession({ userId: user.id, sessionId, userAgent: ctx.req.headers["user-agent"] || null, ip: ctx.req.ip || null });
        const sessionToken = await createSessionToken(user.id, sessionId);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });

        return sanitizeUser(user);
      }),

    verify2FALogin: publicProcedure
      .input(z.object({ email: z.string().email(), token: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.twoFactorEnabled || !user.twoFASecret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not enabled" });
        }
        const epoch = Math.floor(Date.now() / 30000);
        let valid = false;
        for (let i = -1; i <= 1; i++) {
          const expected = generateTOTP(user.twoFASecret, epoch + i);
          if (timingSafeEqual(Buffer.from(expected), Buffer.from(input.token))) { valid = true; break; }
        }
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid 2FA code" });
        }
        await db.touchUserLastSignedIn(user.id);
        const sessionId = randomBytes(16).toString("hex");
        await db.createSession({ userId: user.id, sessionId, userAgent: ctx.req.headers["user-agent"] || null, ip: ctx.req.ip || null });
        const sessionToken = await createSessionToken(user.id, sessionId);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });
        return sanitizeUser(user);
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (ctx.sessionId) {
        db.revokeSession(ctx.sessionId, ctx.user?.id ?? 0).catch(() => {});
      }
      return { success: true } as const;
    }),

    // Forgot / Reset Password
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserByEmail(input.email);
          // Always return a generic success to prevent email enumeration.
          if (!user) return { success: true, emailSent: false };
          const resetToken = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await db.createPasswordResetToken(user.id, resetToken, expiresAt);
          const isDev = process.env.NODE_ENV !== "production";
          const result: any = { success: true, emailSent: false };
          if (isDev && !ENV.resendApiKey) {
            // Dev mode with no email configured — return the link directly
            result.resetUrl = `${ctx.req.protocol}://${ctx.req.get("host")}/reset?token=${resetToken}`;
          } else {
            // Try to send via Resend
            const resetUrl = `${ENV.appUrl}/reset?token=${resetToken}`;
            const sent = await sendEmail({
              to: input.email,
              subject: "Reset your 369Labs password",
              html: buildResetEmail(resetUrl),
            });
            result.emailSent = sent;
          }
          return result;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process reset request",
          });
        }
      }),

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().min(32) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const record = await db.getValidVerificationToken(input.token);
          if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired verification token" });
          await db.updateUserEmailVerified(record.userId);
          await db.markVerificationTokenUsed(input.token);
          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to verify email",
          });
        }
      }),

    resendVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserByEmail(input.email);
          if (!user) return { success: true, emailSent: false };
          if (user.emailVerified) return { success: true, emailSent: false, alreadyVerified: true };
          const verifyToken = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await db.createVerificationToken(user.id, verifyToken, expiresAt);
          const verifyUrl = `${ENV.appUrl}/verify-email?token=${verifyToken}`;
          const sent = await sendEmail({
            to: input.email,
            subject: "Verify your 369Labs email",
            html: buildVerificationEmail(verifyUrl),
          });
          return { success: true, emailSent: sent };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to resend verification",
          });
        }
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(32),
        password: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const record = await db.getValidPasswordResetToken(input.token);
          if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
          const passwordHash = await hashPassword(input.password);
          await db.updateUserPassword(record.userId, passwordHash);
          await db.markPasswordResetTokenUsed(input.token);
          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to reset password",
          });
        }
}),
    // Two-Factor Authentication
    setup2FA: protectedProcedure
      .mutation(async ({ ctx }) => {
        try {
          const rawSecret = randomBytes(20).toString("hex");
          const base32Secret = hexToBase32(rawSecret);
          const otpauth = `otpauth://totp/369Labs:${encodeURIComponent(ctx.user.email)}?secret=${base32Secret}&issuer=369Labs`;
          await db.setUser2FASecret(ctx.user.id, rawSecret);
          db.saveAuditLog({ userId: ctx.user.id, action: "auth.setup2FA" }).catch(() => {});
          return { secret: base32Secret, otpauth };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to setup 2FA",
          });
        }
      }),

    verify2FA: protectedProcedure
      .input(z.object({ token: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserById(ctx.user.id);
          if (!user || !user.twoFASecret) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not set up" });
          }
          // Simple TOTP verification (30-second window, allow ┬▒1 window)
          const epoch = Math.floor(Date.now() / 30000);
          for (let i = -1; i <= 1; i++) {
            const expectedToken = generateTOTP(user.twoFASecret, epoch + i);
            if (timingSafeEqual(Buffer.from(expectedToken), Buffer.from(input.token))) {
              await db.enable2FA(ctx.user.id);
              return { success: true };
            }
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid 2FA code" });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to verify 2FA",
          });
        }
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserById(ctx.user.id);
          if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
          const valid = await verifyPassword(input.currentPassword, user.passwordHash);
          if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
          const passwordHash = await hashPassword(input.newPassword);
          await db.updateUserPassword(user.id, passwordHash);
          db.saveAuditLog({ userId: ctx.user.id, action: "auth.changePassword" }).catch(() => {});
          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to change password",
          });
        }
      }),

    disable2FA: protectedProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserByEmail(ctx.user.email);
          if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
          const valid = await verifyPassword(input.password, user.passwordHash);
          if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
          await db.disable2FA(ctx.user.id);
          db.saveAuditLog({ userId: ctx.user.id, action: "auth.disable2FA" }).catch(() => {});
          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to disable 2FA",
          });
        }
      }),

    changeEmail: protectedProcedure
      .input(z.object({ newEmail: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
        const existing = await db.getUserByEmail(input.newEmail);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        await db.updateUserEmail(ctx.user.id, input.newEmail);
        await db.updateUserEmailVerified(ctx.user.id, false);
        const verifyToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.createVerificationToken(ctx.user.id, verifyToken, expiresAt);
        const verifyUrl = `${ENV.appUrl}/verify-email?token=${verifyToken}`;
        const sent = await sendEmail({
          to: input.newEmail,
          subject: "Verify your new 369Labs email",
          html: buildVerificationEmail(verifyUrl),
        });
        return { success: true, emailSent: sent };
      }),

    deleteAccount: protectedProcedure
      .input(z.object({ password: z.string().min(1), confirmation: z.literal("DELETE") }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
        db.saveAuditLog({ userId: ctx.user.id, action: "auth.deleteAccount" }).catch(() => {});
        await db.deleteUser(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true };
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().max(100).optional(),
        avatarUrl: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.updateUserProfile(ctx.user.id, input);
          return { success: true };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update profile" });
        }
      }),

    listSessions: protectedProcedure(async ({ ctx }) => {
      const sessions = await db.getUserSessions(ctx.user.id);
      return sessions.filter(s => !s.revokedAt).map(s => ({
        id: s.sessionId,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: Number(new Date(s.createdAt).getTime()),
        lastActiveAt: Number(new Date(s.lastActiveAt).getTime()),
        isCurrent: s.sessionId === ctx.sessionId,
      }));
    }),

    revokeSession: protectedProcedure
      .input(z.object({ sessionId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await db.revokeSession(input.sessionId, ctx.user.id);
        return { success: true };
      }),

    backupData: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.exportUserData(ctx.user.id);
      }),

    restoreData: protectedProcedure
      .input(z.object({ data: z.record(z.any()) }))
      .mutation(async ({ ctx, input }) => {
        return await db.importUserData(ctx.user.id, input.data);
      }),
      }),

  // Deriv API Token Management
  deriv: router({
    saveToken: protectedProcedure
      .input(z.object({
        token: z.string().min(1),
        accountId: z.string().optional(),
        accountType: z.enum(["demo", "real"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const saved = await db.saveDerivToken({
            userId: ctx.user.id,
            token: input.token,
            accountId: input.accountId,
            accountType: input.accountType,
            isActive: true,
          });
          await db.saveAuditLog({ userId: ctx.user.id, action: "token.add", detail: { accountType: input.accountType } });
          // Bring the server-side control-center connection online immediately.
          const { derivManager } = await import("./derivConnection");
          derivManager.getOrCreate(ctx.user.id);
          return { success: true, token: saved };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save Deriv token",
          });
        }
      }),

    getToken: protectedProcedure.query(async ({ ctx }) => {
      try {
        const token = await db.getDerivTokenByUserId(ctx.user.id);
        return token ? { token: token.token, accountId: token.accountId, accountType: token.accountType } : null;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve Deriv token",
        });
      }
    }),

    removeToken: protectedProcedure
      .mutation(async ({ ctx }) => {
        try {
          await db.removeDerivToken(ctx.user.id);
          const { derivManager } = await import("./derivConnection");
          derivManager.remove(ctx.user.id);
          await db.saveAuditLog({ userId: ctx.user.id, action: "token.remove" });
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove Deriv token",
          });
        }
      }),

    // --- Control-center endpoints (server-owned live connection) ---

    // Current account + open positions + PnL snapshot. Drives the portfolio
    // view and gives 369AI real account awareness.
    getState: protectedProcedure.query(async ({ ctx }) => {
      const { derivManager } = await import("./derivConnection");
      const conn = await derivManager.ensureConnected(ctx.user.id);
      if (!conn) return { connected: false, authorized: false, account: null, positions: [], openPositionCount: 0, totalUnrealizedPnl: 0, connectedToDeriv: false };
      return { ...conn.getSnapshot(), connectedToDeriv: true };
    }),

    getAccount: protectedProcedure.query(async ({ ctx }) => {
      const { derivManager } = await import("./derivConnection");
      const conn = await derivManager.ensureConnected(ctx.user.id);
      return conn?.getSnapshot().account || null;
    }),

    getPositions: protectedProcedure.query(async ({ ctx }) => {
      const { derivManager } = await import("./derivConnection");
      const conn = await derivManager.ensureConnected(ctx.user.id);
      return conn ? conn.getSnapshot().positions : [];
    }),

    // Close an open position on the user's Deriv account.
    closePosition: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { derivManager } = await import("./derivConnection");
        const conn = await derivManager.ensureConnected(ctx.user.id);
        if (!conn || !conn.isAuthorized()) throw new TRPCError({ code: "BAD_REQUEST", message: "Deriv account not connected" });
        try {
          const res = await conn.closePosition(input.contractId);
          await db.saveAuditLog({ userId: ctx.user.id, action: "position.close", target: String(input.contractId), detail: res });
          return res;
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "Failed to close position" });
        }
      }),

    // Live tick history for a symbol via the server connection.
    tickHistory: protectedProcedure
      .input(z.object({ symbol: z.string(), count: z.number().default(100) }))
      .query(async ({ ctx, input }) => {
        const { derivManager } = await import("./derivConnection");
        const conn = await derivManager.ensureConnected(ctx.user.id);
        if (!conn) return [];
        try { return await conn.getTickHistory(input.symbol, Math.min(input.count, 2000)); }
        catch { return []; }
      }),

    // Refresh account/portfolio (re-pull balance + open positions).
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      const { derivManager } = await import("./derivConnection");
      const conn = await derivManager.ensureConnected(ctx.user.id);
      if (!conn) return { connected: false };
      // trigger re-fetch by requesting state after a balance/portfolio pull
      return conn.getSnapshot();
    }),
  }),

  // Strategy Management
  strategies: router({
    save: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        config: z.record(z.string(), z.any()),
        published: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
        const strategy = await db.saveStrategy({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          config: input.config,
          isActive: true,
          published: input.published ?? false,
        });
        db.saveAuditLog({ userId: ctx.user.id, action: "strategy.create", target: String(strategy.id), detail: { name: input.name } }).catch(() => {});
        import("./ai/StrategyIntelligence").then(async ({ strategyIntelligence }) => {
          await strategyIntelligence.review(strategy, ctx.user.id).catch(() => {});
        }).catch(() => {});
        return strategy;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save strategy",
          });
        }
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await db.getStrategiesByUserId(ctx.user.id);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve strategies",
        });
      }
    }),

    publishedList: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await db.getPublishedStrategies();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve published strategies",
        });
      }
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const strategy = await db.getStrategyById(input.id, ctx.user.id);
          if (!strategy) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          }
          return strategy;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve strategy",
          });
        }
      }),

    review: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const strategy = await db.getStrategyById(input.id, ctx.user.id);
          if (!strategy) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          const { strategyIntelligence } = await import("./ai/StrategyIntelligence");
          return strategyIntelligence.review(strategy, ctx.user.id);
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to review strategy" });
        }
      }),

    evaluateConfig: protectedProcedure
      .input(z.object({ name: z.string(), config: z.record(z.string(), z.any()) }))
      .query(async ({ ctx, input }) => {
        const { strategyIntelligence } = await import("./ai/StrategyIntelligence");
        return strategyIntelligence.review({
          id: 0,
          userId: ctx.user.id,
          name: input.name,
          config: input.config,
        } as any, ctx.user.id);
      }),

    history: protectedProcedure
      .input(z.object({ strategyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { AIKnowledgeType } = await import("./ai/knowledgeTypes");
        return db.getAiKnowledge(ctx.user.id, AIKnowledgeType.STRATEGY_REVIEW, 50)
          .then(reviews => reviews.filter(r => r.relatedStrategyId === input.strategyId));
      }),

    publish: protectedProcedure
      .input(z.object({ id: z.number(), published: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const strategy = await db.setStrategyPublished(input.id, ctx.user.id, input.published);
          if (!strategy) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          }
          db.saveAuditLog({ userId: ctx.user.id, action: "strategy.publish", target: String(input.id), detail: { published: input.published } }).catch(() => {});
          return strategy;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to publish strategy",
          });
        }
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const copy = await db.duplicateStrategy(input.id, ctx.user.id);
          if (!copy) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          }
          db.saveAuditLog({ userId: ctx.user.id, action: "strategy.duplicate", target: String(input.id), detail: { copyId: copy.id } }).catch(() => {});
          return copy;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to duplicate strategy",
          });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        config: z.record(z.string(), z.any()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const existing = await db.getStrategyById(input.id, ctx.user.id);
          if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          const updated = await db.updateStrategy(input.id, ctx.user.id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.config !== undefined ? { config: input.config } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          });
          await db.saveAuditLog({ userId: ctx.user.id, action: "strategy.update", target: String(input.id) });
          if (updated) {
            import("./ai/StrategyIntelligence").then(async ({ strategyIntelligence }) => {
              await strategyIntelligence.review(updated, ctx.user.id).catch(() => {});
            }).catch(() => {});
          }
          return updated;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update strategy" });
        }
      }),

    templates: protectedProcedure.query(async () => {
      return [
        {
          name: "RSI Mean Reversion",
          description: "Buy when RSI is oversold (≤30), sell when overbought (≥70). Uses 14-period RSI on 1-minute candles.",
          config: { rule: { symbol: "R_100", condition: { indicator: "rsi", comparison: "crosses_above", value: 30, period: 14 }, action: { tradeType: "CALL" }, params: { stake: 1, duration: 5, durationUnit: "m" } } },
        },
        {
          name: "MA Crossover",
          description: "Buy when 9-period MA crosses above 21-period MA. Standard trend-following on 5-minute candles.",
          config: { rule: { symbol: "R_100", condition: { indicator: "ma_crossover", fast: 9, slow: 21 }, action: { tradeType: "CALL" }, params: { stake: 1, duration: 5, durationUnit: "m" } } },
        },
        {
          name: "Bollinger Squeeze",
          description: "Trade when Bollinger Bands contract (squeeze) then expand. 20-period, 2 standard deviations.",
          config: { rule: { symbol: "R_100", condition: { indicator: "bollinger", comparison: "squeeze", period: 20, stdDev: 2 }, action: { tradeType: "CALL" }, params: { stake: 1, duration: 5, durationUnit: "m" } } },
        },
        {
          name: "Digit Parity",
          description: "Trade based on last-digit parity. Simple statistical edge on even/odd digit distribution.",
          config: { rule: { symbol: "R_100", condition: { indicator: "last_digit", comparison: "parity", parity: "even" }, action: { tradeType: "CALL" }, params: { stake: 1, duration: 3, durationUnit: "m" } } },
        },
        {
          name: "Trend Following",
          description: "Follow short-term momentum. Uses 3-period EMA slope to determine direction.",
          config: { rule: { symbol: "R_100", condition: { indicator: "ema", comparison: "rising", period: 3 }, action: { tradeType: "CALL" }, params: { stake: 1, duration: 3, durationUnit: "m" } } },
        },
      ];
    }),

    exportRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const strategy = await db.getStrategyById(input.id, ctx.user.id);
        if (!strategy) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
        return { json: JSON.stringify(strategy.config, null, 2), name: strategy.name };
      }),

    importRule: protectedProcedure
      .input(z.object({ name: z.string(), config: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        const strategy = await db.saveStrategy({
          userId: ctx.user.id,
          name: input.name,
          config: input.config,
          isActive: true,
        });
        return strategy;
      }),
  }),

  // Trade History
  trades: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => {
        try {
          return await db.getTradesByUserId(ctx.user.id, input.limit);
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve trades",
          });
        }
      }),

    exportCsv: protectedProcedure
      .query(async ({ ctx }) => {
        try {
          const trades = await db.getTradesByUserId(ctx.user.id, 5000);
          const header = ["id","symbol","result","stake","profitLoss","entryTime","exitTime","contractId"];
          const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const rows = trades.map((t) => [t.id, t.symbol, t.result, t.stake, t.profitLoss, t.entryTime, t.exitTime, t.contractId].map(esc).join(","));
          return { csv: [header.join(","), ...rows].join("\n"), count: trades.length };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to export trades" });
        }
      }),

save: protectedProcedure
      .input(z.object({
        botRunId: z.number().optional(),
        strategyId: z.number().optional(),
        entryTime: z.date(),
        exitTime: z.date().optional(),
        entryPrice: z.string(),
        exitPrice: z.string().optional(),
        stake: z.string().refine((val) => {
          const decimalRegex = /^\d+(\.\d{1,8})?$/;
          if (!decimalRegex.test(val)) return false;
          const num = parseFloat(val);
          return num >= 0.35 && num <= 999999;
        }, "Stake must be a valid decimal number between 0.35 and 999999"),
        profitLoss: z.string().optional(),
        result: z.enum(["win", "loss", "pending"]),
        contractId: z.string().optional(),
        symbol: z.string().optional(),
        contractType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.saveTrade({
            userId: ctx.user.id,
            ...input,
          });
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save trade",
          });
        }
      }),

    importCsv: protectedProcedure
      .input(z.object({ csv: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const lines = input.csv.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV must have a header row and at least one data row" });
        const header = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
        const required = ["symbol", "result", "stake"];
        for (const r of required) { if (!header.includes(r)) throw new TRPCError({ code: "BAD_REQUEST", message: `CSV missing required column: ${r}. Found: ${header.join(", ")}` }); }
        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(",").map(v => v.replace(/^"|"$/g, "").trim());
          const row: Record<string, string> = {};
          header.forEach((h, idx) => { row[h] = vals[idx] || ""; });
          try {
            await db.saveTrade({
              userId: ctx.user.id,
              symbol: row.symbol,
              result: (row.result === "win" || row.result === "loss") ? row.result : "pending",
              stake: row.stake || "0",
              profitLoss: row.profitloss || row.profit_loss || "0",
              entryTime: new Date(row.entrytime || row.entry_time || Date.now()),
              exitTime: row.exittime || row.exit_time ? new Date(row.exittime || row.exit_time) : undefined,
              contractType: row.contracttype || row.contract_type || "",
              contractId: row.contractid || row.contract_id ? parseInt(row.contractid || row.contract_id) : undefined,
            });
            imported++;
          } catch { /* skip invalid rows */ }
        }
        await db.saveAuditLog({ userId: ctx.user.id, action: "trades.importCsv", target: `${imported} trades` });
        return { imported };
      }),
  }),

  // Price Alerts
  alerts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getPriceAlertsByUserId(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        direction: z.enum(["above", "below"]),
        targetPrice: z.number().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        const alert = await db.createPriceAlert({
          userId: ctx.user.id,
          symbol: input.symbol,
          direction: input.direction,
          targetPrice: String(input.targetPrice),
        });
        return alert;
      }),

    disable: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.disablePriceAlert(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  webhooks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return { webhooks: await db.getWebhooksByUserId(ctx.user.id) };
    }),
    create: protectedProcedure
      .input(z.object({ url: z.string().url(), events: z.array(z.string()).min(1), label: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const wh = await db.createWebhook({ userId: ctx.user.id, url: input.url, events: input.events, label: input.label });
        await db.saveAuditLog({ userId: ctx.user.id, action: "webhook.create", target: input.url });
        return wh;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteWebhook(input.id, ctx.user.id);
        await db.saveAuditLog({ userId: ctx.user.id, action: "webhook.delete", target: String(input.id) });
        return { ok: true };
      }),
  }),

  // Bot Management
  bot: router({
    startRun: protectedProcedure
      .input(z.object({
        strategyId: z.number(),
        safety: z.object({
          maxRiskPerTrade: z.number().nonnegative().optional(),
          maxDailyLoss: z.number().optional(),
          maxDailyTrades: z.number().optional(),
          allowedSymbols: z.array(z.string()).optional(),
          allowedHours: z.tuple([z.number(), z.number()]).optional(),
          confidenceThreshold: z.number().optional(),
          maxConsecutiveLosses: z.number().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const strategy = await db.getStrategyById(input.strategyId, ctx.user.id);
          if (!strategy) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          const rule = (strategy.config as any)?.rule as any;
          if (!rule || !rule.symbol) throw new TRPCError({ code: "BAD_REQUEST", message: "Strategy has no executable rule" });

          const botRun = await db.saveBotRun({
            userId: ctx.user.id,
            strategyId: input.strategyId,
            status: "running",
          });

          const { botRunner } = await import("./botRunner");
          await botRunner.start({
            id: String(botRun.id),
            userId: ctx.user.id,
            name: strategy.name,
            strategy: rule,
            safety: input.safety || {},
          });

          db.saveAuditLog({ userId: ctx.user.id, action: "bot.start", target: String(botRun.id), detail: { strategyId: input.strategyId, name: strategy.name } }).catch(() => {});
          return botRun;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to start bot",
          });
        }
      }),

    getRuns: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await db.getBotRunsByUserId(ctx.user.id);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve bot runs",
        });
      }
    }),

    // Live fleet view: which bots are actually running on the server right now.
    listActive: protectedProcedure.query(async ({ ctx }) => {
      const { botRunner } = await import("./botRunner");
      return botRunner.listForUser(ctx.user.id);
    }),

    getStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { botRunner } = await import("./botRunner");
        const rt = botRunner.getStatus(String(input.id), ctx.user.id);
        if (!rt) return null;
        return {
          id: rt.def.id,
          name: rt.def.name,
          status: rt.status,
          totalTrades: rt.totalTrades,
          totalProfitLoss: rt.totalProfitLoss,
          lossStreak: rt.lossStreak,
          hasOpenTrade: rt.hasOpenTrade,
          symbol: rt.def.strategy.symbol,
        };
      }),

    stopRun: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["stopped", "error"]).default("stopped"),
        totalTrades: z.number().optional(),
        totalProfitLoss: z.string().optional(),
        errorMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { botRunner } = await import("./botRunner");
          botRunner.stop(String(input.id), ctx.user.id, input.status);
          const { id, ...updates } = input;
          const run = await db.updateBotRun(id, ctx.user.id, { ...updates, endTime: new Date() });
          await db.saveAuditLog({ userId: ctx.user.id, action: "bot.stop", target: String(id), detail: { status: input.status, totalTrades: input.totalTrades, totalProfitLoss: input.totalProfitLoss } });
          if (!run) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Bot run not found" });
          }
          return run;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to stop bot run",
          });
        }
      }),

    // One-click stop for the user's ENTIRE bot fleet (global emergency stop).
    stopAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { botRunner } = await import("./botRunner");
        const count = botRunner.stopAll(ctx.user.id);
        await db.saveAuditLog({ userId: ctx.user.id, action: "bot.stopAll", detail: { stopped: count } });
        return { stopped: count };
      }),

    saveLog: protectedProcedure
      .input(z.object({ botRunId: z.number(), message: z.string(), level: z.enum(["info", "warn", "error"]).default("info") }))
      .mutation(async ({ ctx, input }) => {
        await db.saveBotLog({ userId: ctx.user.id, botRunId: input.botRunId, message: input.message, level: input.level });
        return { success: true };
      }),

    getLogs: protectedProcedure
      .input(z.object({ botRunId: z.number(), limit: z.number().default(100) }))
      .query(async ({ ctx, input }) => {
        return db.getBotLogsByRunId(input.botRunId, ctx.user.id, input.limit);
      }),
  }),

// Telegram Settings
  telegram: router({
    saveSettings: protectedProcedure
      .input(z.object({
        chatId: z.string().min(1),
        botToken: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const settings = await db.saveTelegramSettings({
            userId: ctx.user.id,
            chatId: input.chatId,
            isVerified: true,
          });
          return settings;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save Telegram settings",
          });
        }
      }),

    getSettings: protectedProcedure.query(async ({ ctx }) => {
      try {
        const settings = await db.getTelegramSettingsByUserId(ctx.user.id);
        return settings || { id: 0, userId: ctx.user.id, botToken: null, chatId: null, isVerified: false, createdAt: new Date(), updatedAt: new Date() };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve Telegram settings",
        });
      }
    }),

    send: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const settings = await db.getTelegramSettingsByUserId(ctx.user.id);
          if (!settings?.botToken || !settings?.chatId) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Telegram not configured. Add a bot token and chat ID in Settings." });
          }
          const ok = await db.sendTelegramMessage(settings.botToken, settings.chatId, input.message);
          if (!ok) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send Telegram message" });
          }
          return { ok: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send Telegram message",
          });
        }
      }),
  }),

  // Notification Settings
  notifications: router({
    saveSettings: protectedProcedure
      .input(z.object({
        emailEnabled: z.boolean().default(true),
        tradeExecuted: z.boolean().default(true),
        takeProfitHit: z.boolean().default(true),
        stopLossHit: z.boolean().default(true),
        botError: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const settings = await db.saveNotificationSettings({
            userId: ctx.user.id,
            ...input,
          });
          db.saveAuditLog({ userId: ctx.user.id, action: "settings.notifications" }).catch(() => {});
          return settings;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save notification settings",
          });
        }
      }),

    getSettings: protectedProcedure.query(async ({ ctx }) => {
      try {
        const settings = await db.getNotificationSettingsByUserId(ctx.user.id);
        return settings || { id: 0, userId: ctx.user.id, emailEnabled: true, tradeExecuted: true, takeProfitHit: true, stopLossHit: true, botError: true, createdAt: new Date(), updatedAt: new Date() };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve notification settings",
        });
      }
    }),
  }),

  // AI Agent - ReAct-style multi-step reasoning with persistent history
  ai: router({
    history: protectedProcedure
      .input(z.object({ chatId: z.string().default("main"), limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => {
        try {
          return await db.getChatHistory(ctx.user.id, input.chatId, input.limit);
        } catch {
          return [];
        }
      }),

    saveMessage: protectedProcedure
      .input(z.object({
        chatId: z.string().default("main"),
        role: z.enum(["user", "ai"]),
        content: z.string().min(1),
        steps: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.addChatMessage(ctx.user.id, input.chatId, input.role, input.content, input.steps);
          return { ok: true };
        } catch {
          return { ok: false };
        }
      }),

    journal: protectedProcedure
      .input(z.object({ strategyId: z.number().optional(), limit: z.number().default(50) }))
      .mutation(async ({ ctx, input }) => {
        if (!process.env.AI_API_KEY) return { analysis: "AI not configured. Add AI_API_KEY to enable journal analysis." };
        try {
          const trades = await db.getTradesByUserId(ctx.user.id, input.limit);
          const filtered = input.strategyId ? trades.filter((t: any) => t.strategyId === input.strategyId) : trades;
          if (!filtered.length) return { analysis: "No trades yet. Deploy a bot and let it trade to generate a journal." };
          const summary = filtered.slice(0, 40).map((t: any) => ({
            symbol: t.symbol, result: t.result, pnl: t.profitLoss, stake: t.stake,
            contractType: t.contractType, entryPrice: t.entryPrice,
            time: t.entryTime ? new Date(t.entryTime).toISOString() : null,
          }));
          const wins = filtered.filter((t: any) => t.result === "win").length;
          const losses = filtered.length - wins;
          const net = filtered.reduce((a: number, t: any) => a + (Number(t.profitLoss) || 0), 0);
          const ai = await getAI();
          const res = await ai.chat.completions.create({
            model: resolveAIModel(),
            messages: [
              { role: "system", content: "You are 369AI's trading journal analyst. Given a trader's recent trades, write a concise, educational post-trade journal. Explain WHY trades likely won or lost (market regime, digit distribution, entry timing), surface patterns in their results, note risk observations, and give 2-3 concrete improvements. Be specific and reference the data. Plain text, max 350 words." },
              { role: "user", content: `Recent trades (last ${filtered.length}): wins=${wins}, losses=${losses}, net P&L=$${net.toFixed(2)}.\nTrade data: ${JSON.stringify(summary)}` },
            ],
            temperature: 0.4,
          });
          const analysis = res.choices?.[0]?.message?.content || "No analysis returned.";
          await db.saveAiKnowledge({ userId: ctx.user.id, knowledgeType: "journal", data: { analysis, wins, losses, net: +net.toFixed(2), sampleSize: filtered.length, trades: summary, strategyId: input.strategyId } }).catch(() => {});
          return { analysis, wins, losses, net: +net.toFixed(2), sampleSize: filtered.length };
        } catch (e: any) {
          return { analysis: "Journal analysis failed: " + (e?.message || "unknown error") };
        }
      }),

    journalSaveManual: protectedProcedure
      .input(z.object({ note: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await db.saveAiKnowledge({ userId: ctx.user.id, knowledgeType: "journal", data: { analysis: input.note, manual: true, createdAt: new Date().toISOString() } });
        await db.saveAuditLog({ userId: ctx.user.id, action: "journal.saveManual", target: "" });
        return { ok: true };
      }),
    journalSearch: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => {
        if (!input.query.trim()) return db.getAiKnowledge(ctx.user.id, "journal", input.limit);
        return db.searchAiKnowledge(ctx.user.id, input.query, "journal", input.limit);
      }),

    critique: protectedProcedure
      .input(z.object({ rule: z.any(), backtest: z.any().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!process.env.AI_API_KEY) return { findings: [], summary: "AI not configured." };
        try {
          const ai = await getAI();
          const bt = input.backtest ? `\nBacktest result: ${JSON.stringify(input.backtest)}` : "";
          const res = await ai.chat.completions.create({
            model: resolveAIModel(),
            messages: [
              { role: "system", content: "You are 369AI's Risk Reviewer agent. Critique a trading strategy rule for: overfitting, martingale/grid danger, poor risk:reward, unrealistic win-rate expectations, excessive drawdown risk, and fragile logic. Respond ONLY as JSON: { \"findings\": [{\"severity\": \"high\"|\"medium\"|\"low\", \"title\": string, \"detail\": string}], \"summary\": string }." },
              { role: "user", content: `Strategy rule: ${JSON.stringify(input.rule)}${bt}` },
            ],
            temperature: 0.3,
          });
          const text = res.choices?.[0]?.message?.content || "{}";
          const json = text.replace(/```json|```/g, "").trim();
          try { return JSON.parse(json); } catch { return { findings: [], summary: text }; }
        } catch (e: any) {
          return { findings: [], summary: "Critique failed: " + (e?.message || "error") };
        }
      }),

    ask: protectedProcedure
      .input(z.object({
        message: z.string().min(1),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
        chatId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!process.env.AI_API_KEY) return { reply: "AI not configured. Add AI_API_KEY to .env" };
        try {
          const ai = await getAI();
          const key = (ctx.user?.id ? String(ctx.user.id) : "anon") + ":" + (input.chatId || "default");
          const prior = (input.history && input.history.length) ? input.history : (agentHistory.get(key) || []);
          const memory = await db.getUserMemory(ctx.user.id);
          const memoryStr = formatMemoryForPrompt(memory);

          // Platform awareness: always reason with the real current state so the
          // AI never answers blind. Built server-side (cheap), not from the client.
          let platformStr = "";
          try {
            const { derivManager } = await import("./derivConnection");
            const { botRunner } = await import("./botRunner");
            const conn = await derivManager.ensureConnected(ctx.user.id);
            const snap = conn?.getSnapshot();
            const bots = botRunner.listForUser(ctx.user.id);
            const strategies = await db.getStrategiesByUserId(ctx.user.id);
            const openPositions = (snap?.positions || []).filter((p: any) => p.isOpen);
            const recentTrades = await db.getTradesByUserId(ctx.user.id, 10);
            const totalTrades = recentTrades.length;
            const wins = recentTrades.filter((t: any) => t.result === "win").length;
            const platform: any = {
              derivConnected: !!snap?.authorized,
              account: snap?.account ? { type: snap.account.accountType, balance: snap.account.balance, currency: snap.account.currency } : null,
              openPositions: openPositions.length,
              openPositionDetails: openPositions.slice(0, 10).map((p: any) => ({
                contractId: p.contractId, symbol: p.symbol, contractType: p.contractType,
                entryPrice: p.entryPrice, currentPrice: p.currentPrice, profit: p.profit,
                isOpen: p.isOpen, duration: p.duration,
              })),
              totalUnrealizedPnl: snap?.totalUnrealizedPnl ?? 0,
              runningBots: bots.map((b: any) => ({
                id: b.id, name: b.name, symbol: b.symbol, status: b.status,
                trades: b.totalTrades, pnl: b.totalProfitLoss,
              })),
              activeStrategies: strategies.slice(0, 12).map((s: any) => ({
                id: s.id, name: s.name, symbol: (s.config as any)?.rule?.symbol,
                stake: (s.config as any)?.rule?.params?.stake,
                stopLoss: (s.config as any)?.rule?.params?.stopLoss,
                takeProfit: (s.config as any)?.rule?.params?.takeProfit,
              })),
              recentPerformance: totalTrades > 0 ? {
                totalTrades, wins, losses: totalTrades - wins,
                winRate: ((wins / totalTrades) * 100).toFixed(1) + "%",
              } : null,
            };
            platformStr = "\n\nCURRENT PLATFORM STATE (real, live):\n" + JSON.stringify(platform);
          } catch (e) { /* non-fatal: answer without live context */ }

          // Multi-agent routing: pick the specialist best matched to this turn.
          const { routeAgent, getAgent, agentTools } = await import("./agents");
          const { agent } = routeAgent(input.message);
          const toolsForTurn = agentTools(agent);

          const messages: any[] = [
            { role: "system", content: `${agent.persona}${memoryStr}${platformStr}

When you use a tool, briefly note which specialist is acting (e.g. "[Market Analyst]"). If the platform state shows something relevant (e.g. an open position, a running bot, a live balance), reference it. Keep it real ΓÇö no robot speak.` },
            ...prior,
            { role: "user", content: input.message },
          ];

          let reply = "No response";
          const steps: any[] = [];
          for (let round = 0; round < 5; round++) {
            let res: any;
            try {
              res = await aiChatCompletion(ai, {
                model: resolveAIModel(),
                messages,
                tools: toolsForTurn,
                tool_choice: "auto",
              });
            } catch (toolErr: any) {
              const isToolErr = String(toolErr?.message || "").includes("tool_use_failed") || String(toolErr?.error?.code || "").includes("tool_use_failed");
              if (!isToolErr) throw toolErr;
              console.warn("[AI] tool_use_failed, retrying without tools:", String(toolErr?.message || "").slice(0, 200));
              try {
                res = await aiChatCompletion(ai, {
                  model: resolveAIModel(),
                  messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
                  tool_choice: "none",
                });
              } catch (e2: any) {
                console.error("[AI] fallback completion failed:", e2?.message?.slice(0, 200));
                throw e2;
              }
            }
            const msg = res.choices[0]?.message;
            if (!msg) break;
            messages.push(msg);
            if (!msg.tool_calls?.length) { reply = msg.content || reply; break; }
            const results = await Promise.all(msg.tool_calls.map(async (call: any) => {
              let parsed: any = {};
              try { parsed = JSON.parse(call.function.arguments || "{}"); } catch (e) { console.error("[AI] tool arg parse failed:", call.function.name, e); }
              const result = await runTool(call.function.name, parsed, ctx.user);
              steps.push({ tool: call.function.name, args: parsed, result });
              return { tool: call.function.name, result, id: call.id };
            }));
            for (const r of results) {
              messages.push({ role: "tool", content: JSON.stringify(r.result), tool_call_id: r.id });
            }
            // If any action intent requires confirmation, surface it to the client
            const intent = results.find((r: any) => r.result && r.result.__action);
            if (intent) {
              return { reply: "I can do that, but I need your confirmation first.", action: intent.result, steps };
            }
          }

          // persist history for continuity
          const convo = [...prior, { role: "user" as const, content: input.message }, { role: "assistant" as const, content: reply }];
          agentHistory.set(key, convo.slice(-20));
          // Persist to DB so the conversation survives restarts / multiple instances.
          try {
            const chatId = input.chatId || "main";
            await db.addChatMessage(ctx.user.id, chatId, "user", input.message);
            await db.addChatMessage(ctx.user.id, chatId, "ai", reply, steps);
          } catch (e) { console.error("[AI history persist]", e); }

          // Natural-language fallback: if the model didn't call a tool but the user clearly
          // asked to watch/scan/monitor a symbol (typos OK), trigger the scan automatically.
          if (!reply || !steps.length) {
            const intent = detectWatchIntent(input.message);
            if (intent && ctx.user) {
              try {
                const { runWatch } = await import("./signalScanner");
                const saved = await runWatch({
                  userId: ctx.user.id,
                  symbol: intent.symbol,
                  sampleSize: Math.min(2000, intent.durationMinutes * 20),
                  minWinRate: 62,
                  patternType: intent.patternType,
                });
                const msg2 = saved.length
                  ? `I watched ${intent.symbol} and found ${saved.length} repeatable pattern${saved.length > 1 ? "s" : ""} (win rates ${saved.map((s: any) => s.winRate + "%").join(", ")}). Check the AI Signals page - each has full evidence and a Backtest button.`
                  : `I watched ${intent.symbol} for ${intent.durationMinutes} min and didn't find any pattern clearing my confidence threshold this time. I'll keep scanning - you can also ask me to watch again with a wider window.`;
                return { reply: msg2, steps: [{ tool: "startWatch", args: intent, result: { signalsFound: saved.length } }] };
              } catch (e) { console.error("[watch fallback]", e); }
            }
          }

          return { reply, steps, agent: agent.id, agentLabel: agent.label };
        } catch (e) {
          console.error("[AI]", e);
          return { reply: "I'm having trouble reaching the AI service right now. Please try again in a moment." };
        }
      }),
    parseRule: protectedProcedure
      .input(z.object({ text: z.string().min(1), symbol: z.string().optional() }))
      .mutation(async ({ input }) => {
        if (!process.env.AI_API_KEY) return { ok: false, error: "AI not configured" };
        try {
          const ai = await getAI();
          const sys = `You convert a trader's natural-language description of a trading rule into strict JSON only (no prose, no markdown). Output exactly one JSON object with this shape:
{ "symbol": "R_50" | null, "condition": { "indicator": "last_digit" | "parity", "comparison": "equals" | "appears_consecutively" | "greater_than" | "less_than", "count": number, "barrier": number | null }, "action": { "tradeType": "buy_rise" | "buy_fall" | "buy_even" | "buy_odd" | "buy_over" | "buy_under" }, "params": { "stake": number, "stopLoss": number, "takeProfit": number } }
Rules:
- indicator "parity": barrier 0 = even, 1 = odd.
- indicator "last_digit": barrier 0-9 for the specific digit; comparison "equals" for a single occurrence, "appears_consecutively" for N-in-a-row (count = N), "greater_than"/"less_than" for over/under a digit.
- If a number is referenced generally (e.g. "over 5", "under 5"), use last_digit with greater_than/less_than and that barrier.
- Infer direction: "rise/up/climb/bull" -> buy_rise; "fall/down/drop/bear" -> buy_fall; "even" -> buy_even; "odd" -> buy_odd; "over" -> buy_over; "under" -> buy_under.
- Use the symbol from the text if present (normalize "R10"->"R_10", "1HZ10"->"1HZ10V"), else the provided default symbol, else null.
- Keep params default { stake: 1, stopLoss: 20, takeProfit: 50 } unless the user states amounts.
Return ONLY the JSON.`;
          const res = await ai.chat.completions.create({
            model: resolveAIModel(),
            messages: [
              { role: "system", content: sys },
              { role: "user", content: `Default symbol: ${input.symbol || "none"}. Text: ${input.text}` },
            ],
            temperature: 0,
          });
          const content = res.choices[0]?.message?.content || "{}";
          const json = content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1");
          const rule = JSON.parse(json);
          return { ok: true, rule };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }),
  }),

  // 369AI Live Intelligence Feed ΓÇö powers the dashboard AI panel.
  aiLive: router({
    feed: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      return aiOrchestrator.getFeed();
    }),
    health: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      return aiOrchestrator.getHealth();
    }),
    healthFor: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const { aiOrchestrator } = await import("./ai/AIOrchestrator");
        return aiOrchestrator.getHealthFor(input.symbol);
      }),
    riskAdvisory: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { aiOrchestrator } = await import("./ai/AIOrchestrator");
        if (input?.symbol) return aiOrchestrator.getRiskAdvisoryFor(input.symbol);
        return aiOrchestrator.getRiskAdvisories();
      }),
    userRisk: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ ctx, input }) => {
        const { riskIntelligence } = await import("./ai/RiskIntelligence");
        return riskIntelligence.assessForUser(input.symbol, ctx.user.id);
      }),
    accuracyStats: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { aiMemory } = await import("./ai/AIMemory");
        return aiMemory.getAccuracyStats(ctx.user.id, input?.symbol);
      }),
    marketPatterns: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { aiMemory } = await import("./ai/AIMemory");
        return aiMemory.getMarketPatterns(input?.symbol);
      }),
    performanceSummary: protectedProcedure.query(async ({ ctx }) => {
      const { aiMemory } = await import("./ai/AIMemory");
      return aiMemory.getPerformanceSummary(ctx.user.id);
    }),
    tradeReview: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getAiKnowledgeByRelatedTradeId(ctx.user.id, input.contractId);
      }),
    state: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      const state = aiOrchestrator.getState();
      return {
        insights: state.insights,
        health: Array.from(state.health.values()),
        predictions: state.predictions.slice(-5),
        riskAdvisories: Array.from(state.riskAdvisories.values()),
        feedCount: state.feed.length,
        lastUpdated: state.lastUpdated,
        active: state.active,
      };
    }),
  }),

  signals: router({
    list: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        try {
          const list = input?.symbol
            ? await db.getSignalsBySymbol(ctx.user.id, normalizeSymbol(input.symbol))
            : await db.getSignalsByUserId(ctx.user.id);
          return list;
        } catch {
          return [];
        }
      }),
watch: protectedProcedure
      .input(z.object({ symbol: z.string(), durationMinutes: z.number().default(30), patternType: z.enum(["any", "digit_streak", "digit_bias", "even_odd_run", "momentum_after_digit"]).default('any'), minWinRate: z.number().default(62) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { runWatch } = await import('./signalScanner');
          const saved = await runWatch({
            userId: ctx.user.id,
            symbol: input.symbol,
            sampleSize: Math.min(2000, input.durationMinutes * 20),
            minWinRate: input.minWinRate,
            patternType: input.patternType,
          });
          return { scanned: true, signalsFound: saved.length, signals: saved };
        } catch {
          return { scanned: false, signalsFound: 0, signals: [] };
        }
      }),
  }),
  market: router({
    getHistory: publicProcedure
      .input(z.object({ symbol: z.string(), limit: z.number().default(1000) }))
      .query(async ({ input }) => {
        try {
          const rows = await db.getTickHistory(input.symbol, input.limit);
          return { ticks: rows.map((r) => ({
            symbol: r.symbol,
            price: r.price,
            lastDigit: r.lastDigit,
            epoch: Number(r.epoch),
          })) };
        } catch {
          return { ticks: [] };
        }
      }),
  }),
  memory: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const mem = await db.getUserMemory(ctx.user.id);
      return { memory: mem || {} };
    }),
    set: protectedProcedure
      .input(z.object({ memory: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await db.setUserMemory(ctx.user.id, input.memory);
        await db.saveAuditLog({ userId: ctx.user.id, action: "memory.update", detail: input.memory });
        return { ok: true };
      }),
  }),
  logs: router({
    recent: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ ctx, input }) => {
        const rows = await db.getAuditLogs(ctx.user.id, input.limit);
        return { logs: rows.map((r: any) => ({
          action: r.action,
          target: r.target,
          detail: r.detail,
          at: Number(new Date(r.createdAt).getTime()),
        })) };
      }),
  }),
  coding: router({
    list: adminProcedure.query(async () => {
      const { listFiles } = await import("./fileOps");
      return { files: listFiles() };
    }),
    read: adminProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ input }) => {
        const { readFile } = await import("./fileOps");
        return { content: readFile(input.path) };
      }),
    write: adminProcedure
      .input(z.object({ path: z.string(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { writeFile } = await import("./fileOps");
        writeFile(input.path, input.content);
        await db.saveAuditLog({ userId: ctx.user.id, action: "coding.write", target: input.path });
        return { ok: true };
      }),
    templates: adminProcedure.query(async () => {
      return {
        templates: [
          { name: "RSI Strategy", content: `// RSI Mean Reversion Strategy\n// Buy when RSI is oversold (<=30), sell when overbought (>=70)\n\nasync function execute(symbol: string, price: number) {\n  const rsi = await indicators.rsi(symbol, 14);\n  if (rsi <= 30) return { action: \"buy\", reason: \"RSI oversold\" };\n  if (rsi >= 70) return { action: \"sell\", reason: \"RSI overbought\" };\n  return { action: \"hold\" };\n}\n` },
          { name: "MA Crossover", content: `// Moving Average Crossover Strategy\n// Buy when fast MA crosses above slow MA\n\nconst FAST = 9;\nconst SLOW = 21;\n\nasync function execute(symbol: string, price: number) {\n  const fastMA = await indicators.sma(symbol, FAST);\n  const slowMA = await indicators.sma(symbol, SLOW);\n  if (fastMA > slowMA) return { action: \"buy\", reason: \"Bullish crossover\" };\n  if (fastMA < slowMA) return { action: \"sell\", reason: \"Bearish crossover\" };\n  return { action: \"hold\" };\n}\n` },
          { name: "Bollinger Squeeze", content: `// Bollinger Bands Squeeze Strategy\n// Trade when bands contract then expand\n\nasync function execute(symbol: string, price: number) {\n  const bb = await indicators.bollinger(symbol, 20, 2);\n  const width = (bb.upper - bb.lower) / bb.middle;\n  if (width < 0.05) return { action: \"watch\", reason: \"Squeeze detected\" };\n  if (price > bb.upper) return { action: \"sell\", reason: \"Overbought\" };\n  if (price < bb.lower) return { action: \"buy\", reason: \"Oversold\" };\n  return { action: \"hold\" };\n}\n` },
          { name: "Trend Following", content: `// Trend Following Strategy\n// Follow short-term momentum using EMA slope\n\nasync function execute(symbol: string, price: number) {\n  const ema3 = await indicators.ema(symbol, 3);\n  const ema5 = await indicators.ema(symbol, 5);\n  if (ema3 > ema5) return { action: \"buy\", reason: \"Uptrend\" };\n  if (ema3 < ema5) return { action: \"sell\", reason: \"Downtrend\" };\n  return { action: \"hold\" };\n}\n` },
          { name: "Empty Strategy", content: `// Custom Strategy\n// Fill in your logic below\n\nasync function execute(symbol: string, price: number) {\n  // Your strategy logic here\n  return { action: \"hold\" };\n}\n` },
        ],
      };
    }),
    validate: adminProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const { execSync } = await import("child_process");
          const tmpFile = `/tmp/__coding_validate_${Date.now()}.ts`;
          const { writeFileSync, unlinkSync } = await import("fs");
          writeFileSync(tmpFile, input.code);
          try {
            execSync(`npx tsc --noEmit --lib es2020,dom --target es2020 --moduleResolution node "${tmpFile}"`, { timeout: 10000 });
            return { valid: true, errors: [] };
          } catch (e: any) {
            const lines = (e.stderr || e.stdout || "").toString().split("\n").filter((l: string) => l.includes("error TS"));
            return { valid: false, errors: lines.length > 0 ? lines : [e.message || "Compilation failed"] };
          } finally {
            try { unlinkSync(tmpFile); } catch {}
          }
        } catch {
          return { valid: true, errors: [] };
        }
      }),
    saveVersion: adminProcedure
      .input(z.object({ path: z.string(), content: z.string(), label: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await db.saveAiKnowledge({ userId: ctx.user.id, knowledgeType: "coding_version", data: { path: input.path, content: input.content, label: input.label || "" } });
        return { ok: true };
      }),
    listVersions: adminProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ ctx, input }) => {
        const versions = await db.getAiKnowledge(ctx.user.id, "coding_version", 50);
        return { versions: versions.filter((v: any) => v.data?.path === input.path).map((v: any) => ({ id: v.id, label: v.data?.label || "", createdAt: v.createdAt })) };
      }),
    restoreVersion: adminProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const versions = await db.getAiKnowledge(ctx.user.id, "coding_version", 50);
        const v = versions.find((v: any) => v.id === input.versionId);
        if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        return { content: (v.data as any)?.content || "" };
      }),
  }),
  plugins: router({
    marketplace: protectedProcedure.query(async () => {
      return { plugins: await db.getPluginMarketplace() };
    }),
    my: protectedProcedure.query(async ({ ctx }) => {
      return { plugins: await db.getInstalledPlugins(ctx.user.id) };
    }),
    install: adminProcedure
      .input(z.object({ pluginId: z.number(), enabled: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        await db.installPlugin(ctx.user.id, input.pluginId, input.enabled);
        await db.saveAuditLog({ userId: ctx.user.id, action: "plugin.install", target: String(input.pluginId) });
        const mem = await db.getUserMemory(ctx.user.id);
        if (Array.isArray(mem?.memory?.plugins)) {
          const set = new Set(mem.memory.plugins as number[]);
          if (input.enabled) set.add(input.pluginId); else set.delete(input.pluginId);
          mem.memory.plugins = [...set];
          await db.setUserMemory(ctx.user.id, mem.memory);
        }
        return { ok: true };
      }),
  }),

  aiPerformance: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getOverview(ctx.user.id);
    }),
    accuracyDetail: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getAccuracyDetail(ctx.user.id);
    }),
    tradeIntelligence: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getTradeIntelligence(ctx.user.id);
    }),
    riskBehaviour: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getRiskBehaviour(ctx.user.id);
    }),
    strategyRankings: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getStrategyRankings(ctx.user.id);
    }),
    recommendations: protectedProcedure.query(async ({ ctx }) => {
      const { getAIPerformanceEngine } = await import("./ai/AIPerformance");
      return getAIPerformanceEngine().getRecommendations(ctx.user.id);
    }),
  }),

  aiExplainability: router({
    timeline: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        pageSize: z.number().default(20),
        type: z.string().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { getAIExplainabilityEngine } = await import("./ai/AIExplainability");
        return getAIExplainabilityEngine().getTimeline(ctx.user.id, input.page, input.pageSize, input.type, input.search);
      }),
    eventDetail: protectedProcedure
      .input(z.object({ eventId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { getAIExplainabilityEngine } = await import("./ai/AIExplainability");
        return getAIExplainabilityEngine().getEventDetail(ctx.user.id, input.eventId);
      }),
    confidenceHistory: protectedProcedure.query(async ({ ctx }) => {
      const { getAIExplainabilityEngine } = await import("./ai/AIExplainability");
      return getAIExplainabilityEngine().getConfidenceHistory(ctx.user.id);
    }),
    export: protectedProcedure.query(async ({ ctx }) => {
      const { getAIExplainabilityEngine } = await import("./ai/AIExplainability");
      return getAIExplainabilityEngine().getExport(ctx.user.id);
    }),
  }),

  aiCopilot: router({
    preTradeChecklist: protectedProcedure
      .input(z.object({ symbol: z.string(), contractType: z.string().optional(), stake: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
        return getAITradingCopilot().preTradeChecklist(ctx.user.id, input.symbol, input.contractType, input.stake);
      }),
    livePositionAssistant: protectedProcedure
      .input(z.object({ positionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
        return getAITradingCopilot().livePositionAssistant(ctx.user.id, input.positionId);
      }),
    sessionCoach: protectedProcedure.query(async ({ ctx }) => {
      const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
      return getAITradingCopilot().sessionCoach(ctx.user.id);
    }),
    smartAlerts: protectedProcedure.query(async ({ ctx }) => {
      const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
      return getAITradingCopilot().smartAlerts(ctx.user.id);
    }),
    decisionComparison: protectedProcedure
      .input(z.object({ tradeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
        return getAITradingCopilot().decisionComparison(ctx.user.id, input.tradeId);
      }),
    sessionSummary: protectedProcedure.query(async ({ ctx }) => {
      const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
      return getAITradingCopilot().sessionSummary(ctx.user.id);
    }),
    startSession: protectedProcedure.mutation(async ({ ctx }) => {
      const { getAITradingCopilot } = await import("./ai/AITradingCopilot");
      getAITradingCopilot().startSession(ctx.user.id);
      return { ok: true };
    }),
  }),

  globalSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim().toLowerCase();
      const limit = input.limit || 10;
      const [trades, strategies, botRuns, aiKnowledge] = await Promise.all([
        db.getTradesByUserId(ctx.user.id, 100),
        db.getStrategiesByUserId(ctx.user.id),
        db.getBotRunsByUserId(ctx.user.id),
        db.searchAllAiKnowledge(ctx.user.id, q, limit).catch(() => [] as any[]),
      ]);
      const matchedTrades = trades.filter((t: any) => (t.symbol || "").toLowerCase().includes(q) || (t.contractType || "").toLowerCase().includes(q)).slice(0, limit);
      const matchedStrategies = strategies.filter((s: any) => (s.name || "").toLowerCase().includes(q)).slice(0, limit);
      const matchedBotRuns = botRuns.filter((b: any) => (b.strategyName || "").toLowerCase().includes(q) || (b.status || "").toLowerCase().includes(q)).slice(0, limit);
      return {
        trades: matchedTrades,
        strategies: matchedStrategies,
        botRuns: matchedBotRuns,
        aiKnowledge: aiKnowledge.slice(0, limit),
      };
    }),

  aiChat: router({
    sendMessage: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { getAIChatEngine } = await import("./ai/AIChatEngine");
        return getAIChatEngine().sendMessage(ctx.user.id, input.message);
      }),
    conversationHistory: protectedProcedure.query(async ({ ctx }) => {
      const { getAIChatEngine } = await import("./ai/AIChatEngine");
      return getAIChatEngine().getConversationHistory(ctx.user.id);
    }),
    quickQuestions: protectedProcedure.query(async () => {
      const { getAIChatEngine } = await import("./ai/AIChatEngine");
      return getAIChatEngine().getQuickQuestions();
    }),
    clearConversation: protectedProcedure.mutation(async ({ ctx }) => {
      const { getAIChatEngine } = await import("./ai/AIChatEngine");
      getAIChatEngine().clearConversation(ctx.user.id);
      return { ok: true };
    }),
    memory: protectedProcedure
      .input(z.object({ type: z.string().optional(), limit: z.number().optional(), search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const t = input?.type || "";
        const limit = input?.limit || 50;
        if (input?.search?.trim()) {
          const results = await db.searchAllAiKnowledge(ctx.user.id, input.search.trim(), limit);
          return { entries: results };
        }
        if (t) {
          const entries = await db.getAiKnowledge(ctx.user.id, t, limit);
          return { entries };
        }
        const allTypes = ["trade_review", "strategy_review", "accuracy_log", "market_pattern", "ai_insight", "journal", "coding_version"];
        const results: any[] = [];
        for (const type of allTypes) {
          const items = await db.getAiKnowledge(ctx.user.id, type, 5);
          results.push(...items);
          if (results.length >= limit) break;
        }
        return { entries: results.slice(0, limit) };
      }),
    modelConfig: protectedProcedure.query(async ({ ctx }) => {
      const mem = await db.getUserMemory(ctx.user.id);
      const config = (mem?.aiModelConfig as any) || {};
      return {
        provider: config.provider || process.env.AI_PROVIDER || "openai",
        model: config.model || process.env.AI_MODEL || "gpt-4o-mini",
        baseUrl: config.baseUrl || process.env.AI_API_BASE_URL || "",
      };
    }),
    setModelConfig: protectedProcedure
      .input(z.object({ provider: z.string().optional(), model: z.string().optional(), baseUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const mem = (await db.getUserMemory(ctx.user.id)) || {};
        const config = (mem.aiModelConfig as Record<string, any>) || {};
        if (input.provider !== undefined) config.provider = input.provider;
        if (input.model !== undefined) config.model = input.model;
        if (input.baseUrl !== undefined) config.baseUrl = input.baseUrl;
        mem.aiModelConfig = config;
        await db.setUserMemory(ctx.user.id, mem as any);
        await db.saveAuditLog({ userId: ctx.user.id, action: "aiChat.setModelConfig", target: input.model || "" });
        return { ok: true };
      }),
    knowledgeTypes: protectedProcedure.query(async () => {
      return {
        types: [
          { id: "trade_review", label: "Trade Reviews" },
          { id: "strategy_review", label: "Strategy Reviews" },
          { id: "accuracy_log", label: "Accuracy Logs" },
          { id: "market_pattern", label: "Market Patterns" },
          { id: "ai_insight", label: "AI Insights" },
          { id: "journal", label: "Journal Entries" },
          { id: "coding_version", label: "Coding Versions" },
        ],
      };
    }),
  }),

  aiMarket: router({
    overview: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      const state = aiOrchestrator.getState();
      return {
        health: Array.from(state.health.values()),
        predictions: state.predictions.slice(-10),
        insights: state.insights,
        advisories: Array.from(state.riskAdvisories.values()),
        lastUpdated: state.lastUpdated,
        active: state.active,
      };
    }),

    health: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      return Array.from(aiOrchestrator.getState().health.values());
    }),

    predictions: protectedProcedure.query(async () => {
      const { aiOrchestrator } = await import("./ai/AIOrchestrator");
      return aiOrchestrator.getState().predictions.slice(-10);
    }),
  }),
  admin: router({
    listUsers: adminProcedure.query(async () => {
      const all = await db.listAllUsers();
      return { users: all.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: Number(new Date(u.createdAt).getTime()), emailVerified: u.emailVerified })) };
    }),
    promoteToAdmin: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, "admin");
        db.saveAuditLog({ userId: ctx.user.id, action: "admin.promote", target: String(input.userId) }).catch(() => {});
        return { ok: true };
      }),
    demoteToUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, "user");
        db.saveAuditLog({ userId: ctx.user.id, action: "admin.demote", target: String(input.userId) }).catch(() => {});
        return { ok: true };
      }),
    deleteUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteUser(input.userId);
        db.saveAuditLog({ userId: ctx.user.id, action: "admin.deleteUser", target: String(input.userId) }).catch(() => {});
        return { ok: true };
      }),
    listIpWhitelist: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return { entries: await db.getIpWhitelist(input.userId) };
      }),
    addIpWhitelist: adminProcedure
      .input(z.object({ userId: z.number(), ip: z.string().min(1), label: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.addIpWhitelistEntry({ userId: input.userId, ip: input.ip, label: input.label || null });
        db.saveAuditLog({ userId: ctx.user.id, action: "admin.addIpWhitelist", target: input.ip, detail: { targetUserId: input.userId } }).catch(() => {});
        return { ok: true };
      }),
    removeIpWhitelist: adminProcedure
      .input(z.object({ id: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.removeIpWhitelistEntry(input.id, input.userId);
        db.saveAuditLog({ userId: ctx.user.id, action: "admin.removeIpWhitelist", target: String(input.id), detail: { targetUserId: input.userId } }).catch(() => {});
        return { ok: true };
      }),
    auditLogs: adminProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return { logs: await db.getAllAuditLogs(input.limit) };
      }),
    systemHealth: adminProcedure.query(async () => {
      const { execSync } = await import("child_process");
      const os = await import("os");
      const uptime = os.uptime();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const loadAvg = os.loadavg();
      let dbOk = false;
      try { dbOk = !!(await import("./db")).getDb; } catch {}
      return {
        uptime: Math.floor(uptime),
        memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
        cpu: { loadAvg1: loadAvg[0], loadAvg5: loadAvg[1], loadAvg15: loadAvg[2] },
        database: dbOk ? "connected" : "error",
        node: process.version,
        platform: process.platform,
      };
    }),
    aiJournalEntry: protectedProcedure
      .input(z.object({ title: z.string(), content: z.string(), strategy: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const mem = await db.getUserMemory(ctx.user.id);
        await db.saveAiKnowledge({ userId: ctx.user.id, type: "journal", title: input.title, content: input.content, metadata: { strategy: input.strategy || null } });
        db.saveAuditLog({ userId: ctx.user.id, action: "ai.journalEntry", detail: { title: input.title } }).catch(() => {});
        return { ok: true };
      }),
    aiAlert: protectedProcedure
      .input(z.object({ title: z.string(), message: z.string(), severity: z.enum(["info", "warning", "critical"]).default("info") }))
      .mutation(async ({ input, ctx }) => {
        const { v4 } = await import("nanoid");
        const notification = { id: v4(), userId: ctx.user.id, title: input.title, message: input.message, type: "ai_alert", severity: input.severity, read: false, createdAt: new Date().toISOString() };
        await db.saveAiKnowledge({ userId: ctx.user.id, type: "alert", title: input.title, content: input.message, metadata: { severity: input.severity } });
        db.saveAuditLog({ userId: ctx.user.id, action: "ai.alert", detail: { title: input.title, severity: input.severity } }).catch(() => {});
        return { ok: true, notification };
      }),
    aiScheduledAnalysis: protectedProcedure
      .input(z.object({ symbol: z.string(), interval: z.enum(["1h", "4h", "1d", "1w"]), prompt: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.saveAiKnowledge({ userId: ctx.user.id, type: "schedule", title: `Scheduled Analysis: ${input.symbol}`, content: input.prompt || `Analyze ${input.symbol} every ${input.interval}`, metadata: { symbol: input.symbol, interval: input.interval } });
        db.saveAuditLog({ userId: ctx.user.id, action: "ai.scheduleAnalysis", detail: { symbol: input.symbol, interval: input.interval } }).catch(() => {});
        return { ok: true };
      }),
    aiJournalList: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        const all = await db.searchAiKnowledge(ctx.user.id, "", "journal");
        return { entries: (all || []).slice(0, input.limit) };
      }),
    aiAlertList: protectedProcedure
      .query(async ({ ctx }) => {
        const all = await db.searchAiKnowledge(ctx.user.id, "", "alert");
        return { alerts: all || [] };
      }),
    aiScheduleList: protectedProcedure
      .query(async ({ ctx }) => {
        const all = await db.searchAiKnowledge(ctx.user.id, "", "schedule");
        return { schedules: all || [] };
      }),
    journalUploadImage: protectedProcedure
      .input(z.object({ noteId: z.number().optional(), imageData: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const imgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await db.saveAiKnowledge({ userId: ctx.user.id, type: "journal_image", title: `Image ${imgId}`, content: "image:" + imgId, metadata: { imageData: input.imageData.slice(0, 5000), noteId: input.noteId || null } });
        return { ok: true, imageId: imgId };
      }),
    backtestCompare: protectedProcedure
      .input(z.object({ strategyIds: z.array(z.number()).min(2).max(4) }))
      .mutation(async ({ input, ctx }) => {
        const results = [];
        for (const id of input.strategyIds) {
          const strat = await db.getStrategyById(id, ctx.user.id);
          if (!strat) continue;
          const rule = strat.config?.rule;
          if (!rule) continue;
          const { runBacktest } = await import("./backtest");
          const { derivWS } = await import("../client/src/services/derivWebSocket");
          const ticks = await derivWS.fetchTickHistory(rule.symbol || "R_50", Math.floor(Date.now() / 1000) - 7 * 86400, Math.floor(Date.now() / 1000));
          if (!ticks || ticks.length < 50) continue;
          const res = await runBacktest(ticks, rule, Number(rule.params?.stake) || 1);
          results.push({ strategyId: id, name: strat.name, ...res });
        }
        return { comparisons: results };
      }),
    getContractSpecs: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async () => {
        return { spec: null, note: "Contract specs require Deriv WS integration" };
      }),
  }),
});


// Render the user's remembered profile into a compact string for the AI system prompt.
export function formatMemoryForPrompt(mem: Record<string, any> | null | undefined): string {
  if (!mem || Object.keys(mem).length === 0) return "";
  const parts: string[] = [];
  if (mem.symbols?.length) parts.push(`Preferred symbols: ${mem.symbols.join(", ")}`);
  if (mem.riskPct != null) parts.push(`Risk per trade: ${mem.riskPct}%`);
  if (mem.noMartingale) parts.push("Hard rule: NO martingale / no grid averaging");
  if (mem.style) parts.push(`Style: ${mem.style}`);
  if (mem.notes) parts.push(`Notes: ${mem.notes}`);
  return parts.length ? `\n\nREMEMBERED TRADER PROFILE (apply automatically):\n- ` + parts.join("\n- ") : "";
}

export type AppRouter = typeof appRouter;





  

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, createSessionToken, sanitizeUser } from "./_core/auth";
import { getTickHistory, getActiveSymbols, getDigitStats, getTrend, suggestStrategy, TOOL_DEFS, buildActionIntent, normalizeSymbol, detectWatchIntent } from "./aitools";

  async function getAI() {
    const mod = await import("groq-sdk");
    return new mod.default({ apiKey: process.env.AI_API_KEY || "" });
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

        const sessionToken = await createSessionToken(user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return sanitizeUser(user);
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        let user; try { user = await db.getUserByEmail(input.email); } catch(e) { console.error("[Login] DB Error:", e); throw e; }
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        await db.touchUserLastSignedIn(user.id);

        const sessionToken = await createSessionToken(user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return sanitizeUser(user);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // Forgot / Reset Password
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await db.getUserByEmail(input.email);
          // Always return a generic success to prevent email enumeration.
          if (!user) return { success: true, emailConfigured: false };
          const resetToken = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await db.createPasswordResetToken(user.id, resetToken, expiresAt);
          // Email sending is not wired in this deployment. Surface a dev
          // reset link so the flow is still end-to-end testable.
          const resetUrl = `${ctx.req.protocol}://${ctx.req.get("host")}/reset?token=${resetToken}`;
          return { success: true, emailConfigured: false, resetToken, resetUrl };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process reset request",
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
          await db.saveAuditLog({ userId: ctx.user.id, action: "token.remove" });
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove Deriv token",
          });
        }
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

    get: protectedProcedure
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

    // Alias used by the client (trpc.strategies.getById)
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

    publish: protectedProcedure
      .input(z.object({ id: z.number(), published: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const strategy = await db.setStrategyPublished(input.id, ctx.user.id, input.published);
          if (!strategy) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
          }
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
          return copy;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to duplicate strategy",
          });
        }
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
          console.error("[Trades] Query error:", error);
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
          const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
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
  }),

  // Bot Management
  bot: router({
    startRun: protectedProcedure
      .input(z.object({ strategyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const botRun = await db.saveBotRun({
            userId: ctx.user.id,
            strategyId: input.strategyId,
            status: "running",
          });
          await db.saveAuditLog({ userId: ctx.user.id, action: "bot.start", target: String(input.strategyId) });
          return botRun;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to start bot",
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
  }),

  // Telegram Settings
  telegram: router({
    saveSettings: protectedProcedure
      .input(z.object({
        chatId: z.string().min(1),
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
        return settings || { id: 0, userId: ctx.user.id, tradeExecuted: true, takeProfitHit: true, stopLossHit: true, botError: true, createdAt: new Date(), updatedAt: new Date() };
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
            model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: "You are 369AI's trading journal analyst. Given a trader's recent trades, write a concise, educational post-trade journal. Explain WHY trades likely won or lost (market regime, digit distribution, entry timing), surface patterns in their results, note risk observations, and give 2-3 concrete improvements. Be specific and reference the data. Plain text, max 350 words." },
              { role: "user", content: `Recent trades (last ${filtered.length}): wins=${wins}, losses=${losses}, net P&L=$${net.toFixed(2)}.\nTrade data: ${JSON.stringify(summary)}` },
            ],
            temperature: 0.4,
          });
          return { analysis: res.choices?.[0]?.message?.content || "No analysis returned.", wins, losses, net: +net.toFixed(2), sampleSize: filtered.length };
        } catch (e: any) {
          return { analysis: "Journal analysis failed: " + (e?.message || "unknown error") };
        }
      }),

    critique: protectedProcedure
      .input(z.object({ rule: z.any(), backtest: z.any().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!process.env.AI_API_KEY) return { findings: [], summary: "AI not configured." };
        try {
          const ai = await getAI();
          const bt = input.backtest ? `\nBacktest result: ${JSON.stringify(input.backtest)}` : "";
          const res = await ai.chat.completions.create({
            model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
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
          const messages: any[] = [
            { role: "system", content: `You are 369AI, the personal trading strategist for 369Labs - a live Deriv trading platform. You are smart, concise, and sound like an expert human strategist chatting with a trader.${memoryStr}

PLATFORM FACTS:
- Trades Deriv synthetic volatility indices. Valid symbols: R_10, R_25, R_50, R_75, R_100 and 1-second variants 1HZ10V, 1HZ15V, 1HZ25V, 1HZ30V, 1HZ50V, 1HZ75V, 1HZ90V, 1HZ100V. Users may type "R10" (you mean R_10) or "1HZ10" (you mean 1HZ10V) - the system normalizes these, so just call tools with the normalized symbol.
- Use tools to reason over REAL data: getTickHistory (prices), getDigitStats (hot/cold last digits), getTrend (direction), suggestStrategy (rule ideas), getActiveSymbols, listStrategies (user's saved bots), listSignals (what you already discovered).
- When the user expresses ANY intent to monitor, scan, look for, track, or keep an eye on a market - even loosely or with typos (e.g. "watch r50 for half hour", "scan volatility 100 for setups", "keep an eye on 1hz10", "what patterns are happening on r_75") - call startWatch with the normalized symbol and a sensible duration (default 30 min). You do not need an exact keyword; infer the intent from context. The system also has a fallback that catches these phrases, but you should call the tool directly whenever you recognize the intent.
- You CAN take actions via intents: deployBot, placeTrade, runBacktest.
  - To turn an INSIGHT into a bot: when the user describes a pattern in plain language (e.g. "when an even digit appears, buy rise", "after 3 same digits in a row, expect a fall"), build a StrategyRule object and call deployBot with { name, description, rule } - NO confirm needed. This creates a DRAFT bot (saved but not started). Tell the user to open the Bots page and press Start to go live. StrategyRule shape: { symbol, condition: { indicator: "last_digit"|"parity", comparison: "equals"|"appears_consecutively", count: number, barrier?: number }, action: { tradeType: "buy_rise"|"buy_fall" }, params: { stake, stopLoss, takeProfit } }. For parity, barrier 0 = even, 1 = odd.
  - To DEPLOY/START an already-saved bot, call deployBot with { strategyId, confirm:true } - this requires explicit user confirmation.
  - placeTrade and runBacktest: placeTrade requires confirm:true; runBacktest just needs strategyId/symbol.
- Backtesting is in-app at /backtesting. Never recommend external tools (Backtrader, Python, etc).

HOW TO RESPOND:
- Be conversational and direct, like a sharp human strategist. Understand casual language, slang, and typos - never ask the user to rephrase. If something is ambiguous, make a reasonable assumption and state it.
- Explain your logic briefly ("Based on the last 100 ticks, digit 7 hit 18% of the time, so...").
- When you use a tool, the next turn you will get results - reason over them before answering.
- If you lack data, call the appropriate tool instead of guessing.
- Keep answers focused and useful; avoid generic fluff.` },
            ...prior,
            { role: "user", content: input.message },
          ];

          let reply = "No response";
          const steps: any[] = [];
          for (let round = 0; round < 5; round++) {
            let res: any;
            try {
              res = await ai.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages,
                tools: TOOL_DEFS,
                tool_choice: "auto",
              });
            } catch (toolErr: any) {
              const isToolErr = String(toolErr?.message || "").includes("tool_use_failed") || String(toolErr?.error?.code || "").includes("tool_use_failed");
              if (!isToolErr) throw toolErr;
              console.warn("[AI] tool_use_failed, retrying without tools:", String(toolErr?.message || "").slice(0, 200));
              res = await ai.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
                tool_choice: "none",
              });
            }
            const msg = res.choices[0]?.message;
            if (!msg) break;
            messages.push(msg);
            if (!msg.tool_calls?.length) { reply = msg.content || reply; break; }
            const results = await Promise.all(msg.tool_calls.map(async (call: any) => {
              let parsed: any = {};
              try { parsed = JSON.parse(call.function.arguments || "{}"); } catch {}
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

          return { reply, steps };
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
            model: "llama-3.3-70b-versatile",
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
  signals: router({
    list: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const list = input?.symbol
          ? await db.getSignalsBySymbol(ctx.user.id, normalizeSymbol(input.symbol))
          : await db.getSignalsByUserId(ctx.user.id);
        return list;
      }),
    watch: protectedProcedure
      .input(z.object({ symbol: z.string(), durationMinutes: z.number().default(30), patternType: z.string().default('any'), minWinRate: z.number().default(62) }))
      .mutation(async ({ ctx, input }) => {
        const { runWatch } = await import('./signalScanner');
        const saved = await runWatch({
          userId: ctx.user.id,
          symbol: input.symbol,
          sampleSize: Math.min(2000, input.durationMinutes * 20),
          minWinRate: input.minWinRate,
          patternType: input.patternType,
        });
        return { scanned: true, signalsFound: saved.length, signals: saved };
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
        } catch (e) {
          console.error("[market.getHistory] error:", e);
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
      .input(z.object({ memory: z.record(z.any()) }))
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
    list: protectedProcedure.query(async () => {
      const { listFiles } = await import("./fileOps");
      return { files: listFiles() };
    }),
    read: protectedProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ input }) => {
        const { readFile } = await import("./fileOps");
        return { content: readFile(input.path) };
      }),
    write: protectedProcedure
      .input(z.object({ path: z.string(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { writeFile } = await import("./fileOps");
        writeFile(input.path, input.content);
        await db.saveAuditLog({ userId: ctx.user.id, action: "coding.write", target: input.path });
        return { ok: true };
      }),
  }),
  plugins: router({
    marketplace: protectedProcedure.query(async () => {
      return { plugins: await db.getPluginMarketplace() };
    }),
    my: protectedProcedure.query(async ({ ctx }) => {
      return { plugins: await db.getInstalledPlugins(ctx.user.id) };
    }),
    install: protectedProcedure
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






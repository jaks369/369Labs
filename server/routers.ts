import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, createSessionToken } from "./_core/auth";
import { getTickHistory, getActiveSymbols, getDigitStats, getTrend, suggestStrategy, TOOL_DEFS, buildActionIntent, normalizeSymbol } from "./aitools";

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
      return { error: "Unknown tool" };
    } catch (e) { return { error: String(e) }; }
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

        return user;
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log("[Login] Attempting login for:", input.email); let user; try { user = await db.getUserByEmail(input.email); console.log("[Login] User found:", !!user); } catch(e) { console.error("[Login] DB Error:", e); throw e; }
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

        return user;
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
          if (user) {
            // In production, send reset email with token
            // For now, log the reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            console.log('[PASSWORD RESET] Email:', input.email, 'Token:', resetToken);
            // TODO: Store token in DB with expiry, send email
          }
          // Always return success to prevent email enumeration
          return { success: true };
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
          // TODO: Verify token from DB, check expiry, update password
          const valid = false; // placeholder
          if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
          const passwordHash = await hashPassword(input.password);
          // await db.updateUserPassword(userId, passwordHash);
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
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const strategy = await db.saveStrategy({
            userId: ctx.user.id,
            name: input.name,
            description: input.description,
            config: input.config,
            isActive: true,
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
          const messages: any[] = [
            { role: "system", content: `You are 369AI, the personal trading strategist for 369Labs - a live Deriv trading platform. You are smart, concise, and sound like an expert human strategist chatting with a trader.

PLATFORM FACTS:
- Trades Deriv synthetic volatility indices. Valid symbols: R_10, R_25, R_50, R_75, R_100 and 1-second variants 1HZ10V, 1HZ15V, 1HZ25V, 1HZ30V, 1HZ50V, 1HZ75V, 1HZ90V, 1HZ100V. Users may type "R10" (you mean R_10) or "1HZ10" (you mean 1HZ10V) - the system normalizes these, so just call tools with the normalized symbol.
- Use tools to reason over REAL data: getTickHistory (prices), getDigitStats (hot/cold last digits), getTrend (direction), suggestStrategy (rule ideas), getActiveSymbols, listStrategies (user's saved bots).
- You CAN take actions via intents: deployBot, placeTrade, runBacktest. These require the user to CONFIRM - if a tool returns "Confirmation required", stop and ask the user to confirm before re-calling with confirm:true. Never assume confirmation.
- Backtesting is in-app at /backtesting. Never recommend external tools (Backtrader, Python, etc).

HOW TO RESPOND:
- Be conversational and direct. Explain your logic briefly ("Based on the last 100 ticks, digit 7 hit 18% of the time, so...").
- When you use a tool, the next turn you will get results - reason over them before answering.
- If you lack data, call the appropriate tool instead of guessing.
- Keep answers focused and useful; avoid generic fluff.` },
            ...prior,
            { role: "user", content: input.message },
          ];

          let reply = "No response";
          const steps: any[] = [];
          for (let round = 0; round < 5; round++) {
            const res = await ai.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages,
              tools: TOOL_DEFS,
              tool_choice: "auto",
            });
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
          return { reply, steps };
        } catch (e) { console.error("[AI]", e); return { reply: "Error: " + String(e) }; }
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
});

export type AppRouter = typeof appRouter;

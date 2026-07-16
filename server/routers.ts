import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, createSessionToken } from "./_core/auth";
import { getTickHistory, getActiveSymbols } from "./aitools";

  async function getAI() {
    const mod = await import("groq-sdk");
    return new mod.default({ apiKey: process.env.AI_API_KEY || "" });
  }

  const TOOL_DEFS = [
    { type: "function", function: { name: "getTickHistory", description: "Get recent tick data", parameters: { type: "object", properties: { symbol: { type: "string" }, count: { type: "number" } }, required: ["symbol"] } } },
    { type: "function", function: { name: "getActiveSymbols", description: "List available symbols", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "analyzeDigits", description: "Analyze digit frequency from ticks", parameters: { type: "object", properties: { ticks: { type: "array", items: { type: "object" } } }, required: ["ticks"] } } },
    { type: "function", function: { name: "analyzePattern", description: "Analyze price patterns", parameters: { type: "object", properties: { ticks: { type: "array", items: { type: "object" } } }, required: ["ticks"] } } },
  ];

  async function runTool(name: string, args: any) {
    if (name === "getTickHistory") { try { const t = await getTickHistory(args.symbol, args.count || 100); return { data: t }; } catch (e) { return { error: String(e) }; } }
    if (name === "getActiveSymbols") { try { const s = await getActiveSymbols(); return { data: s }; } catch (e) { return { error: String(e) }; } }
    if (name === "analyzeDigits") {
      const ticks = args.ticks || []; if (!ticks.length) return { error: "No ticks" };
      const digits = ticks.map((t: any) => { const f = t.price.toFixed(2); return parseInt(f[f.length-1], 10); });
      const counts = Array(10).fill(0); digits.forEach(d => counts[d]++);
      const total = digits.length;
      return { data: { total, frequency: counts.map((c,i) => ({ digit: i, count: c, percent: ((c/total)*100).toFixed(1) })), even: ((digits.filter(d=>d%2===0).length/total)*100).toFixed(1), odd: ((digits.filter(d=>d%2!==0).length/total)*100).toFixed(1), over5: ((digits.filter(d=>d>=5).length/total)*100).toFixed(1), under5: ((digits.filter(d=>d<5).length/total)*100).toFixed(1) } };
    }
    if (name === "analyzePattern") {
      const ticks = args.ticks || []; if (ticks.length < 2) return { error: "Need 2+ ticks" };
      const prices = ticks.map((t: any) => t.price);
      const changes = prices.slice(1).map((p,i) => p - prices[i]);
      const up = changes.filter(c => c > 0).length; const down = changes.filter(c => c < 0).length;
      return { data: { total: ticks.length, up, down, upPercent: ((up/changes.length)*100).toFixed(1), downPercent: ((down/changes.length)*100).toFixed(1), avgChange: (changes.reduce((a,b)=>a+b,0)/changes.length).toFixed(4), first: prices[0], last: prices[prices.length-1], change: (prices[prices.length-1]-prices[0]).toFixed(4) } };
    }
    return { error: "Unknown tool" };
  }

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

  // AI Agent
  ai: router({
    ask: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .mutation(async ({ input }) => {
        if (!process.env.AI_API_KEY) return { reply: "AI not configured. Add AI_API_KEY to .env" };
        try {
          const ai = await getAI();
          const res = await ai.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: "You are 369AI trading assistant. Use tools to fetch live data." }, { role: "user", content: input.message }],
            tools: TOOL_DEFS,
            tool_choice: "auto",
          });
          const msg = res.choices[0]?.message;
          if (!msg) return { reply: "No response" };
          if (msg.tool_calls?.length) {
            const results = await Promise.all(msg.tool_calls.map(async (call: any) => {
              try { return { tool: call.function.name, result: await runTool(call.function.name, JSON.parse(call.function.arguments || "{}")) }; } catch (e) { return { tool: call.function.name, result: { error: String(e) } }; }
            }));
            const res2 = await ai.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: "Explain trading data results." },
                { role: "user", content: input.message },
                { role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls },
                { role: "tool", content: JSON.stringify(results), tool_call_id: msg.tool_calls[0].id }
              ],
            });
            return { reply: res2.choices[0]?.message?.content || "Done." };
          }
          return { reply: msg.content || "No response" };
        } catch (e) { console.error("[AI]", e); return { reply: "Error: " + String(e) }; }
      }),
  }),
});

export type AppRouter = typeof appRouter;

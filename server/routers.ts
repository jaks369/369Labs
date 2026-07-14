import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, createSessionToken } from "./_core/auth";

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
        const user = await db.getUserByEmail(input.email);
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
        published: z.boolean().optional(),
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

    marketplace: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(strategies).where(eq(strategies.published, true)).orderBy(desc(strategies.createdAt));
    }),

    marketplace: publicProcedure.query(async () => {
      return await db.getMarketplaceStrategies();
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
        symbol: z.string().optional(),
        contractType: z.string().optional(),
        symbol: z.string().optional(),
        contractType: z.string().optional(),
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
});

  // AI Assistant
  ai: router({
    ask: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const msg = input.message.toLowerCase();
        if (msg.includes("strategy") || msg.includes("build") || msg.includes("create"))
          return { reply: "Head to the **Strategy Builder** and switch to **IF/THEN** mode. Set your condition (e.g., 'if digit over 5 appears 3 times consecutively') and action (e.g., 'buy rise'). Save it, then deploy from the **Bots** page." };
        if (msg.includes("backtest") || msg.includes("test") || msg.includes("history"))
          return { reply: "Go to **Backtesting**, pick a symbol and date range, select your saved strategy, and click **Run Backtest**. The engine fetches real historical ticks from Deriv and simulates every trade." };
        if (msg.includes("token") || msg.includes("api") || msg.includes("connect"))
          return { reply: "Go to **Settings** and paste your Deriv API token. Create one at https://app.deriv.com/account/api-token with 'Trade' and 'Read' permissions." };
        if (msg.includes("balance") || msg.includes("account"))
          return { reply: "Your live Deriv balance appears on the **Dashboard** after you add your API token in Settings. It updates in real-time via WebSocket." };
        if (msg.includes("market") || msg.includes("symbol"))
          return { reply: "Select any symbol from the **Dashboard** market picker — Volatility indices (R_10–R_200), Boom & Crash, Forex pairs. Live ticks stream for the selected symbol." };
        if (msg.includes("risk") || msg.includes("martingale") || msg.includes("money"))
          return { reply: "Risk management is configured per-strategy in the **Strategy Builder** (IF/THEN mode). Set stake, trade frequency, and stop conditions. Start small — $1–$10 per trade on demo." };
        if (msg.includes("profit") || msg.includes("pnl") || msg.includes("win"))
          return { reply: "Check **Analytics** for full P&L breakdown, win rate, and trade history. The **Dashboard** shows recent trades and live P&L." };
        if (msg.includes("cloud") || msg.includes("deploy") || msg.includes("bot"))
          return { reply: "Create a strategy in **Strategy Builder** (IF/THEN mode), then go to **Bots** and click **Deploy Bot**. The engine trades via Deriv WebSocket." };
        return { reply: `I can help with:\n\n• **Building strategies** — Strategy Builder (IF/THEN mode)\n• **Backtesting** — Historical tick replay against any symbol\n• **Deploying bots** — Real Deriv trades via Bots page\n• **Analytics** — Win rate, P&L, trade history\n• **Token setup** — Settings > Deriv API token\n\nWhat would you like help with?` };
      }),
  }),
});

export type AppRouter = typeof appRouter;
});

export type AppRouter = typeof appRouter;

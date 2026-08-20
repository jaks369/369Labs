import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { timingSafeEqual } from "crypto";
import * as db from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Per-user 2FA attempt limiter for admin step-up (prevents TOTP brute-force).
const twoFAAttempts = new Map<number, { count: number; resetAt: number }>();
const TWOFA_MAX_ATTEMPTS = 5;
const TWOFA_WINDOW_MS = 60_000;

function checkTwoFAAttempts(userId: number): void {
  const now = Date.now();
  const entry = twoFAAttempts.get(userId);
  if (entry && now < entry.resetAt) {
    if (entry.count >= TWOFA_MAX_ATTEMPTS) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many 2FA attempts. Try again in a minute." });
    }
    entry.count++;
  } else {
    twoFAAttempts.set(userId, { count: 1, resetAt: now + TWOFA_WINDOW_MS });
  }
  if (twoFAAttempts.size > 10000) {
    const nowMs = Date.now();
    for (const [uid, e] of twoFAAttempts) {
      if (nowMs > e.resetAt) twoFAAttempts.delete(uid);
    }
  }
}

const csrfCheck = t.middleware(async opts => {
  const { ctx, next } = opts;
  const origin = ctx.req.headers["origin"];
  const host = ctx.req.headers["host"];
  const method = ctx.req.method;

  // Only check CSRF on mutating methods
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (isMutating) {
    if (!origin || !host) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Missing Origin header" });
    }
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw new TRPCError({ code: "FORBIDDEN", message: "CSRF check failed" });
      }
    } catch {
      throw new TRPCError({ code: "FORBIDDEN", message: "CSRF check failed" });
    }
  }
  return next(opts);
});

export const publicProcedure = t.procedure.use(csrfCheck);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(csrfCheck).use(requireUser);

export const adminProcedure = t.procedure.use(csrfCheck).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/** Admin step-up procedure: requires 2FA verification for destructive admin actions */
export const adminStepUpProcedure = t.procedure.use(csrfCheck).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    // Check if user has 2FA enabled
    if (!ctx.user.twoFactorEnabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: "2FA required for admin step-up" });
    }

    // Verify 2FA token from header
    const twoFAToken = ctx.req.headers["x-2fa-token"] as string | undefined;
    if (!twoFAToken || twoFAToken.length !== 6) {
      throw new TRPCError({ code: "FORBIDDEN", message: "2FA token required (X-2FA-Token header)" });
    }

    // Rate-limit TOTP attempts to prevent brute-force of the 6-digit code.
    checkTwoFAAttempts(ctx.user.id);

    // Verify TOTP - fetch the secret from DB
    const user = await db.getUserById(ctx.user.id);
    if (!user || !user.twoFASecret) {
      throw new TRPCError({ code: "FORBIDDEN", message: "2FA not configured" });
    }

    const { generateTOTP } = await import("./auth");
    const epoch = Math.floor(Date.now() / 30000);
    let valid = false;
    for (let i = -1; i <= 1; i++) {
      const expected = generateTOTP(user.twoFASecret, epoch + i);
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(twoFAToken))) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Invalid 2FA token" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
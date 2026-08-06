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

const csrfCheck = t.middleware(async opts => {
  const { ctx, next } = opts;
  const origin = ctx.req.headers["origin"];
  const host = ctx.req.headers["host"];
  if (origin && host) {
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
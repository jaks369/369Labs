import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

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

export const adminProcedure = t.procedure.use(
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

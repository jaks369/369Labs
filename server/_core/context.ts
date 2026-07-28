import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authenticateRequest } from "./auth";

export type SanitizedUser = {
  id: number;
  name: string | null;
  role: "user" | "admin";
  email: string;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  avatarUrl: string | null;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: SanitizedUser | null;
  sessionId: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sessionId: string | null = null;

  try {
    const result = await authenticateRequest(opts.req);
    user = result.user;
    sessionId = result.sessionId;
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionId,
  };
}

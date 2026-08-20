import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS, SESSION_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import type { User } from "../../drizzle/schema";
import type { SanitizedUser } from "./context";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const;

export function generateTOTP(secretHex: string, epoch: number): string {
  const key = Buffer.from(secretHex, "hex");
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(epoch, 4);
  const hmac = createHmac("sha1", key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1000000).toString().padStart(6, "0");
}

export function sanitizeUser(u: User | null | undefined): SanitizedUser | null | undefined {
  if (!u) return u;
  const { passwordHash, twoFASecret, ...rest } = u;
  return rest as SanitizedUser;
}
/** Hash a plaintext password for storage. Format: "salt:derivedKeyHex". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/** Check a plaintext password against a stored hash, using a timing-safe comparison. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuffer, derivedKey);
}

type SessionPayload = { userId: number; sessionId: string };

function getSessionSecret() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured. Set it in your environment variables.");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

/** Sign a session JWT for a given user id and session id. */
export async function createSessionToken(
  userId: number,
  sessionId: string,
  expiresInMs: number = SESSION_MS
): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  return new SignJWT({ userId, sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    const { userId, sessionId } = payload as Record<string, unknown>;
    if (typeof userId !== "number") return null;
    return { userId, sessionId: typeof sessionId === "string" ? sessionId : "" };
  } catch (error) {
    console.warn("[Auth] Session verification failed", String(error));
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return new Map<string, string>();
  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

/** Authenticate an incoming request via session cookie (or Bearer header fallback). Returns user and sessionId. */
export async function authenticateRequest(req: Request): Promise<{ user: SanitizedUser; sessionId: string | null }> {
  const cookies = parseCookies(req.headers.cookie);
  const cookieVal = cookies.get(COOKIE_NAME);
  let sessionToken = cookieVal;

  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
  }

  const payload = await verifySessionToken(sessionToken);
  if (!payload) {
    console.log(`[auth] FAIL verifySessionToken — token invalid`);
    throw ForbiddenError("Invalid session cookie");
  }

  // Check if session was revoked
  if (payload.sessionId) {
    let session: any;
    try {
      session = await db.getSessionBySessionId(payload.sessionId);
    } catch (e: any) {
      console.log(`[auth] FAIL getSessionBySessionId: ${e?.message || e}`);
      throw ForbiddenError("Session revoked");
    }
    if (!session || session.revokedAt) {
      console.log(`[auth] FAIL session ${session ? "revoked" : "not found"}`);
      throw ForbiddenError("Session revoked");
    }
    const now = Date.now();
    const lastActive = new Date(session.lastActiveAt).getTime();
    if (now - lastActive > 60000) {
      db.touchSessionLastActive(payload.sessionId).catch(() => {});
    }
  }

  let user: User | null = null;
  try {
    user = (await db.getUserById(payload.userId)) ?? null;
  } catch (e: any) {
    console.log(`[auth] FAIL getUserById: ${e?.message || e}`);
    throw ForbiddenError("User not found");
  }
  if (!user) {
    console.log(`[auth] FAIL user not found userId=${payload.userId}`);
    throw ForbiddenError("User not found");
  }

  // IP whitelist check
  let whitelist: any[] = [];
  try {
    whitelist = await db.getIpWhitelist(payload.userId);
  } catch {
    // table may not exist
  }
  if (whitelist.length > 0) {
    // Use req.ip (Express resolves it from the trusted proxy) instead of the
    // raw X-Forwarded-For header, which clients can spoof to bypass the check.
    const clientIp = req.ip || req.socket?.remoteAddress || "";
    const matched = whitelist.some(e => clientIp === e.ip);
    if (!matched) {
      console.log(`[auth] FAIL ip not whitelisted: ${clientIp}`);
      throw ForbiddenError("Access denied: IP not whitelisted");
    }
  }

  return { user: sanitizeUser(user)!, sessionId: payload.sessionId || null };
}

/** Create a new session token and revoke the old one. Used for security-sensitive changes. */
export async function regenerateSession(
  userId: number,
  oldSessionId: string | null,
  req: Request,
  res: any
): Promise<string> {
  if (oldSessionId) {
    await db.revokeSession(oldSessionId, userId);
  }
  const sessionId = randomBytes(16).toString("hex");
  await db.createSession({ userId, sessionId, userAgent: req.headers["user-agent"] || null, ip: req.ip || null });
  const sessionToken = await createSessionToken(userId, sessionId);
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });
  return sessionToken;
}

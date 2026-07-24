import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;

export function sanitizeUser(u: any): any {
  if (!u) return u;
  const { passwordHash, twoFASecret, ...rest } = u;
  return rest;
}
/** Hash a plaintext password for storage. Format: "salt:derivedKeyHex". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/** Check a plaintext password against a stored hash, using a timing-safe comparison. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
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
  expiresInMs: number = ONE_YEAR_MS
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
export async function authenticateRequest(req: Request): Promise<{ user: User; sessionId: string | null }> {
  const cookies = parseCookies(req.headers.cookie);
  const cookieVal = cookies.get(COOKIE_NAME);
  let sessionToken = cookieVal;

  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
  }

  console.log(`[auth] cookie=${cookieVal ? "found" : "missing"}, bearer=${req.headers.authorization?.startsWith("Bearer ") ? "found" : "missing"}, token=${sessionToken ? sessionToken.slice(0,15)+"..." : "null"}`);

  const payload = await verifySessionToken(sessionToken);
  if (!payload) {
    console.log(`[auth] FAIL verifySessionToken returned null`);
    throw ForbiddenError("Invalid session cookie");
  }
  console.log(`[auth] OK payload userId=${payload.userId}, hasSessionId=${!!payload.sessionId}`);

  // Check if session was revoked
  if (payload.sessionId) {
    let session: any;
    try {
      session = await db.getSessionBySessionId(payload.sessionId);
    } catch (e: any) {
      console.log(`[auth] FAIL getSessionBySessionId threw: ${e?.message || e}`);
      throw ForbiddenError("Session revoked");
    }
    if (!session || session.revokedAt) {
      console.log(`[auth] FAIL session ${session ? "revoked" : "not found"}`);
      throw ForbiddenError("Session revoked");
    }
    // Touch lastActiveAt periodically (once per minute per session)
    const now = Date.now();
    const lastActive = new Date(session.lastActiveAt).getTime();
    if (now - lastActive > 60000) {
      db.touchSessionLastActive(payload.sessionId).catch(() => {});
    }
  }

  let user: User | null = null;
  try {
    user = await db.getUserById(payload.userId);
  } catch (e: any) {
    console.log(`[auth] FAIL getUserById threw: ${e?.message || e}`);
    throw ForbiddenError("User not found");
  }
  if (!user) {
    console.log(`[auth] FAIL user not found for userId=${payload.userId}`);
    throw ForbiddenError("User not found");
  }
  console.log(`[auth] OK user found id=${user.id}`);

  // IP whitelist check
  let whitelist: any[] = [];
  try {
    whitelist = await db.getIpWhitelist(payload.userId);
  } catch (e: any) {
    console.log(`[auth] getIpWhitelist threw (table may not exist): ${e?.message || e}`);
  }
  if (whitelist.length > 0) {
    const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const matched = whitelist.some(e => clientIp.startsWith(e.ip));
    if (!matched) {
      console.log(`[auth] FAIL ip not whitelisted: ${clientIp}`);
      throw ForbiddenError("Access denied: IP not whitelisted");
    }
  }

  console.log(`[auth] SUCCESS authenticated userId=${user.id}`);
  return { user: sanitizeUser(user), sessionId: payload.sessionId || null };
}

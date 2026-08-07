import { Router, Request, Response } from "express";
import crypto from "crypto";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken, hashPassword } from "./auth";
import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import * as db from "../db";

// The OAuth provider must redirect back to the server endpoint that exchanges
// the authorization code and sets the session cookie (mounted at /api/auth).
const OAUTH_REDIRECT = `${ENV.appUrl}/api/auth/callback`;

export const oauthRouter = Router();

const OAUTH_STATE_COOKIE = "oauth_state";

function generateState(): { state: string; cookieOpts: any } {
  const state = crypto.randomBytes(16).toString("hex");
  return {
    state,
    cookieOpts: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: ENV.isProduction,
      maxAge: 600_000, // 10 minutes
      path: "/",
    },
  };
}

// Google OAuth
oauthRouter.get("/google", (_req: Request, res: Response) => {
  if (!ENV.googleClientId) {
    return res.status(503).json({ error: "Google OAuth not configured" });
  }
  const { state, cookieOpts } = generateState();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ENV.googleClientId);
  url.searchParams.set("redirect_uri", `${OAUTH_REDIRECT}?provider=google`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("state", state);
  res.cookie(OAUTH_STATE_COOKIE, state, cookieOpts);
  res.redirect(url.toString());
});

oauthRouter.get("/github", (_req: Request, res: Response) => {
  if (!ENV.githubClientId) {
    return res.status(503).json({ error: "GitHub OAuth not configured" });
  }
  const { state, cookieOpts } = generateState();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", ENV.githubClientId);
  url.searchParams.set("redirect_uri", `${OAUTH_REDIRECT}?provider=github`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  res.cookie(OAUTH_STATE_COOKIE, state, cookieOpts);
  res.redirect(url.toString());
});

oauthRouter.get("/callback", async (req: Request, res: Response) => {
  const { code, provider, state } = req.query as { code?: string; provider?: string; state?: string };
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const cookieState = cookies[OAUTH_STATE_COOKIE];

  if (!state || !cookieState || state !== cookieState) {
    return res.redirect(`${ENV.appUrl}/login?oauth_error=invalid_state`);
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !provider) {
    return res.redirect(`${ENV.appUrl}/login?oauth_error=missing_params`);
  }

  try {
    let profile: { id: string; email: string; name: string };

    if (provider === "google") {
      profile = await handleGoogleCallback(code);
    } else if (provider === "github") {
      profile = await handleGitHubCallback(code);
    } else {
      return res.redirect(`${ENV.appUrl}/login?oauth_error=unknown_provider`);
    }

    // Find existing OAuth link or create/link user
    const existing = await db.getOAuthAccount(provider, profile.id);
    let userId: number;

    if (existing) {
      userId = existing.userId;
    } else {
      // Check if a user with this email already exists
      let user = profile.email ? await db.getUserByEmail(profile.email) : undefined;
      if (user) {
        userId = user.id;
      } else {
        // Create a new user
        const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
        user = await db.createUser({
          email: profile.email || `${profile.id}@${provider}.oauth`,
          passwordHash,
          name: profile.name || null,
        });
        userId = user.id;
      }
      // Link OAuth account
      await db.createOAuthAccount({ userId, provider, providerId: profile.id, email: profile.email, name: profile.name });
    }

    // Create session and redirect
    const sessionId = crypto.randomBytes(16).toString("hex");
    await db.createSession({ userId, sessionId, userAgent: req.headers["user-agent"] || null, ip: req.ip || null });
    const sessionToken = await createSessionToken(userId, sessionId);
    const cookieOptions = getSessionCookieOptions(req as any);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });
    res.redirect(`${ENV.appUrl}/dashboard`);
  } catch (error) {
    console.error(`[OAuth] ${provider} callback error:`, error);
    res.redirect(`${ENV.appUrl}/login?oauth_error=callback_failed`);
  }
});

async function handleGoogleCallback(code: string): Promise<{ id: string; email: string; name: string }> {
  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: `${OAUTH_REDIRECT}?provider=google`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw new Error("Google token exchange failed");

  // Fetch user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userRes.json() as any;
  return { id: userInfo.id, email: userInfo.email || "", name: userInfo.name || userInfo.given_name || "" };
}

async function handleGitHubCallback(code: string): Promise<{ id: string; email: string; name: string }> {
  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: ENV.githubClientId,
      client_secret: ENV.githubClientSecret,
      code,
      redirect_uri: `${OAUTH_REDIRECT}?provider=github`,
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw new Error("GitHub token exchange failed");

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github.v3+json" },
  });
  const userInfo = await userRes.json() as any;
  let email = userInfo.email || "";
  if (!email) {
    // Fetch primary email if not public
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github.v3+json" },
    });
    const emails = await emailRes.json() as any[];
    const primary = emails.find((e: any) => e.primary && e.verified);
    if (primary) email = primary.email;
  }
  return { id: String(userInfo.id), email, name: userInfo.name || userInfo.login || "" };
}

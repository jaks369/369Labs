import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";
import { getDb, pruneBadTicks, ensureSignalExpiryColumn, recomputeLastDigits, ensureUserMemoryTable, ensurePluginsTable, ensureWebhooksTable } from "../db";
import { users } from "../../drizzle/schema";
import { startTickCollector } from "../tickCollector";
import { runWatch } from "../signalScanner";
import { ENV } from "./env";
import { oauthRouter } from "./oauth";

process.on("unhandledRejection", (reason) => {
  console.error("[Startup] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Startup] Uncaught exception:", err);
});

function logStartupChecks() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");
  if (!ENV.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");

  if (missing.length > 0) {
    console.error(
      `[Startup] WARNING: Missing required environment variables: ${missing.join(", ")}. ` +
      `The app may not function correctly.`
    );
  }
}

export async function createApp() {
  logStartupChecks();

  let db = null;
  try {
    db = await getDb();
  } catch (e) {
    console.error("[Startup] Database connection failed (continuing without DB):", e);
  }
  if (!db) {
    console.error(
      "[Startup] Database is not available. API endpoints requiring the database will fail."
    );
  }

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.deriv.com https://*.tradingview.com https://apis.google.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' https: wss:; " +
      "font-src 'self' data:; " +
      "frame-src https://*.deriv.com https://*.tradingview.com https://accounts.google.com; " +
      "object-src 'none'"
    );
    next();
  });

  registerStorageProxy(app);
  app.use("/api/auth", oauthRouter);

  // Lightweight in-memory rate limiter (per-IP + per-key). Stricter caps on auth/trading/AI paths.
  const rateBuckets: Record<string, { count: number; reset: number }> = {};
  const RATE = (limit: number, windowMs: number) => (req: any, res: any, next: any) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const apiKey = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).slice(0, 16) : "";
    const key = apiKey ? `key:${apiKey}` : `ip:${ip}`;
    const now = Date.now();
    const b = rateBuckets[key] || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count++;
    rateBuckets[key] = b;
    if (b.count > limit) { res.status(429).json({ error: "Too many requests, slow down." }); return; }
    next();
  };
  app.use("/api/trpc", (req: any, res: any, next: any) => {
    const url: string = req.url || "";
    if (url.includes("signup") || url.includes("login") || url.includes("saveToken") || url.includes("removeToken") || url.includes("deleteAccount")) {
      return RATE(10, 60_000)(req, res, next); // 10 auth/token writes per minute
    }
    if (url.includes("startRun") || url.includes("stopRun") || url.includes("closePosition") || url.includes("save") && (url.includes("trades") || url.includes("strategies"))) {
      return RATE(30, 60_000)(req, res, next); // 30 trading writes per minute
    }
    if (url.includes("ai.") || url.includes("aiMarket") || url.includes("aiChat") || url.includes("aiPerformance") || url.includes("aiExplainability") || url.includes("aiCopilot") || url.includes("tradingCopilot")) {
      return RATE(60, 60_000)(req, res, next); // 60 AI requests per minute
    }
    return RATE(120, 60_000)(req, res, next); // 120 general requests per minute
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (!process.env.VERCEL && process.env.NODE_ENV !== "development") {
    serveStatic(app);
    const port = parseInt(process.env.PORT || "3000");
    // Bind the port FIRST so Render's port scanner always sees an open port,
    // even if later startup work (DB hygiene, collectors) fails.
    app.listen(port, () => {
      console.log(`[Startup] Server listening on 0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV})`);
    });
    // Non-critical startup work - fully isolated so a failure can never
    // take the server (and its open port) down.
    (async () => {
      try { startTickCollector(); } catch (e) { console.error("[startup] startTickCollector failed", e); }
      try { startAlwaysOnScanner(); } catch (e) { console.error("[startup] startAlwaysOnScanner failed", e); }
      try { await ensureSignalExpiryColumn(); } catch (e) { console.error("[startup] ensureSignalExpiryColumn failed", e); }
      try { await pruneBadTicks(); } catch (e) { console.error("[startup] pruneBadTicks failed", e); }
      try { await recomputeLastDigits(); } catch (e) { console.error("[startup] recomputeLastDigits failed", e); }
      try { await ensureUserMemoryTable(); } catch (e) { console.error("[startup] ensureUserMemoryTable failed", e); }
      try { await ensurePluginsTable(); } catch (e) { console.error("[startup] ensurePluginsTable failed", e); }
      try { await ensureWebhooksTable(); } catch (e) { console.error("[startup] ensureWebhooksTable failed", e); }
    })();
  }

  // Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[ErrorHandler]", err?.message || err);
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: err?.message || "Internal server error" });
  });

  return app;
}

// Always-on AI scanner: periodically scans the main volatility symbols for all users
// and records any repeatable pattern as a signal (the Marketplace feed). Runs every 10 min.
function startAlwaysOnScanner() {
  const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ50V", "1HZ100V"];
  const INTERVAL_MS = 10 * 60 * 1000;
  const tick = async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const allUsers = await db.select().from(users);
      for (const u of allUsers) {
        for (const sym of SYMBOLS) {
          try {
            await runWatch({ userId: u.id, symbol: sym, sampleSize: 600, minWinRate: 65, patternType: "any" });
          } catch (e) { console.error("[alwaysOnScanner] symbol", sym, e); }
        }
      }
      console.log("[alwaysOnScanner] cycle complete");
    } catch (e) { console.error("[alwaysOnScanner]", e); }
  };
  setTimeout(tick, 60 * 1000); // first run 1 min after boot
  setInterval(tick, INTERVAL_MS);
}

const appPromise = createApp();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});


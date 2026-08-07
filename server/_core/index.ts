import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";
import { getDb, pruneBadTicks, ensureSignalExpiryColumn, ensureSignalOosColumns, ensureSignalsTable, ensureNotificationSettingsColumns, ensureAuditLogsTable, ensureIpWhitelistTable, ensureTradesTable, ensureStrategiesTable, ensurePriceAlertsTable, ensureTickHistoryTable, recomputeLastDigits, ensureUserMemoryTable, ensurePluginsTable, ensureWebhooksTable, ensureAiKnowledgeTable, ensureUsersColumns, ensureSessionsTable, ensureSubscriptionsTable, ensureVerificationTokensTable, ensurePasswordResetTokensTable, ensureBotLogsTable } from "../db";
import { users } from "../../drizzle/schema";
import { startTickCollector } from "../tickCollector";
import { runWatch } from "../signalScanner";
import { ENV } from "./env";
import { oauthRouter } from "./oauth";
import { getStandardVolatilitySymbols } from "@shared/symbols";
import { logger, createRequestLogger, addCorrelationIdHeader } from "./logger";

process.on("unhandledRejection", (reason) => {
  logger.error("[Startup] Unhandled promise rejection", { error: String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("[Startup] Uncaught exception", { error: err.message, stack: err.stack });
});

function logStartupChecks() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");
  if (!ENV.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");

  if (missing.length > 0) {
    logger.warn(`[Startup] WARNING: Missing required environment variables: ${missing.join(", ")}. The app may not function correctly.`);
  }
}

export async function createApp() {
  logStartupChecks();

  let db = null;
  try {
    db = await getDb();
  } catch (e) {
    logger.error("[Startup] Database connection failed (continuing without DB)", { error: String(e) });
  }
  if (!db) {
    logger.error("[Startup] Database is not available. API endpoints requiring the database will fail.");
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Correlation ID middleware - must be first
  app.use((req: any, res: any, next: any) => {
    const correlationId = addCorrelationIdHeader(res);
    req.correlationId = correlationId;
    req.log = createRequestLogger(req);
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      req.log.info("HTTP request completed", {
        statusCode: res.statusCode,
        durationMs,
      });
    });
    next();
  });

  // Security headers
  app.use((_req: any, res: any, next: any) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.deriv.com https://*.tradingview.com https://apis.google.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' https: wss:; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "frame-src https://*.deriv.com https://*.tradingview.com https://accounts.google.com; " +
      "object-src 'none'"
    );
    next();
  });

  app.use("/api/auth", oauthRouter);

  // Stripe webhook — needs the raw body for signature verification,
  // so register it BEFORE the express.json body parser.
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req: any, res: any) => {
    try {
      const { handleStripeWebhook } = await import("../billing");
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) {
        res.status(400).json({ error: "Missing stripe-signature header" });
        return;
      }
      const result = await handleStripeWebhook(req.body, signature);
      res.json(result);
    } catch (e: any) {
      logger.error("[Stripe Webhook]", { error: e?.message || e });
      res.status(400).json({ error: e?.message || "Webhook handling failed" });
    }
  });

// Redis-backed rate limiter with in-memory fallback
const rateBuckets: Record<string, { count: number; reset: number }> = {};
let redisClient: any = null;

// Periodically prune expired in-memory buckets so the map cannot grow without
// bound (attackers rotating spoofable keys previously grew it indefinitely).
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of Object.entries(rateBuckets)) {
    if (now > b.reset) delete rateBuckets[key];
  }
}, 60_000).unref?.();

async function initRedis(): Promise<void> {
  try {
    // Use require to allow optional Redis dependency at compile time
    const RedisClient = require("ioredis");
    redisClient = new RedisClient({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
    redisClient.on("error", (e: Error) => console.warn("[Redis] connection error:", e.message));
    await redisClient.connect();
    console.log("[Redis] Connected for distributed rate limiting");
} catch (e: any) {
    console.warn("[Redis] Not available, falling back to in-memory rate limiting:", e?.message || e);
    redisClient = null;
  }
}

// Initialize Redis (non-blocking)
initRedis().catch(() => {});

async function rateLimitRedis(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  if (!redisClient) {
    // Fallback to in-memory
    const now = Date.now();
    const b = rateBuckets[key] || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count++;
    rateBuckets[key] = b;
    return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), reset: b.reset };
  }

  const keyPrefix = "ratelimit:";
  const redisKey = keyPrefix + key;
  const windowSec = Math.ceil(windowMs / 1000);
  
  try {
    const multi = redisClient.multi();
    multi.incr(redisKey);
    multi.pexpire(redisKey, windowMs);
    const results = await multi.exec();
    
    const count = results[0][1] as number;
    const ttl = await redisClient.pttl(redisKey);
    const reset = Date.now() + (ttl > 0 ? ttl : windowMs);
    
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), reset };
  } catch (e: any) {
    console.warn("[Redis] rate limit error, fallback to memory:", e?.message || e);
    const now = Date.now();
    const b = rateBuckets[key] || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count++;
    rateBuckets[key] = b;
    return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), reset: b.reset };
  }
}

const RATE = (limit: number, windowMs: number) => async (req: any, res: any, next: any) => {
  // Use req.ip (resolved from the trusted proxy). Reading the raw X-Forwarded-For
  // header here allowed clients to spoof it and rotate the header to bypass the
  // limiter. Also drop the JWT-header-prefix bucket: every HS256 token shares the
  // same header prefix, so all authenticated clients collided into ONE bucket.
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const key = `ip:${ip}`;

  const { allowed, remaining, reset } = await rateLimitRedis(key, limit, windowMs);

  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(reset / 1000));

  if (!allowed) {
    req.log?.warn("Rate limit exceeded", { limit, windowMs, ip });
    res.setHeader("Retry-After", Math.ceil((reset - Date.now()) / 1000));
    res.status(429).json({ error: "Too many requests, slow down." });
    return;
  }
  next();
};
  app.use("/api/trpc", async (req: any, res: any, next: any) => {
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
    if (url.includes("bot") || url.includes("deploy") || url.includes("stopRun")) {
      return RATE(20, 60_000)(req, res, next); // 20 bot management requests per minute
    }
    if (url.includes("settlement") || url.includes("reconcile")) {
      return RATE(10, 60_000)(req, res, next); // 10 settlement requests per minute
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

  // ===== Deriv OTP Proxy (bypasses browser CORS for Options REST API) =====
  // These endpoints proxy the Deriv Options API calls that the browser cannot
  // make directly due to CORS restrictions. The client (derivWebSocket.ts) will
  // call /api/deriv/accounts and /api/deriv/otp/:accountId instead of the
  // blocked api.derivws.com endpoints.
  const DERIV_API_BASE = process.env.DERIV_API_BASE || "https://api.deriv.com";
  const DERIV_APP_ID = process.env.DERIV_APP_ID || process.env.VITE_DERIV_APP_ID || "33V0MWtYaZLLmAZBWUycN";

  app.get("/api/deriv/accounts", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }
    const token = authHeader.slice(7);
    try {
      const response = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Deriv-App-ID": DERIV_APP_ID,
          Accept: "application/json",
        },
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (e) {
      logger.error("[deriv-proxy] accounts error", { error: String(e) });
      res.status(502).json({ error: "Upstream request failed" });
    }
  });

  app.get("/api/deriv/otp/:accountId", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }
    const token = authHeader.slice(7);
    const { accountId } = req.params;
    try {
      const response = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts/${accountId}/otp`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Deriv-App-ID": DERIV_APP_ID,
          Accept: "application/json",
        },
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (e) {
      logger.error("[deriv-proxy] otp error", { error: String(e) });
      res.status(502).json({ error: "Upstream request failed" });
    }
  });

  if (!process.env.VERCEL) {
    serveStatic(app);
    const port = parseInt(process.env.PORT || "3000");
    // Bind the port FIRST so Render's port scanner always sees an open port,
    // even if later startup work (DB hygiene, collectors) fails.
    const server = app.listen(port, () => {
      logger.info(`[Startup] Server listening on 0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV})`);
    });

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info(`[Shutdown] Received ${signal}, shutting down gracefully...`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info("[Shutdown] HTTP server closed");
      });
      
      try {
        const { stopExecutionEngine } = await import("../executionEngine");
        stopExecutionEngine();
        logger.info("[Shutdown] ExecutionEngine stopped");
      } catch (e) { logger.error("[Shutdown] ExecutionEngine stop failed", { error: String(e) }); }
      
      try {
        const { settlementTracker } = await import("../SettlementTracker");
        settlementTracker.stop();
        logger.info("[Shutdown] SettlementTracker stopped");
      } catch (e) { logger.error("[Shutdown] SettlementTracker stop failed", { error: String(e) }); }
      
      try {
        const { aiOrchestrator } = await import("../ai/AIOrchestrator");
        aiOrchestrator.stop();
        logger.info("[Shutdown] AIOrchestrator stopped");
      } catch (e) { logger.error("[Shutdown] AIOrchestrator stop failed", { error: String(e) }); }
      
      try {
        const { stopTickCollector } = await import("../tickCollector");
        stopTickCollector();
        logger.info("[Shutdown] TickCollector stopped");
      } catch (e) { logger.error("[Shutdown] TickCollector stop failed", { error: String(e) }); }
      
      try {
        const { stopAlwaysOnScanner } = await import("../signalScanner");
        stopAlwaysOnScanner();
        logger.info("[Shutdown] AlwaysOnScanner stopped");
      } catch (e) { logger.error("[Shutdown] AlwaysOnScanner stop failed", { error: String(e) }); }
      
      try {
        const { botRunner } = await import("../botRunner");
        await botRunner.stopAll(0); // 0 means all users - will be filtered
        logger.info("[Shutdown] BotRunner stopped all bots");
      } catch (e) { logger.error("[Shutdown] BotRunner stopAll failed", { error: String(e) }); }
      
      // Close DB pool
      try {
        const { getRawPool } = await import("../db");
        const pool = getRawPool();
        if (pool) {
          await pool.end();
          logger.info("[Shutdown] DB pool closed");
        }
      } catch (e) { logger.error("[Shutdown] DB pool close failed", { error: String(e) }); }
      
      // Close Redis connection
      try {
        if (redisClient) {
          await redisClient.disconnect().catch(() => {});
          logger.info("[Shutdown] Redis disconnected");
        }
      } catch (e) { logger.error("[Shutdown] Redis disconnect failed", { error: String(e) }); }

      logger.info("[Shutdown] Graceful shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGUSR2", () => shutdown("SIGUSR2")); // nodemon restart

    // Non-critical startup work - fully isolated so a failure can never
    // take the server (and its open port) down.
    (async () => {
      try { 
        if (process.env.NODE_ENV !== "development") {
          startTickCollector(); 
        }
      } catch (e) { logger.error("[startup] startTickCollector failed", { error: String(e) }); }
      try { 
        const { startAlwaysOnScanner } = await import("../signalScanner");
        startAlwaysOnScanner(); 
      } catch (e) { logger.error("[startup] startAlwaysOnScanner failed", { error: String(e) }); }
      try { await ensureSessionsTable(); } catch (e) { logger.error("[startup] ensureSessionsTable failed", { error: String(e) }); }
      try { await ensureSubscriptionsTable(); } catch (e) { logger.error("[startup] ensureSubscriptionsTable failed", { error: String(e) }); }
      try { await ensureUsersColumns(); } catch (e) { logger.error("[startup] ensureUsersColumns failed", { error: String(e) }); }
      try { await ensureSignalsTable(); } catch (e) { logger.error("[startup] ensureSignalsTable failed", { error: String(e) }); }
      try { await ensureSignalExpiryColumn(); } catch (e) { logger.error("[startup] ensureSignalExpiryColumn failed", { error: String(e) }); }
      try { await ensureSignalOosColumns(); } catch (e) { logger.error("[startup] ensureSignalOosColumns failed", { error: String(e) }); }
      try { await ensureNotificationSettingsColumns(); } catch (e) { logger.error("[startup] ensureNotificationSettingsColumns failed", { error: String(e) }); }
      try { await ensureAuditLogsTable(); } catch (e) { logger.error("[startup] ensureAuditLogsTable failed", { error: String(e) }); }
      try { await ensureIpWhitelistTable(); } catch (e) { logger.error("[startup] ensureIpWhitelistTable failed", { error: String(e) }); }
      try { await ensureTradesTable(); } catch (e) { logger.error("[startup] ensureTradesTable failed", { error: String(e) }); }
      try { await ensureStrategiesTable(); } catch (e) { logger.error("[startup] ensureStrategiesTable failed", { error: String(e) }); }
      try { await ensureTickHistoryTable(); } catch (e) { logger.error("[startup] ensureTickHistoryTable failed", { error: String(e) }); }
      try { await ensurePriceAlertsTable(); } catch (e) { logger.error("[startup] ensurePriceAlertsTable failed", { error: String(e) }); }
      try { await pruneBadTicks(); } catch (e) { logger.error("[startup] pruneBadTicks failed", { error: String(e) }); }
      try { await recomputeLastDigits(); } catch (e) { logger.error("[startup] recomputeLastDigits failed", { error: String(e) }); }
      try { await ensureUserMemoryTable(); } catch (e) { logger.error("[startup] ensureUserMemoryTable failed", { error: String(e) }); }
      try { await ensurePluginsTable(); } catch (e) { logger.error("[startup] ensurePluginsTable failed", { error: String(e) }); }
      try { await ensureWebhooksTable(); } catch (e) { logger.error("[startup] ensureWebhooksTable failed", { error: String(e) }); }
      try { await ensureAiKnowledgeTable(); } catch (e) { logger.error("[startup] ensureAiKnowledgeTable failed", { error: String(e) }); }
      try { await ensureVerificationTokensTable(); } catch (e) { logger.error("[startup] ensureVerificationTokensTable failed", { error: String(e) }); }
      try { await ensurePasswordResetTokensTable(); } catch (e) { logger.error("[startup] ensurePasswordResetTokensTable failed", { error: String(e) }); }
      try { await ensureBotLogsTable(); } catch (e) { logger.error("[startup] ensureBotLogsTable failed", { error: String(e) }); }
      try {
        const { aiOrchestrator } = await import("../ai/AIOrchestrator");
        aiOrchestrator.start();
        const { aiIntelligenceHub } = await import("../ai/AIIntelligenceHub");
        aiIntelligenceHub.onEvent((event) => {
          try {
            aiOrchestrator.addFeedEntry({
              id: "hub_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              type: event.type === "strategy_warning" ? "warning" : "insight",
              symbol: event.symbol,
              message: event.message,
              timestamp: event.timestamp,
            });
          } catch {}
        });
        logger.info("[startup] AI Intelligence Hub started");
      } catch (e) { logger.error("[startup] AI Intelligence Hub failed", { error: String(e) }); }
      try {
        const { settlementTracker } = await import("../SettlementTracker");
        settlementTracker.start();
      } catch (e) { logger.error("[startup] SettlementTracker failed", { error: String(e) }); }
      try {
        const { startExecutionEngine } = await import("../executionEngine");
        startExecutionEngine();
      } catch (e) { logger.error("[startup] ExecutionEngine failed", { error: String(e) }); }
      try {
        const { botRunner } = await import("../botRunner");
        await botRunner.restoreFromDb();
      } catch (e) { logger.error("[startup] BotRunner restore failed", { error: String(e) }); }
    })();
  }

  // Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    const correlationId = _req.correlationId;
    logger.error("[ErrorHandler]", { 
      error: err?.message || err, 
      stack: err?.stack,
      correlationId 
    });
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: err?.message || "Internal server error", correlationId });
  });

  return app;
}

// Always-on AI scanner: periodically scans the main volatility symbols for all users
// and records any repeatable pattern as a signal (the Marketplace feed). Runs every 10 min.
function startAlwaysOnScanner() {
  const SYMBOLS = getStandardVolatilitySymbols();
  const INTERVAL_MS = 10 * 60 * 1000;
  const tick = async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const allUsers = await db.select().from(users);
      for (const u of allUsers) {
        for (const sym of SYMBOLS) {
          try {
            await runWatch({ userId: u.id, symbol: sym, sampleSize: 600, minWinRate: 55, patternType: "any" });
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


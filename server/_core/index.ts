import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";
import { getDb, pruneBadTicks, ensureSignalExpiryColumn, ensureSignalsTable, ensureNotificationSettingsColumns, ensureAuditLogsTable, ensureIpWhitelistTable, ensureTradesTable, ensureStrategiesTable, ensurePriceAlertsTable, ensureTickHistoryTable, recomputeLastDigits, ensureUserMemoryTable, ensurePluginsTable, ensureWebhooksTable, ensureAiKnowledgeTable, ensureUsersColumns, ensureSessionsTable, ensureVerificationTokensTable, ensurePasswordResetTokensTable, ensureBotLogsTable } from "../db";
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

  // Lightweight in-memory rate limiter (per-IP + per-key). Stricter caps on auth/trading/bot endpoints.
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
    if (b.count > limit) { 
      req.log?.warn("Rate limit exceeded", { limit, windowMs, ip });
      res.status(429).json({ error: "Too many requests, slow down." }); 
      return; 
    }
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

  if (!process.env.VERCEL && process.env.NODE_ENV !== "development") {
    serveStatic(app);
    const port = parseInt(process.env.PORT || "3000");
    // Bind the port FIRST so Render's port scanner always sees an open port,
    // even if later startup work (DB hygiene, collectors) fails.
    app.listen(port, () => {
      logger.info(`[Startup] Server listening on 0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV})`);
    });
    // Non-critical startup work - fully isolated so a failure can never
    // take the server (and its open port) down.
    (async () => {
      try { startTickCollector(); } catch (e) { logger.error("[startup] startTickCollector failed", { error: String(e) }); }
      try { startAlwaysOnScanner(); } catch (e) { logger.error("[startup] startAlwaysOnScanner failed", { error: String(e) }); }
      try { await ensureSessionsTable(); } catch (e) { logger.error("[startup] ensureSessionsTable failed", { error: String(e) }); }
      try { await ensureUsersColumns(); } catch (e) { logger.error("[startup] ensureUsersColumns failed", { error: String(e) }); }
      try { await ensureSignalsTable(); } catch (e) { logger.error("[startup] ensureSignalsTable failed", { error: String(e) }); }
      try { await ensureSignalExpiryColumn(); } catch (e) { logger.error("[startup] ensureSignalExpiryColumn failed", { error: String(e) }); }
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


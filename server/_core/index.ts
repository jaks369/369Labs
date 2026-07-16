import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";
import { getDb } from "../db";
import { startTickCollector } from "../tickCollector";
import { runWatch } from "../signalScanner";
import { ENV } from "./env";

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

  const db = await getDb();
  if (!db) {
    console.error(
      "[Startup] Database is not available. API endpoints requiring the database will fail."
    );
  }

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);

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
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
      startTickCollector();
      startAlwaysOnScanner();
    });
  }

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
      const users = await db.select().from(users);
      for (const u of users) {
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

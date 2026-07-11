import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";

export async function createApp() {
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
    });
  }

  return app;
}

const appPromise = createApp();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};

// Global safety net: log the full error for ANY uncaught exception or
// unhandled promise rejection, so Vercel's logs show the real cause instead
// of a bare 500 with no detail.
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

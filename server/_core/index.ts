import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./staticServe";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function createApp() {
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

  if (process.env.NODE_ENV === "development") {
    // Local dev only: run a real listening server with Vite's dev middleware.
    const server = createServer(app);
    const { setupVite } = await import("./vite");
    await setupVite(app, server);

    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  } else {
    // Production without Vercel (e.g. `pnpm start` on a plain server/VM):
    // serve the built static frontend and bind to a port ourselves.
    if (!process.env.VERCEL) {
      serveStatic(app);
      const port = parseInt(process.env.PORT || "3000");
      app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}/`);
      });
    }
    // On Vercel, static assets are served natively via vercel.json's
    // filesystem routing — this handler only needs to serve /api requests.
  }

  return app;
}

const appPromise = createApp();

// Vercel invokes this export as a request handler for every /api request.
// Locally (dev or plain `pnpm start`), createApp() above already started
// a real listening server, so this export is simply unused in that case.
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};

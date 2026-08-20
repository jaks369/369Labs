import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  // In dev (tsx): import.meta.dirname = server/_core/
  // In prod (bundled in dist/index.js): import.meta.dirname = dist/
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.warn(
      `[Static] Build directory not found: ${distPath}. ` +
      `Run 'pnpm build' to build the frontend for production.`
    );
    return;
  }

  // index.html contains hashed asset URLs — must never be cached or a deploy
  // will serve stale HTML referencing old chunk filenames (502s / blank page).
  app.use("/index.html", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.use(express.static(distPath));

  // SPA catch-all: serve index.html for client-side routes.
  // Also no-cache so the latest hashed asset URLs are always used.
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

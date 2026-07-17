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

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

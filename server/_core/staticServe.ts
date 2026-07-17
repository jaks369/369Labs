import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Vite builds to dist/public. The location varies depending on the working
  // directory the server is started from, so try the likely candidates.
  const candidates = [
    path.resolve(import.meta.dirname, "../../dist/public"),
    path.resolve(import.meta.dirname, "../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "src/dist/public"),
    path.resolve(__dirname, "../../dist/public"),
  ];

  const distPath = candidates.find((p) => fs.existsSync(p));

  if (!distPath) {
    throw new Error(
      `Could not find the build directory: tried ${candidates.join(", ")}. ` +
        `Make sure to build the client first (pnpm build).`
    );
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

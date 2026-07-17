import * as fs from "fs";
import * as path from "path";

// Project root: when running on Render the cwd is the repo root.
const ROOT = process.cwd();

function safeResolve(p: string): string {
  const resolved = path.resolve(ROOT, p);
  // Prevent path traversal outside the repo root.
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error("Path escapes project root");
  }
  return resolved;
}

// Files we allow the coding agent to touch (avoid secrets / deps).
const ALLOWED = /^(client\/|server\/|shared\/|drizzle\/|render\.yaml|package\.json|tsconfig\.json)/;

export function listFiles(dir: string = "."): string[] {
  const abs = safeResolve(dir);
  const out: string[] = [];
  const walk = (d: string, prefix: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".cache") || e.name === "build" || e.name === "dist") continue;
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (ALLOWED.test(rel)) out.push(rel);
    }
  };
  walk(abs, "");
  return out.sort();
}

export function readFile(p: string): string {
  if (!ALLOWED.test(p)) throw new Error("File not allowed");
  return fs.readFileSync(safeResolve(p), "utf8");
}

export function writeFile(p: string, content: string): void {
  if (!ALLOWED.test(p)) throw new Error("File not allowed");
  fs.writeFileSync(safeResolve(p), content, "utf8");
}

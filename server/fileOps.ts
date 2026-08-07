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
  return fs.readFileSync(assertAllowedPath(p), "utf8");
}

export function writeFile(p: string, content: string): void {
  fs.writeFileSync(assertAllowedPath(p), content, "utf8");
}

// Validate an allowlisted path AFTER resolving it. The regex allowlist alone was
// bypassable: "client/../.env" passes ^(client/) but resolves to ROOT/.env. So we
// resolve the path first and check the resolved relative path against the allowlist.
export function assertAllowedPath(p: string): string {
  const resolved = safeResolve(p);
  const rel = path.relative(ROOT, resolved).split(path.sep).join("/");
  if (!ALLOWED.test(rel)) {
    throw new Error("File not allowed");
  }
  return resolved;
}

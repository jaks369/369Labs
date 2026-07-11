// Thin catch-all wrapper: Vercel auto-detects files under /api as
// serverless functions with zero extra config, sidestepping the legacy
// "builds" array's isolated-build-environment problem entirely.
// This just re-exports the fully-bundled Express handler that "npm run
// build" already produces at dist/index.js — one shared build step,
// no separate builder trying to guess where the other one's output went.
import handler from "../dist/index.js";
export default handler;

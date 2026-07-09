#!/usr/bin/env tsx
/**
 * orchestrator.ts — free-tier multi-agent pipeline for 369Labs
 * ---------------------------------------------------------------
 * Replaces Ruflo's Claude-Code-native orchestration with a DIY
 * sequential pipeline that runs entirely through OpenCode CLI,
 * using a different free-tier model per role. This avoids Gemini
 * CLI's tight free quota (20 requests/day) entirely — everything
 * goes through OpenCode's own free model catalog instead.
 *
 *   Planner    -> opencode/deepseek-v4-flash-free
 *   Researcher -> opencode/mimo-v2.5-free       (optional, --research flag)
 *   Builder    -> opencode/north-mini-code-free  (code-focused)
 *   Reviewer   -> opencode/nemotron-3-ultra-free
 *
 * Using a different model per role also spreads load across separate
 * quota buckets, so one role hitting its daily limit doesn't necessarily
 * block the others.
 *
 * Requirements (install separately, not covered here):
 *   - OpenCode CLI: curl -fsSL https://opencode.ai/install | bash
 *   Run `opencode models` to see what's actually free/available on your
 *   account — model names and availability change, so treat the defaults
 *   below as a starting point, not gospel.
 *
 * Usage:
 *   tsx orchestrator.ts "Add a stop-loss field to the trade form"
 *   tsx orchestrator.ts "..." --research              # run Researcher first
 *   tsx orchestrator.ts "..." --skip-review            # skip Reviewer step
 *   tsx orchestrator.ts "..." --planner-model opencode/hy3-free
 *   tsx orchestrator.ts "..." --builder-model nvidia/qwen/qwen2.5-coder-32b-instruct
 *   tsx orchestrator.ts "..." --reviewer-model opencode/big-pickle
 *   tsx orchestrator.ts "..." --dry-run                # print commands only
 *
 * All artifacts (plan, research notes, build log, review notes) are
 * written to ./orchestrator-runs/<timestamp>/ so you have a paper trail
 * even though there's no Ruflo memory layer behind this.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Config — run `opencode models` and adjust these if any stop being free
// or available on your account.
// ---------------------------------------------------------------------------

const CONFIG = {
  bin: "opencode",
  models: {
    planner: "opencode/deepseek-v4-flash-free",
    researcher: "opencode/mimo-v2.5-free",
    builder: "opencode/north-mini-code-free",
    reviewer: "opencode/nemotron-3-ultra-free",
  },
  runsDir: "./orchestrator-runs",
  retry: {
    maxAttempts: 4,
    // Base delay in ms; doubles each attempt (1s, 2s, 4s, 8s...).
    baseDelayMs: 1000,
  },
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const goal = args.find((a) => !a.startsWith("--"));
const flags = new Set(args.filter((a) => a.startsWith("--")));
const dryRun = flags.has("--dry-run");
const doResearch = flags.has("--research");
const skipReview = flags.has("--skip-review");

function applyModelOverride(flagName: string, key: keyof typeof CONFIG.models) {
  const idx = args.indexOf(flagName);
  if (idx !== -1 && args[idx + 1]) {
    CONFIG.models[key] = args[idx + 1];
  }
}
applyModelOverride("--planner-model", "planner");
applyModelOverride("--researcher-model", "researcher");
applyModelOverride("--builder-model", "builder");
applyModelOverride("--reviewer-model", "reviewer");

if (!goal) {
  console.error(
    'Usage: tsx orchestrator.ts "<your goal>" [--research] [--skip-review] [--planner-model p/m] [--builder-model p/m] [--reviewer-model p/m] [--dry-run]'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run directory setup
// ---------------------------------------------------------------------------

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = join(CONFIG.runsDir, timestamp);
if (!dryRun) {
  mkdirSync(runDir, { recursive: true });
}

function saveArtifact(name: string, content: string) {
  if (dryRun) return;
  writeFileSync(join(runDir, name), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Agent runner — single function, all roles go through OpenCode
// ---------------------------------------------------------------------------

/** Calls OpenCode CLI headlessly with a given model and returns stdout. Retries on transient errors. */
async function runAgent(prompt: string, model: string, label: string): Promise<string> {
  const cliArgs = ["run", "--model", model, prompt];

  console.log(`\n[${label}] -> opencode run --model ${model} "${truncate(prompt)}"`);
  if (dryRun) return `[dry-run] would call opencode (${model}) for ${label}`;

  return withRetry(label, () =>
    execFileSync(CONFIG.bin, cliArgs, { encoding: "utf-8", maxBuffer: 1024 * 1024 * 20 })
  );
}

function truncate(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a synchronous CLI call with exponential backoff. Handles transient
 * failures — 503s, rate limits, brief network blips — that are common on
 * free-tier endpoints and NOT a sign anything is misconfigured. Daily quota
 * exhaustion (429 "exhausted your daily quota") is NOT retried — that only
 * resolves on a reset cycle, so retrying just burns time.
 */
async function withRetry<T>(label: string, fn: () => T): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CONFIG.retry.maxAttempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);

      const isDailyQuotaExhausted = /exhausted your daily quota|quota exceeded/i.test(message);
      if (isDailyQuotaExhausted) {
        console.error(
          `\n[${label}] daily quota exhausted on this model — not retrying. Try a different model with --${label.toLowerCase()}-model, or wait for reset.`
        );
        throw err;
      }

      const isRetryable = /503|UNAVAILABLE|high demand|fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(
        message
      );

      if (!isRetryable || attempt === CONFIG.retry.maxAttempts) {
        console.error(`\n[${label}] failed on attempt ${attempt}, not retrying further.`);
        throw err;
      }

      const delay = CONFIG.retry.baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `\n[${label}] attempt ${attempt} failed (${truncate(message, 120)}). Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
  // Unreachable, but keeps TypeScript happy.
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Orchestrator run: ${timestamp} ===`);
  console.log(`Goal: ${goal}\n`);

  let researchNotes = "";
  if (doResearch) {
    researchNotes = await runAgent(
      `You are a Researcher agent. Gather relevant background, prior art, and constraints for this task. Be concise, use bullet points.\n\nTask: ${goal}`,
      CONFIG.models.researcher,
      "Researcher"
    );
    saveArtifact("01-research.md", researchNotes);
    console.log(`Research notes saved (${researchNotes.length} chars).`);
  }

  // --- Planner ---------------------------------------------------------
  const planPrompt = `You are a Planner agent. Break the following goal into a clear, numbered, actionable implementation plan for a coding agent to follow. Be specific about files and functions where possible.${
    researchNotes ? `\n\nResearch notes:\n${researchNotes}` : ""
  }\n\nGoal: ${goal}`;
  const plan = await runAgent(planPrompt, CONFIG.models.planner, "Planner");
  saveArtifact("02-plan.md", plan);
  console.log(`Plan saved (${plan.length} chars).`);

  // --- Builder -----------------------------------------------------------
  const buildPrompt = `You are a Builder agent working in the current repository. Implement the following plan. Make the necessary file edits directly. Report a summary of what you changed at the end.\n\nPlan:\n${plan}`;
  const buildLog = await runAgent(buildPrompt, CONFIG.models.builder, "Builder");
  saveArtifact("03-build-log.txt", buildLog);
  console.log(`Build log saved (${buildLog.length} chars).`);

  // --- Reviewer ------------------------------------------------------------
  if (!skipReview) {
    const reviewPrompt = `You are a Reviewer agent. Review the following build log against the original plan and goal. Flag anything incomplete, risky, or inconsistent with the plan. Be specific.\n\nGoal: ${goal}\n\nPlan:\n${plan}\n\nBuild log:\n${buildLog}`;
    const review = await runAgent(reviewPrompt, CONFIG.models.reviewer, "Reviewer");
    saveArtifact("04-review.md", review);
    console.log(`Review saved (${review.length} chars).`);
    console.log(`\n--- Reviewer summary ---\n${review}\n`);
  }

  console.log(
    dryRun
      ? "\nDry run complete — no commands were actually executed."
      : `\nDone. Artifacts written to: ${runDir}`
  );
}

main().catch((err) => {
  console.error("Orchestrator failed:", err.message ?? err);
  process.exit(1);
});

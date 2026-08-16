/**
 * Ledger reconciler — LIVE DRY RUN (no writes to `trades`).
 *
 * Reads DATABASE_URL from .env, then:
 *   1. ensures the M0/M1 schema (columns + reconcilerRuns table) exists remotely,
 *   2. prints the per-user A/B/C classification counts for the first sweep batch,
 *   3. optionally runs the sweep for a single userId.
 *
 * This is a dry run: reconcileUser(dryRun=true) logs counts and mutates nothing.
 * The only DB write is the reconcilerRuns audit row (spec M1: "log counts").
 *
 * Usage:
 *   npx tsx scripts/recon-dryrun.ts                 # full sweep, batch-limited
 *   npx tsx scripts/recon-dryrun.ts --userId 123    # single user
 */
import "dotenv/config";

async function main() {
  const userIdArg = process.argv.indexOf("--userId");
  const onlyUserId = userIdArg !== -1 ? Number(process.argv[userIdArg + 1]) : null;

  console.log(`\n=== Ledger reconciler DRY RUN ===\n`);
  console.log(`DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
  console.log(`Target user: ${onlyUserId ?? "all (batch-limited)"}\n`);
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is missing in .env");
    process.exit(1);
  }

  const { getDb, ensureTradesLedgerColumns, ensureTradesContractIndex, ensureReconcilerRunsTable, getReconcilerRuns, getUsersWithActiveTokens } = await import("../server/db");
  const { reconcileUser, runFullSweep, SWEEP_BATCH_SIZE } = await import("../server/reconciliation");

  // ensure* helpers are no-ops until the pool exists; force DB connection first.
  const db = await getDb();
  if (!db) {
    console.error("FATAL: could not connect to the database");
    process.exit(1);
  }

  console.log("[1/4] Applying idempotent schema migrations (safe, no-op if present)…");
  await ensureTradesLedgerColumns().catch((e) => console.error("  ledger columns failed:", e.message));
  await ensureTradesContractIndex().catch((e) => console.error("  contract index failed:", e.message));
  await ensureReconcilerRunsTable().catch((e) => console.error("  reconcilerRuns table failed:", e.message));

  const users = await getUsersWithActiveTokens();
  console.log(`Users with active Deriv tokens: ${users.length}${onlyUserId ? ` (filtering to ${onlyUserId})` : ""}\n`);

  let counts;
  if (onlyUserId) {
    counts = await reconcileUser(onlyUserId, true);
    console.log(`\n— reconcileUser(${onlyUserId}, dryRun=true) —\n`);
  } else {
    console.log(`[2/4] Batch-limited sweep (SWEEP_BATCH_SIZE=${SWEEP_BATCH_SIZE})…\n`);
    counts = await runFullSweep({ dryRun: true });
    console.log(`\n— runFullSweep({ dryRun: true }) totals —\n`);
  }

  const rows = [
    ["reconstructed (B orphans proposal)", counts.reconstructed],
    ["settled now (A sold)", counts.settled],
    ["marked-stuck candidates (C, past grace)", counts.stuck],
    ["pending but maturing (under grace)", counts.pendingMatched],
    ["skipped (no token)", counts.skippedNoToken],
    ["errors", counts.errors],
  ];
  console.table(rows);

  console.log("\n[3/4] Recent reconcilerRuns audit rows\n");
  const runs = await getReconcilerRuns(5);
  if (runs.length === 0) console.log("  (none yet)");
  for (const r of runs) {
    console.log(`  #${r.id} ${r.runStart} → ${r.runEnd ?? "…"} actions=${JSON.stringify(r.actions)}`);
  }

  console.log("\n[4/4] DONE. Dry run only — `trades` rows were NOT mutated.\n");
  console.log("Next: review counts above, then commit M0+M1 and flip the loop to write mode in M2.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nDRY RUN FAILED:", e);
  process.exit(1);
});
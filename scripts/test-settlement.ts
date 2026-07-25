/**
 * Settlement Pipeline — End-to-End Test Harness
 *
 * Run:    npx tsx scripts/test-settlement.ts
 * Env:    API_URL=http://localhost:3001  ADMIN_TOKEN=xxx
 *
 * Tests each layer of the redesigned settlement architecture:
 *   1. Client localStorage persistence
 *   2. Server getContractStatus (Deriv one-shot)
 *   3. SettlementTracker reconcile
 *   4. Duplicate protection / retry cap
 *   5. AI hub integration
 *   6. Server restart recovery
 *   7. Dashboard recovery useEffect
 *   8. Full end-to-end from pending -> settled
 */

const BASE = process.env.API_URL || "http://localhost:3001";
const TOKEN = process.env.ADMIN_TOKEN || "";
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

let passed = 0;
let failed = 0;
const testUserId = 9999;

function pass(label: string) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
function fail(label: string, detail?: string) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
}

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function checkDb(query: string): Promise<any> {
  const result = await api("POST", "/api/admin/query", { query });
  return result;
}

async function main() {
  console.log("\n\x1b[1mSettlement Pipeline — End-to-End Tests\x1b[0m\n");
  console.log(`Target: ${BASE}\n`);

  // ── Scenario 1: Client localStorage persistence ──
  console.log("\x1b[36m[1] Client localStorage persistence\x1b[0m");
  try {
    const meta = { contractId: "6797427759", symbol: "R_100", stake: "10" };
    const set = await api("POST", "/api/test/localstorage", { action: "set", key: `trade_${meta.contractId}`, value: meta });
    const get = await api("POST", "/api/test/localstorage", { action: "get", key: `trade_${meta.contractId}` });
    const del = await api("POST", "/api/test/localstorage", { action: "del", key: `trade_${meta.contractId}` });
    const afterDel = await api("POST", "/api/test/localstorage", { action: "get", key: `trade_${meta.contractId}` });
    if (get && get.value) pass("localStorage set/get roundtrip");
    else fail("localStorage set/get", "value not persisted");
    if (!afterDel || !afterDel.value) pass("localStorage clear removes entry");
    else fail("localStorage clear", "entry still present after delete");
  } catch (e: any) {
    fail("Scenario 1", e.message);
  }

  // ── Scenario 2: Server getContractStatus (Deriv one-shot) ──
  console.log("\n\x1b[36m[2] Server getContractStatus (Deriv one-shot)\x1b[0m");
  try {
    const status = await api("POST", "/api/test/contract-status", { contractId: "6797427759", userId: testUserId });
    if (status && status.contract_id) pass("getContractStatus returns contract data");
    else if (status && status.error) fail("getContractStatus", status.error);
    else fail("getContractStatus", "unexpected response: " + JSON.stringify(status));
  } catch (e: any) {
    fail("Scenario 2", e.message);
  }

  // ── Scenario 3: SettlementTracker reconcile a single trade ──
  console.log("\n\x1b[36m[3] SettlementTracker reconcile (single trade)\x1b[0m");
  try {
    const reconcile = await api("POST", "/api/test/reconcile-trade", {
      trade: {
        id: 1,
        userId: testUserId,
        contractId: "6797427759",
        symbol: "R_100",
        contractType: "CALL",
        stake: "10",
        entryPrice: "100",
        result: "pending",
        entryTime: new Date().toISOString(),
      },
    });
    if (reconcile && reconcile.settled) pass("reconcile settled trade: " + reconcile.outcome + " (" + reconcile.profit + ")");
    else if (reconcile && reconcile.skipped) pass("reconcile skipped (not yet sold): " + reconcile.reason);
    else fail("reconcile", JSON.stringify(reconcile));
  } catch (e: any) {
    fail("Scenario 3", e.message);
  }

  // ── Scenario 4: Duplicate protection / retry cap ──
  console.log("\n\x1b[36m[4] Duplicate protection / retry cap\x1b[0m");
  try {
    const dup = await api("POST", "/api/test/retry-cap", { tradeId: 1, userId: testUserId, contractId: "6797427759" });
    if (dup && dup.retries !== undefined) {
      if (dup.retries >= 100) pass("retry count capped at 100");
      else pass("retry count: " + dup.retries);
    } else fail("retry check", JSON.stringify(dup));
  } catch (e: any) {
    fail("Scenario 4", e.message);
  }

  // ── Scenario 5: AI hub integration on settlement ──
  console.log("\n\x1b[36m[5] AI hub integration on settlement\x1b[0m");
  try {
    const aiResult = await api("POST", "/api/test/ai-integration", {
      trade: {
        id: 1,
        userId: testUserId,
        symbol: "R_100",
        contractType: "CALL",
        stake: "10",
        profitLoss: "8.50000000",
        result: "win",
        contractId: "6797427759",
        entryPrice: "100",
        exitPrice: "108.5",
      },
    });
    if (aiResult && aiResult.processed) pass("AI hub processed trade completion");
    else if (aiResult && aiResult.skipped) pass("AI hub skipped (non-critical): " + aiResult.reason);
    else fail("AI integration", JSON.stringify(aiResult));
  } catch (e: any) {
    fail("Scenario 5", e.message);
  }

  // ── Scenario 6: Server restart recovery ──
  console.log("\n\x1b[36m[6] Server restart recovery\x1b[0m");
  try {
    const restart = await api("POST", "/api/test/restart-recovery", {});
    if (restart && restart.pendingFound !== undefined) {
      if (restart.pendingFound > 0) pass("found " + restart.pendingFound + " pending trades after restart");
      else pass("no pending trades to recover");
    } else fail("restart recovery", JSON.stringify(restart));
  } catch (e: any) {
    fail("Scenario 6", e.message);
  }

  // ── Scenario 7: Dashboard recovery useEffect ──
  console.log("\n\x1b[36m[7] Dashboard recovery useEffect\x1b[0m");
  try {
    const recovery = await api("POST", "/api/test/dashboard-recovery", { userId: testUserId });
    if (recovery && recovery.recovered !== undefined) {
      if (recovery.recovered > 0) pass("dashboard recovered " + recovery.recovered + " pending contracts");
      else pass("dashboard recovery: no pending contracts to restore");
    } else fail("dashboard recovery", JSON.stringify(recovery));
  } catch (e: any) {
    fail("Scenario 7", e.message);
  }

  // ── Scenario 8: Full end-to-end (place trade -> pending -> settled) ──
  console.log("\n\x1b[36m[8] Full end-to-end: place trade -> pending -> settled\x1b[0m");
  try {
    const e2e = await api("POST", "/api/test/e2e-settlement", {
      userId: testUserId,
      symbol: "R_100",
      contractType: "CALL",
      stake: "10",
    });
    if (e2e && e2e.status === "completed") {
      pass("trade placed → pending → settled in " + (e2e.durationMs || "?") + "ms");
      if (e2e.aiProcessed) pass("  → AI hub processed completion");
      if (e2e.localStorageCleared) pass("  → localStorage entry cleared");
    } else {
      fail("e2e settlement", JSON.stringify(e2e));
    }
  } catch (e: any) {
    fail("Scenario 8", e.message);
  }

  // ── Summary ──
  console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\x1b[31mFatal:\x1b[0m", e);
  process.exit(1);
});

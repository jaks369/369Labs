/**
 * TiDB migration tool — works without mysqldump/mysql CLI (uses mysql2).
 *
 *   node scripts/db-migrate.cjs export   # reads SOURCE_DATABASE_URL -> ./db-dump.json
 *   node scripts/db-migrate.cjs import   # reads TARGET_DATABASE_URL + db-dump.json -> writes data
 *   node scripts/db-migrate.cjs verify   # reads TARGET_DATABASE_URL -> prints row counts per table
 *
 * Env vars (set in PowerShell before running):
 *   $env:SOURCE_DATABASE_URL = "mysql://user:pass@host:4000/dbname"
 *   $env:TARGET_DATABASE_URL = "mysql://user:pass@host:4000/dbname"
 *
 * Order-safe: tables exported/imported with parents before children (FK order),
 * foreign key checks disabled during import, batches of 200 rows.
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 4000),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  };
}

async function withConn(url, fn) {
  const conn = await mysql.createConnection(parseUrl(url));
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

// Tables that reference others — imported last.
const PRIORITY = ["users", "sessions", "strategies", "botRuns"];

async function listTables(conn) {
  const [rows] = await conn.query(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const names = rows.map((r) => r.name || r.TABLE_NAME || r.table_name);
  // Stable order: priority tables first, rest alphabetical.
  names.sort((a, b) => {
    const ia = PRIORITY.indexOf(a); const ib = PRIORITY.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a < b ? -1 : 1;
  });
  return names;
}

async function cmdExport() {
  const url = process.env.SOURCE_DATABASE_URL;
  if (!url) throw new Error("Set SOURCE_DATABASE_URL first");
  await withConn(url, async (conn) => {
    // Quota-restricted clusters may reject queries entirely — surface it clearly.
    const tables = await listTables(conn);
    console.log(`Exporting ${tables.length} tables: ${tables.join(", ")}`);
    const dump = { exportedAt: new Date().toISOString(), tables: {} };
    for (const t of tables) {
      const [[create]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      const createSql = Object.values(create).find((v) => typeof v === "string" && v.includes("CREATE TABLE"));
      const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
      dump.tables[t] = { create: createSql, rows };
      console.log(`  ${t}: ${rows.length} rows`);
    }
    const out = path.join(process.cwd(), "db-dump.json");
    fs.writeFileSync(out, JSON.stringify(dump));
    console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
  });
}

async function cmdImport() {
  const url = process.env.TARGET_DATABASE_URL;
  const file = path.join(process.cwd(), "db-dump.json");
  if (!url) throw new Error("Set TARGET_DATABASE_URL first");
  if (!fs.existsSync(file)) throw new Error("db-dump.json not found — run export first");
  const dump = JSON.parse(fs.readFileSync(file, "utf8"));
  await withConn(url, async (conn) => {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const [t, def] of Object.entries(dump.tables)) {
      if (def.create) {
        try {
          await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
          await conn.query(def.create.replace(/CREATE TABLE/, "CREATE TABLE IF NOT EXISTS"));
        } catch (e) {
          console.warn(`  ${t}: create skipped (${e.message})`);
        }
      }
      const rows = def.rows || [];
      if (rows.length === 0) { console.log(`  ${t}: 0 rows`); continue; }
      const cols = Object.keys(rows[0]);
      const colSql = cols.map((c) => `\`${c}\``).join(",");
      const placeholders = `(${cols.map(() => "?").join(",")})`;
      const BATCH = 200;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const values = batch.map((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
        await conn.query(`INSERT INTO \`${t}\` (${colSql}) VALUES ${batch.map(() => placeholders).join(",")}`, values.flat());
        inserted += batch.length;
      }
      console.log(`  ${t}: inserted ${inserted} rows`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
    console.log("Import complete.");
  });
}

async function cmdVerify() {
  const url = process.env.TARGET_DATABASE_URL;
  if (!url) throw new Error("Set TARGET_DATABASE_URL first");
  await withConn(url, async (conn) => {
    const tables = await listTables(conn);
    let totalRows = 0;
    for (const t of tables) {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      totalRows += n;
      console.log(`  ${t}: ${n}`);
    }
    console.log(`TOTAL rows: ${totalRows} across ${tables.length} tables`);
  });
}

const cmd = process.argv[2];
Promise.resolve()
  .then(() => {
    if (cmd === "export") return cmdExport();
    if (cmd === "import") return cmdImport();
    if (cmd === "verify") return cmdVerify();
    throw new Error("Usage: node scripts/db-migrate.cjs export|import|verify");
  })
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

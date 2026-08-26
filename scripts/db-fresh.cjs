// Drop all tables (fresh-start test). Reads DATABASE_URL from .env.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "");
const u = new URL(url);

(async () => {
  const c = await mysql.createConnection({
    host: u.hostname, port: Number(u.port || 4000),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  });
  await c.query("SET FOREIGN_KEY_CHECKS=0");
  const [ts] = await c.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE'");
  for (const r of ts) {
    const name = r.t || r.TABLE_NAME;
    await c.query(`DROP TABLE IF EXISTS \`${name}\``);
    console.log("dropped", name);
  }
  await c.query("SET FOREIGN_KEY_CHECKS=1");
  console.log("fresh:", ts.length, "tables dropped");
  await c.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

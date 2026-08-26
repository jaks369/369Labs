// One-off: create the app database on the NEW TiDB instance, then verify connectivity.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const raw = process.argv[2];
if (!raw) throw new Error("pass connection string");
// Strip tool-specific ssl fragment; we connect without a default database first.
const url = raw.replace(/\?ssl=.*$/, "").replace(/\/sys$/, "");
const u = new URL(url);

(async () => {
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 4000),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  });
  await conn.query("CREATE DATABASE IF NOT EXISTS `369labs`");
  console.log("database 369labs ready");
  const finalUrl = `${url.split("?")[0].replace(/\/(test|sys)$/, "")}/369labs`;
  // Persist the cleaned URL for next steps
  fs.writeFileSync(path.join(__dirname, "..", ".new-db-url.txt"), finalUrl);
  const [dbs] = await conn.query("SHOW DATABASES");
  console.log("databases:", dbs.map((d) => Object.values(d)[0]).join(", "));
  await conn.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

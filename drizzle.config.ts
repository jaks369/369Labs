import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Parse the URL and build mysql2 connection config with SSL for TiDB Cloud
function parseDbUrl(url: string) {
  const parsed = new URL(url);
  const sslParam = parsed.searchParams.get("ssl");
  
  // Strip ssl param from URL
  parsed.searchParams.delete("ssl");

  const config: Record<string, unknown> = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace("/", ""),
  };

  // TiDB Cloud requires SSL
  if (sslParam || parsed.hostname.includes("tidbcloud.com")) {
    try {
      config.ssl = sslParam ? JSON.parse(sslParam) : { minVersion: "TLSv1.2" };
    } catch {
      config.ssl = { minVersion: "TLSv1.2" };
    }
  }

  return config;
}

const dbConfig = parseDbUrl(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: dbConfig,
});
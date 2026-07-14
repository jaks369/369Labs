import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  const sslParam = parsed.searchParams.get("ssl");
  parsed.searchParams.delete("ssl");

  const config: Record<string, unknown> = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace("/", ""),
  };

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

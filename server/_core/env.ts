export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.OPENAI_API_BASE_URL || process.env.AI_API_BASE_URL || "https://api.openai.com/v1",
  forgeApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
};

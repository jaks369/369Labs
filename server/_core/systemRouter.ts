import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { getDb } from "../db";
import { ENV } from "./env";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      const db = await getDb();
      const checks = {
        database: !!db,
        jwtSecret: !!process.env.JWT_SECRET && process.env.JWT_SECRET !== "",
        encryptionKey: !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY !== "",
        derivToken: !!process.env.DERIV_TOKEN && process.env.DERIV_TOKEN !== "",
        aiApiKey: !!process.env.AI_API_KEY && process.env.AI_API_KEY !== "",
      };
      const healthy = Object.values(checks).every(Boolean);
      return { ok: healthy, status: healthy ? "healthy" : "degraded", checks, timestamp: Date.now() };
    }),
});

import { execSync } from "child_process";
import * as path from "path";

async function seed() {
  console.log("🌱 Seeding 369Labs with sample data...\n");

  // Use curl against the API to create sample data
  const BASE = process.env.API_URL || "http://localhost:3001";
  const TOKEN = process.env.ADMIN_TOKEN || "";

  const headers = `Content-Type: application/json${TOKEN ? `,Authorization: Bearer ${TOKEN}` : ""}`;

  const call = (method: string, url: string, body?: any) => {
    const data = body ? `-d '${JSON.stringify(body)}'` : "";
    try {
      const result = execSync(`curl -s -X ${method} ${data} -H "${headers}" "${BASE}${url}"`, { encoding: "utf-8", timeout: 10000 });
      console.log(`  ✓ ${method} ${url}`);
      return JSON.parse(result);
    } catch (e: any) {
      console.log(`  ✗ ${method} ${url} — ${e.message?.slice(0, 80) || "failed"}`);
      return null;
    }
  };

  // 1. Register a test user
  const user = call("POST", "/api/auth/register", { email: "demo@369labs.com", password: "Demo123!@#", name: "Demo Trader" });
  if (user) console.log("    → demo@369labs.com / Demo123!@#\n");

  // 2. Create sample strategies
  call("POST", "/api/strategies", {
    name: "Momentum Crossover",
    type: "momentum",
    rules: [{ condition: "fastMA > slowMA", action: "buy" }, { condition: "fastMA < slowMA", action: "sell" }],
    config: { fastPeriod: 10, slowPeriod: 30, symbol: "R_100", stake: 10 },
  });

  call("POST", "/api/strategies", {
    name: "Mean Reversion",
    type: "mean_reversion",
    rules: [{ condition: "price < bollinger_lower", action: "buy" }, { condition: "price > bollinger_upper", action: "sell" }],
    config: { period: 20, stdDev: 2, symbol: "R_50", stake: 5 },
  });

  // 3. Create sample trades
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    const entry = now - (i * 3600000);
    const exit = entry + Math.random() * 1800000;
    const profit = (Math.random() - 0.4) * 20;
    call("POST", "/api/trades", {
      symbol: i % 2 === 0 ? "R_100" : "R_50",
      direction: Math.random() > 0.5 ? "buy" : "sell",
      entryPrice: (Math.random() * 100 + 50).toFixed(4),
      exitPrice: (Math.random() * 100 + 50).toFixed(4),
      stake: 10,
      profit: Number(profit.toFixed(2)),
      entryTime: new Date(entry).toISOString(),
      exitTime: new Date(exit).toISOString(),
      strategyName: i % 2 === 0 ? "Momentum Crossover" : "Mean Reversion",
    });
  }

  console.log("\n✅ Seed complete! Log in with demo@369labs.com / Demo123!@#");
}

seed().catch(console.error);

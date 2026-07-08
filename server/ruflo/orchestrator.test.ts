import { describe, expect, it } from "vitest";
import { getRuFloAgent, rufloConfig } from "./config";
import { listRuFloAgents } from "./orchestrator";

describe("RuFlo configuration", () => {
  it("has a valid default agent", () => {
    const agent = getRuFloAgent(rufloConfig.defaultAgent);

    expect(agent.id).toBe(rufloConfig.defaultAgent);
    expect(agent.systemPrompt.length).toBeGreaterThan(50);
  });

  it("lists agents with explicit handoff configuration", () => {
    const agents = listRuFloAgents();

    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(agents.every(agent => Array.isArray(agent.handoffs))).toBe(true);
  });

  it("rejects unknown agents", () => {
    expect(() => getRuFloAgent("unknown-agent")).toThrow("Unknown RuFlo agent");
  });
});

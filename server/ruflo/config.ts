export type RuFloAgentId =
  | "strategy-architect"
  | "risk-reviewer"
  | "deriv-execution"
  | "support-triage";

export type RuFloAgent = {
  id: RuFloAgentId;
  name: string;
  purpose: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  handoffs: RuFloAgentId[];
};

export type RuFloConfig = {
  name: string;
  defaultAgent: RuFloAgentId;
  provider: {
    apiUrlEnv: "RUFLO_API_URL" | "OPENAI_API_URL";
    apiKeyEnv: "RUFLO_API_KEY" | "OPENAI_API_KEY";
    modelEnv: "RUFLO_MODEL";
    defaultApiUrl: string;
    defaultModel: string;
  };
  agents: Record<RuFloAgentId, RuFloAgent>;
};

const defaultModel = "gpt-4.1-mini";

export const rufloConfig: RuFloConfig = {
  name: "369Labs RuFlo Agent Orchestration",
  defaultAgent: "strategy-architect",
  provider: {
    apiUrlEnv: "RUFLO_API_URL",
    apiKeyEnv: "RUFLO_API_KEY",
    modelEnv: "RUFLO_MODEL",
    defaultApiUrl: "https://api.openai.com/v1",
    defaultModel,
  },
  agents: {
    "strategy-architect": {
      id: "strategy-architect",
      name: "Strategy Architect",
      purpose: "Convert trading ideas into structured Deriv bot strategy plans.",
      model: defaultModel,
      temperature: 0.2,
      handoffs: ["risk-reviewer", "deriv-execution"],
      systemPrompt:
        "You are the 369Labs Strategy Architect agent. Produce concise, structured strategy plans for Deriv trading bots. " +
        "Use only the strategy concepts currently supported by the app unless you clearly label an item as future work. " +
        "Prefer executable IF/THEN logic with symbol, condition, action, stake, stop loss, and take profit.",
    },
    "risk-reviewer": {
      id: "risk-reviewer",
      name: "Risk Reviewer",
      purpose: "Review generated strategies for risk, ambiguity, and unsafe assumptions.",
      model: defaultModel,
      temperature: 0.1,
      handoffs: ["strategy-architect"],
      systemPrompt:
        "You are the 369Labs Risk Reviewer agent. Review trading bot strategies for risk controls, ambiguity, unsupported behavior, " +
        "over-leverage, missing stop loss, and mismatch between conditions and trade actions. Be direct and conservative.",
    },
    "deriv-execution": {
      id: "deriv-execution",
      name: "Deriv Execution Planner",
      purpose: "Map approved strategy plans onto Deriv-compatible execution details.",
      model: defaultModel,
      temperature: 0.1,
      handoffs: ["risk-reviewer"],
      systemPrompt:
        "You are the 369Labs Deriv Execution Planner agent. Map approved strategy logic to Deriv symbols and contract-style actions. " +
        "Call out anything the existing bot engine cannot execute yet. Do not claim trades were placed.",
    },
    "support-triage": {
      id: "support-triage",
      name: "Support Triage",
      purpose: "Triage user reports and route them to the right product or engineering action.",
      model: defaultModel,
      temperature: 0.2,
      handoffs: ["strategy-architect", "risk-reviewer", "deriv-execution"],
      systemPrompt:
        "You are the 369Labs Support Triage agent. Classify user requests, identify missing setup or environment issues, " +
        "and recommend the next concrete action. Keep responses short and operational.",
    },
  },
};

export function getRuFloAgent(agentId?: string): RuFloAgent {
  const resolvedAgentId = (agentId || rufloConfig.defaultAgent) as RuFloAgentId;
  const agent = rufloConfig.agents[resolvedAgentId];

  if (!agent) {
    throw new Error(`Unknown RuFlo agent "${agentId}". Valid agents: ${Object.keys(rufloConfig.agents).join(", ")}`);
  }

  return agent;
}

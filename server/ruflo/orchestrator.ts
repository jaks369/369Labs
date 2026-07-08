import { rufloConfig, getRuFloAgent, type RuFloAgentId } from "./config.js";

export type RuFloMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RuFloRunInput = {
  agentId?: RuFloAgentId;
  prompt: string;
  context?: string;
};

export type RuFloRunResult = {
  agentId: RuFloAgentId;
  agentName: string;
  model: string;
  output: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
};

function readEnv(primary: string, fallback?: string): string {
  return process.env[primary] || (fallback ? process.env[fallback] || "" : "");
}

function resolveProvider() {
  const apiUrl =
    readEnv(rufloConfig.provider.apiUrlEnv, "OPENAI_API_URL") ||
    rufloConfig.provider.defaultApiUrl;
  const apiKey = readEnv(rufloConfig.provider.apiKeyEnv, "OPENAI_API_KEY");
  const model = process.env[rufloConfig.provider.modelEnv] || rufloConfig.provider.defaultModel;

  if (!apiKey) {
    throw new Error("RuFlo requires RUFLO_API_KEY or OPENAI_API_KEY.");
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    apiKey,
    model,
  };
}

function extractText(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => part.text ?? "").join("");

  return "";
}

export async function runRuFlo(input: RuFloRunInput): Promise<RuFloRunResult> {
  const agent = getRuFloAgent(input.agentId);
  const provider = resolveProvider();
  const model = process.env.RUFLO_MODEL || agent.model || provider.model;

  const messages: RuFloMessage[] = [
    { role: "system", content: agent.systemPrompt },
    ...(input.context ? [{ role: "user" as const, content: `Context:\n${input.context}` }] : []),
    { role: "user", content: input.prompt },
  ];

  const response = await fetch(`${provider.apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: agent.temperature,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RuFlo provider request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const output = extractText(data).trim();

  if (!output) {
    throw new Error("RuFlo provider returned an empty response.");
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    model,
    output,
  };
}

export function listRuFloAgents() {
  return Object.values(rufloConfig.agents).map(agent => ({
    id: agent.id,
    name: agent.name,
    purpose: agent.purpose,
    handoffs: agent.handoffs,
  }));
}
